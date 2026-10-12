import { encrypt } from "@/lib/crypto";
import Post from "@/models/Post";
import SocialAccount from "@/models/SocialAccount";
import { InstagramAccountDaily, InstagramMedia, InstagramMediaDaily } from "@/models/InstagramMedia";
import { FriendlyError, accountToken, toFriendly } from "./accounts";
import { InstagramApiError, InstagramClient, type FetchLike, getDefaultFetch } from "./client";
import { addDays, dayKey, dayRangeUnix } from "./dates";
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
}

const HISTORY_DAYS = 30; // dias de alcance/views buscados na primeira sincronização
const REFRESH_DAYS = 3; // dias recentes sempre rebuscados (a Meta atrasa até 48h)
const MEDIA_WINDOW_DAYS = 90;

export async function syncAccount(
  accountId: string,
  opts: { fetchImpl?: FetchLike; now?: number } = {}
): Promise<SyncResult> {
  ensureMock();
  const fetchImpl = opts.fetchImpl ?? getDefaultFetch();
  const now = opts.now ?? Date.now();
  const account: any = await SocialAccount.findById(accountId);
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
  };

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

    const client = new InstagramClient(token, fetchImpl);
    const today = dayKey(now);

    // 2) Perfil e seguidores do dia.
    const me = await client.getMe();
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
        { account: account._id, date: today },
        { $set: { followers: me.followersCount, project: account.project } },
        { upsert: true }
      );
    }

    // 3) Alcance e views por dia: o que falta dos últimos 30 dias + os 3 mais recentes.
    const existing: any[] = await InstagramAccountDaily.find({
      account: account._id,
      date: { $gte: addDays(today, -HISTORY_DAYS) },
    }).lean();
    const have = new Set(existing.filter((d) => d.reach != null).map((d) => d.date));
    for (let i = HISTORY_DAYS; i >= 1; i--) {
      const key = addDays(today, -i);
      if (have.has(key) && i > REFRESH_DAYS) continue;
      try {
        const { since, until } = dayRangeUnix(key);
        const totals = parseAccountTotals(await client.getAccountTotals(igUserId, since, until));
        if (totals.reach != null || totals.views != null) {
          await InstagramAccountDaily.updateOne(
            { account: account._id, date: key },
            { $set: { ...totals, project: account.project } },
            { upsert: true }
          );
          result.days++;
        }
      } catch (e) {
        if (e instanceof InstagramApiError && (e.kind === "parametro" || e.kind === "desconhecido")) continue; // dia sem dado
        result.warnings.push(`Alcance/views da conta não vieram: ${toFriendly(e).message}`);
        break;
      }
    }

    // 4) Mídias e métricas por tipo.
    const medias = await client.listMedia(igUserId, { sinceMs: now - MEDIA_WINDOW_DAYS * 86_400_000, max: 200 });
    let insightFailures = 0;
    for (const raw of medias) {
      const productType = resolveProductType(raw);
      let metrics: MediaMetrics = {};
      let insightsError = "";
      try {
        metrics = parseMediaInsights(await client.getMediaInsights(raw.id, metricsFor(productType)));
      } catch (e) {
        if (!(e instanceof InstagramApiError) || e.kind === "token_invalido" || e.kind === "limite" || e.kind === "rede") throw e;
        try {
          metrics = parseMediaInsights(await client.getMediaInsights(raw.id, FALLBACK_METRICS));
        } catch (e2) {
          insightsError = toFriendly(e2).message;
          insightFailures++;
        }
      }
      metrics = withMediaCounters(metrics, raw);

      const post: any = await Post.findOne({ project: account.project, "externalIds.instagram": raw.id });
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

      const set: Record<string, unknown> = {
        account: account._id,
        project: account.project,
        mediaType: raw.media_type || "",
        productType,
        kind: resolveKind(raw),
        timestamp: raw.timestamp ? new Date(raw.timestamp) : new Date(now),
        post: post?._id ?? null,
        metrics,
        metricsUpdatedAt: new Date(now),
        insightsError,
      };
      if (raw.caption !== undefined) set.caption = raw.caption;
      if (raw.permalink) set.permalink = raw.permalink;
      const thumbUrl = raw.thumbnail_url || (raw.media_type !== "VIDEO" ? raw.media_url : undefined);
      if (thumbUrl) set.thumbnailUrl = thumbUrl;
      await InstagramMedia.updateOne({ igId: raw.id }, { $set: set }, { upsert: true });
      await InstagramMediaDaily.updateOne(
        { igId: raw.id, date: today },
        { $set: { account: account._id, metrics } },
        { upsert: true }
      );
      result.media++;
    }
    if (insightFailures > 0)
      result.warnings.push(`${insightFailures} mídia(s) sem métricas detalhadas (a Meta não devolveu insights).`);

    account.lastSync = new Date(now);
    account.lastSyncError = "";
    account.lastSyncStats = { media: result.media, matchedPosts: result.matchedPosts, days: result.days };
    await account.save();
    result.ok = true;
    return result;
  } catch (e) {
    const friendly = toFriendly(e);
    result.error = friendly.message;
    await SocialAccount.updateOne({ _id: account._id }, { $set: { lastSyncError: friendly.message } });
    return result;
  }
}

/** Sincroniza todas as contas ativas do Instagram (ou só as de um projeto). Uma por vez. */
export async function syncAll(
  filter: { project?: string; account?: string } = {},
  opts: { fetchImpl?: FetchLike; now?: number } = {}
): Promise<SyncResult[]> {
  const q: Record<string, unknown> = { platform: "instagram", active: true, "credentials.accessToken": { $exists: true, $ne: "" } };
  if (filter.project) q.project = filter.project;
  if (filter.account) q._id = filter.account;
  const accounts = await SocialAccount.find(q).select("_id");
  const results: SyncResult[] = [];
  for (const a of accounts) results.push(await syncAccount(String(a._id), opts));
  return results;
}
