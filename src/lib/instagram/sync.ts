import type { Types } from "mongoose";
import { encrypt } from "@/lib/crypto";
import { toObjectId } from "@/lib/tenant";
import Post from "@/models/Post";
import SocialAccount from "@/models/SocialAccount";
import { InstagramAccountDaily, InstagramMedia, InstagramMediaDaily } from "@/models/InstagramMedia";
import { FriendlyError, accountToken, toFriendly } from "./accounts";
import { InstagramApiError, InstagramClient, type FetchLike, getDefaultFetch } from "./client";
import { addDays, dayKey, dayRangeUnix, formatDateBR } from "./dates";
import {
  FALLBACK_METRICS,
  type MediaMetrics,
  metricsFor,
  parseAccountTotals,
  parseMediaInsights,
  resolveKind,
  resolveProductType,
  withMediaCounters,
} from "./metrics";
import { ensureMock } from "./mock";
import { planTokenAction, renewToken } from "./token";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SyncResult {
  accountId: string;
  username: string;
  ok: boolean;
  media: number;
  matchedPosts: number;
  days: number;
  tokenRenewed: boolean;
  warnings: string[];
  error?: string;
  /** true = busca de histórico (primeira sincronização ou botão "Buscar histórico") */
  history: boolean;
  /** dia (Brasília) até onde os posts já foram buscados */
  mediaSince: string | null;
  /** data do post mais antigo que veio NESTA rodada */
  oldestPost: string | null;
  /** chamadas feitas à Meta nesta rodada */
  calls: number;
  /** por que o histórico parou antes do fim (vazio = foi até o fim) */
  stopped: string;
}

export interface SyncOptions {
  fetchImpl?: FetchLike;
  now?: number;
  /** força a busca de histórico (12 meses de posts + o que a Meta guardar da conta) */
  history?: boolean;
  /** limites de segurança do histórico (os padrões estão logo abaixo) */
  maxCalls?: number;
  maxMedia?: number;
  timeBudgetMs?: number;
}

const DAILY_DAYS = 30; // dias de alcance/views conferidos em toda sincronização
const REFRESH_DAYS = 3; // dias recentes sempre rebuscados (a Meta atrasa até 48h)
// A Meta guarda as métricas da CONTA por até 90 dias (documentação oficial, conferida em 12/10/2026).
export const ACCOUNT_HISTORY_DAYS = 90;
const ACCOUNT_HISTORY_MISSES = 5; // dias seguidos sem dado para desistir de ir mais atrás
export const RECENT_MEDIA_DAYS = 90; // sincronização diária: só os posts recentes (como já era)
export const HISTORY_MEDIA_DAYS = 365; // histórico: até 12 meses de posts
// Limites de segurança do histórico: nunca passar disso numa rodada.
export const HISTORY_MAX_MEDIA = 1000;
export const HISTORY_MAX_CALLS = 1500;
export const HISTORY_TIME_BUDGET_MS = 240_000;
const LEGACY_MEDIA_WINDOW_DAYS = 90; // janela das sincronizações anteriores a este registro

const isLimit = (e: unknown) => e instanceof InstagramApiError && e.kind === "limite";

export async function syncAccount(
  org: Types.ObjectId,
  accountId: string,
  opts: SyncOptions = {}
): Promise<SyncResult> {
  ensureMock();
  const fetchImpl = opts.fetchImpl ?? getDefaultFetch();
  const now = opts.now ?? Date.now();
  const id = toObjectId(accountId);
  const account: any = id ? await SocialAccount.findOne({ _id: id, organization: org }) : null;
  if (!account) throw new FriendlyError("Conta não encontrada.", 404);
  const result: SyncResult = {
    accountId: String(account._id),
    username: account.username || account.accountName,
    ok: false,
    media: 0,
    matchedPosts: 0,
    days: 0,
    tokenRenewed: false,
    warnings: [],
    history: false,
    mediaSince: null,
    oldestPost: null,
    calls: 0,
    stopped: "",
  };
  // Primeira sincronização da conta = histórico. Depois, só quando pedirem.
  const history = opts.history === true || (!account.lastSync && !account.mediaHistorySince);
  result.history = history;
  const startedAt = Date.now();
  const maxCalls = opts.maxCalls ?? HISTORY_MAX_CALLS;
  const timeBudget = opts.timeBudgetMs ?? HISTORY_TIME_BUDGET_MS;
  let client: InstagramClient | null = null;

  try {
    let token = accountToken(account);

    // 1) Token: renova antes de vencer (e logo após 24h, para trocar a validade presumida pela real).
    const action = planTokenAction(
      { obtainedAt: account.tokenObtainedAt, expiresAt: account.tokenExpiresAt, expiryEstimated: account.tokenExpiryEstimated },
      now
    );
    if (action === "vencido")
      throw new FriendlyError("O token venceu. Gere um novo no painel do app da Meta e cole em Configurações.", 400);
    if (action === "renovar") {
      try {
        const renewed = await renewToken(token, { fetchImpl, now });
        token = renewed.token;
        account.set("credentials.accessToken", encrypt(renewed.token));
        account.tokenObtainedAt = renewed.obtainedAt;
        account.tokenExpiresAt = renewed.expiresAt;
        account.tokenExpiryEstimated = false;
        await account.save();
        result.tokenRenewed = true;
      } catch (e) {
        result.warnings.push(`Não consegui renovar o token agora: ${toFriendly(e).message}`);
      }
    }

    client = new InstagramClient(token, fetchImpl);
    const api = client;
    const today = dayKey(now);
    const overBudget = () => history && (api.calls >= maxCalls || Date.now() - startedAt > timeBudget);

    // 2) Perfil e seguidores do dia.
    const me = await api.getMe();
    const igUserId = me.userId || account.accountId;
    account.accountId = igUserId;
    if (me.username) {
      account.username = me.username;
      account.accountName = `@${me.username}`;
    }
    if (me.accountType) account.accountType = me.accountType;
    if (me.followersCount != null) account.followersCount = me.followersCount;
    if (me.mediaCount != null) account.mediaCount = me.mediaCount;
    if (me.profilePictureUrl) account.profilePictureUrl = me.profilePictureUrl;
    result.username = account.username;
    if (me.followersCount != null) {
      await InstagramAccountDaily.updateOne(
        { organization: org, account: account._id, date: today },
        { $set: { followers: me.followersCount, project: account.project } },
        { upsert: true }
      );
    }

    // 3) Alcance e views da conta, um dia por chamada.
    //    Diária: o que falta dos últimos 30 dias + os 3 mais recentes.
    //    Histórico: do mais novo para o mais antigo, até onde a Meta ainda guardar (90 dias).
    const span = history ? ACCOUNT_HISTORY_DAYS : DAILY_DAYS;
    const existing: any[] = await InstagramAccountDaily.find({
      organization: org,
      account: account._id,
      date: { $gte: addDays(today, -span) },
    }).lean();
    const have = new Set(existing.filter((d) => d.reach != null).map((d) => d.date));
    const order = Array.from({ length: span }, (_, k) => (history ? k + 1 : span - k));
    let misses = 0;
    for (const i of order) {
      const key = addDays(today, -i);
      if (have.has(key) && i > REFRESH_DAYS) {
        misses = 0;
        continue;
      }
      if (history && misses >= ACCOUNT_HISTORY_MISSES) break;
      if (overBudget()) {
        result.warnings.push("Parei de buscar o alcance diário da conta para não passar do limite de chamadas desta rodada.");
        break;
      }
      try {
        const { since, until } = dayRangeUnix(key);
        const totals = parseAccountTotals(await api.getAccountTotals(igUserId, since, until));
        if (totals.reach != null || totals.views != null) {
          await InstagramAccountDaily.updateOne(
            { organization: org, account: account._id, date: key },
            { $set: { ...totals, project: account.project } },
            { upsert: true }
          );
          result.days++;
          misses = 0;
        } else misses++;
      } catch (e) {
        if (e instanceof InstagramApiError && (e.kind === "parametro" || e.kind === "desconhecido")) {
          misses++;
          continue; // dia sem dado
        }
        result.warnings.push(`Alcance/views da conta não vieram: ${toFriendly(e).message}`);
        break;
      }
    }

    // 4) Mídias e métricas por tipo. Histórico: até 12 meses, paginando com teto de mídias,
    //    de chamadas e de tempo. Diária: só os posts recentes.
    const sinceMs = now - (history ? HISTORY_MEDIA_DAYS : RECENT_MEDIA_DAYS) * 86_400_000;
    const maxMedia = history ? opts.maxMedia ?? HISTORY_MAX_MEDIA : 200;
    const listed = await api.listMediaPaged(igUserId, {
      sinceMs,
      max: maxMedia,
      maxPages: Math.ceil(maxMedia / 50) + 2,
      tolerant: history,
    });
    const medias = listed.items;
    let stopReason = "";
    if (listed.stopped === "limite") stopReason = "o Instagram limitou as chamadas";
    else if (listed.stopped === "temporario" || listed.stopped === "rede") stopReason = "o Instagram ficou instável no meio da busca";
    else if (listed.stopped) stopReason = `teto de segurança de ${maxMedia} posts por rodada`;
    let insightFailures = 0;
    let oldestMs: number | null = null;
    let cut = false;
    for (const raw of medias) {
      if (overBudget()) {
        stopReason = api.calls >= maxCalls ? `teto de segurança de ${maxCalls} chamadas por rodada` : "tempo máximo da rodada";
        cut = true;
        break;
      }
      const productType = resolveProductType(raw);
      let metrics: MediaMetrics = {};
      let insightsError = "";
      try {
        metrics = parseMediaInsights(await api.getMediaInsights(raw.id, metricsFor(productType)));
      } catch (e) {
        if (history && isLimit(e)) {
          stopReason = "o Instagram limitou as chamadas";
          cut = true;
          break;
        }
        if (!(e instanceof InstagramApiError) || e.kind === "token_invalido" || e.kind === "limite" || e.kind === "rede") throw e;
        try {
          metrics = parseMediaInsights(await api.getMediaInsights(raw.id, FALLBACK_METRICS));
        } catch (e2) {
          if (history && isLimit(e2)) {
            stopReason = "o Instagram limitou as chamadas";
            cut = true;
            break;
          }
          insightsError = toFriendly(e2).message;
          insightFailures++;
        }
      }
      metrics = withMediaCounters(metrics, raw);

      const post: any = await Post.findOne({ organization: org, project: account.project, "externalIds.instagram": raw.id });
      if (post) {
        post.metrics = {
          views: metrics.views ?? post.metrics?.views,
          likes: metrics.likes ?? post.metrics?.likes,
          comments: metrics.comments ?? post.metrics?.comments,
          shares: metrics.shares ?? post.metrics?.shares,
          saves: metrics.saved ?? post.metrics?.saves,
        };
        await post.save();
        result.matchedPosts++;
      }

      const ts = raw.timestamp ? new Date(raw.timestamp) : new Date(now);
      const set: Record<string, unknown> = {
        account: account._id,
        project: account.project,
        mediaType: raw.media_type || "",
        productType,
        kind: resolveKind(raw),
        timestamp: ts,
        post: post?._id ?? null,
        metrics,
        metricsUpdatedAt: new Date(now),
        insightsError,
      };
      if (raw.caption !== undefined) set.caption = raw.caption;
      if (raw.permalink) set.permalink = raw.permalink;
      const thumbUrl = raw.thumbnail_url || (raw.media_type !== "VIDEO" ? raw.media_url : undefined);
      if (thumbUrl) set.thumbnailUrl = thumbUrl;
      await InstagramMedia.updateOne({ organization: org, account: account._id, igId: raw.id }, { $set: set }, { upsert: true });
      await InstagramMediaDaily.updateOne(
        { organization: org, account: account._id, igId: raw.id, date: today },
        { $set: { metrics } },
        { upsert: true }
      );
      result.media++;
      if (oldestMs == null || ts.getTime() < oldestMs) oldestMs = ts.getTime();
    }
    result.oldestPost = oldestMs != null ? new Date(oldestMs).toISOString() : null;

    // Até onde a busca de posts chegou: a data de corte quando foi até o fim; senão, o post
    // mais antigo que deu tempo de gravar. Nunca "encolhe" o que rodadas anteriores já cobriram.
    const finished = listed.complete && !cut;
    const reachedMs = finished ? sinceMs : oldestMs;
    const legacyMs = account.mediaHistorySince
      ? new Date(account.mediaHistorySince).getTime()
      : account.lastSync
        ? new Date(account.lastSync).getTime() - LEGACY_MEDIA_WINDOW_DAYS * 86_400_000
        : null;
    const sinceCandidates = [reachedMs, legacyMs].filter((v): v is number => v != null);
    if (sinceCandidates.length > 0) account.mediaHistorySince = new Date(Math.min(...sinceCandidates));
    result.mediaSince = account.mediaHistorySince ? dayKey(new Date(account.mediaHistorySince)) : null;
    if (!finished && stopReason) {
      result.stopped = stopReason;
      const until = oldestMs != null ? ` Vieram ${result.media} posts, o mais antigo de ${formatDateBR(oldestMs, true)}.` : "";
      result.warnings.push(
        `A busca de posts parou antes do fim: ${stopReason}.${until} ${
          /limitou|instável/.test(stopReason) ? "Espere cerca de 1 hora e busque de novo" : "Busque de novo"
        } para trazer o restante (o que já veio fica guardado).`
      );
    }
    if (history) {
      account.historyFetchedAt = new Date(now);
      account.historyNote = result.stopped ? `Parou antes do fim: ${result.stopped}.` : "";
    }
    if (insightFailures > 0)
      result.warnings.push(`${insightFailures} mídia(s) sem métricas detalhadas (a Meta não devolveu insights).`);

    account.lastSync = new Date(now);
    account.lastSyncError = "";
    account.lastSyncStats = { media: result.media, matchedPosts: result.matchedPosts, days: result.days };
    await account.save();
    result.calls = api.calls;
    result.ok = true;
    return result;
  } catch (e) {
    const friendly = toFriendly(e);
    result.calls = client?.calls ?? 0;
    result.error = friendly.message;
    await SocialAccount.updateOne({ _id: account._id, organization: org }, { $set: { lastSyncError: friendly.message } });
    return result;
  }
}

/** Sincroniza as contas ativas do Instagram DE UMA organização (ou só as de um projeto). Uma por vez. */
export async function syncAll(
  org: Types.ObjectId,
  filter: { project?: string; account?: string } = {},
  opts: SyncOptions = {}
): Promise<SyncResult[]> {
  const q: Record<string, unknown> = { organization: org, platform: "instagram", active: true, "credentials.accessToken": { $exists: true, $ne: "" } };
  if (filter.project) q.project = toObjectId(filter.project) ?? null;
  if (filter.account) q._id = toObjectId(filter.account) ?? null;
  const accounts = await SocialAccount.find(q).select("_id");
  const results: SyncResult[] = [];
  for (const a of accounts) results.push(await syncAccount(org, String(a._id), opts));
  return results;
}
