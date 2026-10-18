/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Types } from "mongoose";
import { decrypt, encrypt } from "@/lib/crypto";
import { FriendlyError, notFound } from "@/lib/errors";
import { addDays, dayKey } from "@/lib/instagram/dates";
import { PERIOD_PRESETS, resolvePeriod } from "@/lib/instagram/period";
import { assertProject } from "@/lib/orgs";
import { toObjectId } from "@/lib/tenant";
import { AdAccount, AdInsightDaily, AdObject } from "@/models/Ads";
import { MetaApiError, MetaGraphClient, normalizeActId } from "./client";
import { ACCOUNT_STATUS_PT, parseInsightRow } from "./metrics";
import { ensureAdsMock } from "./mock";

type Org = Types.ObjectId;

/** Primeira busca: 90 dias. Depois: os últimos 30 de novo (a Meta ainda ajusta atribuição). */
export const FIRST_SYNC_DAYS = 90;
export const DAILY_SYNC_DAYS = 30;
/** a Meta guarda até 37 meses; nós buscamos no máximo 12 meses por vez */
export const MAX_HISTORY_DAYS = 365;

const cleanToken = (raw: unknown) => String(raw || "").replace(/\s+/g, "").replace(/^Bearer/i, "");

export function adsToken(acc: any): string {
  const stored = acc?.credentials?.accessToken;
  if (!stored) throw new FriendlyError("Essa conta de anúncio não tem token. Cole um token para conectar.", 400, "token");
  return decrypt(stored);
}

/** O que a tela recebe: nunca o token. */
export function publicAdAccount(a: any) {
  return {
    _id: String(a._id),
    project: String(a.project),
    adAccountId: a.adAccountId,
    name: a.name || a.adAccountId,
    currency: a.currency || "BRL",
    timezone: a.timezone || "",
    accountStatus: a.accountStatus ?? null,
    accountStatusText: a.accountStatus == null ? "" : ACCOUNT_STATUS_PT[a.accountStatus] || `situação ${a.accountStatus}`,
    hasToken: Boolean(a.credentials?.accessToken),
    tokenObtainedAt: a.tokenObtainedAt || null,
    metaUserName: a.metaUserName || "",
    igAccounts: (a.igAccounts || []).map((i: any) => ({ id: i.id, username: i.username, pageName: i.pageName })),
    igUserId: a.igUserId || "",
    active: a.active !== false,
    lastSync: a.lastSync || null,
    lastSyncError: a.lastSyncError || "",
    lastSyncStats: a.lastSyncStats || null,
    insightsSince: a.insightsSince || "",
  };
}

/** Conecta (ou troca o token de) uma conta de anúncio do projeto. Confere o token na Meta antes de gravar. */
export async function connectAdAccount(org: Org, input: { project?: unknown; adAccountId?: unknown; token?: unknown }) {
  ensureAdsMock();
  const projectId = toObjectId(input.project);
  if (!projectId) throw new FriendlyError("Escolha o projeto dessa conta de anúncio.", 400, "project");
  await assertProject(org, projectId);
  const actId = normalizeActId(String(input.adAccountId || ""));
  if (!actId) throw new FriendlyError("Confira o ID da conta de anúncio (ex.: act_803239545032201, aparece no Gerenciador de Anúncios).", 400, "adAccountId");
  const token = cleanToken(input.token);
  if (token.length < 30) throw new FriendlyError("Cole o token de acesso inteiro (começa com EAA).", 400, "token");

  const client = new MetaGraphClient(token);
  const me = await client.me();
  let account;
  try {
    account = await client.adAccount(actId);
  } catch (e) {
    if (e instanceof MetaApiError && e.kind === "parametro")
      throw new FriendlyError("Esse token não enxerga essa conta de anúncio. Confira o ID ou gere o token com um usuário que tenha acesso a ela.", 400, "adAccountId");
    throw e;
  }
  // Páginas e Instagram ligados (para concorrentes). Sem a permissão, segue sem.
  let ig: Awaited<ReturnType<MetaGraphClient["igAccounts"]>> = [];
  try {
    ig = await client.igAccounts();
  } catch {
    ig = [];
  }
  const doc =
    (await AdAccount.findOne({ organization: org, project: projectId, adAccountId: actId })) ||
    new AdAccount({ organization: org, project: projectId, adAccountId: actId });
  doc.set({
    name: account.name || actId,
    currency: account.currency || "",
    timezone: account.timezone_name || "",
    accountStatus: account.account_status ?? null,
    credentials: { accessToken: encrypt(token) },
    tokenObtainedAt: new Date(),
    metaUserName: me.name || "",
    igAccounts: ig,
    igUserId: doc.igUserId && ig.some((i) => i.id === doc.igUserId) ? doc.igUserId : ig[0]?.id || "",
    active: true,
    lastSyncError: "",
  });
  await doc.save();
  return doc;
}

export async function findAdAccount(org: Org, id: unknown) {
  const oid = toObjectId(id);
  if (!oid) throw notFound("Conta de anúncio");
  const acc = await AdAccount.findOne({ _id: oid, organization: org });
  if (!acc) throw notFound("Conta de anúncio");
  return acc;
}

/** Apaga a conta de anúncio e tudo que veio dela (campanhas, números). Nada é apagado na Meta. */
export async function removeAdAccount(org: Org, id: unknown) {
  const acc = await findAdAccount(org, id);
  await Promise.all([
    AdObject.deleteMany({ organization: org, adAccount: acc._id }),
    AdInsightDaily.deleteMany({ organization: org, adAccount: acc._id }),
  ]);
  await AdAccount.deleteOne({ _id: acc._id, organization: org });
}

const cents = (v: unknown) => (v == null || v === "" ? null : Number(v));
const when = (v: unknown) => (v ? new Date(String(v)) : null);

export interface SyncResult {
  account: string;
  name: string;
  ok: boolean;
  error?: string;
  days?: number;
  rows?: number;
  campaigns?: number;
  adsets?: number;
  ads?: number;
  calls?: number;
  complete?: boolean;
}

/** Busca campanhas, conjuntos, anúncios e os números diários. Só leitura na Meta. */
export async function syncAdAccount(org: Org, id: unknown, opts: { days?: number; now?: number } = {}): Promise<SyncResult> {
  ensureAdsMock();
  const acc: any = await findAdAccount(org, id);
  const now = opts.now ?? Date.now();
  const today = dayKey(now);
  const days = Math.min(MAX_HISTORY_DAYS, Math.max(1, opts.days ?? (acc.insightsSince ? DAILY_SYNC_DAYS : FIRST_SYNC_DAYS)));
  const since = addDays(today, -(days - 1));
  const client = new MetaGraphClient(adsToken(acc));
  try {
    const [campaigns, adsets, ads] = [await client.campaigns(acc.adAccountId), await client.adsets(acc.adAccountId), await client.ads(acc.adAccountId)];
    const base = { organization: org, adAccount: acc._id, project: acc.project };
    const ops: any[] = [];
    for (const c of campaigns.items)
      ops.push({ updateOne: { filter: { organization: org, adAccount: acc._id, level: "campaign", metaId: c.id }, update: { $set: { ...base, level: "campaign", metaId: c.id, name: c.name || "", status: c.status || "", effectiveStatus: c.effective_status || "", objective: c.objective || "", dailyBudget: cents(c.daily_budget), lifetimeBudget: cents(c.lifetime_budget), createdTime: when(c.created_time) } }, upsert: true } });
    for (const s of adsets.items)
      ops.push({ updateOne: { filter: { organization: org, adAccount: acc._id, level: "adset", metaId: s.id }, update: { $set: { ...base, level: "adset", metaId: s.id, name: s.name || "", status: s.status || "", effectiveStatus: s.effective_status || "", campaignId: s.campaign_id || "", dailyBudget: cents(s.daily_budget), lifetimeBudget: cents(s.lifetime_budget), optimizationGoal: s.optimization_goal || "", createdTime: when(s.created_time) } }, upsert: true } });
    for (const a of ads.items)
      ops.push({ updateOne: { filter: { organization: org, adAccount: acc._id, level: "ad", metaId: a.id }, update: { $set: { ...base, level: "ad", metaId: a.id, name: a.name || "", status: a.status || "", effectiveStatus: a.effective_status || "", campaignId: a.campaign_id || "", adsetId: a.adset_id || "", thumbnailUrl: a.creative?.thumbnail_url || "", igMediaId: a.creative?.effective_instagram_media_id || "", igPermalink: a.creative?.instagram_permalink_url || "", createdTime: when(a.created_time) } }, upsert: true } });
    if (ops.length) await AdObject.bulkWrite(ops, { ordered: false });

    const insights = await client.insightsByAdDay(acc.adAccountId, since, today);
    const rows = insights.items.map(parseInsightRow).filter(Boolean) as NonNullable<ReturnType<typeof parseInsightRow>>[];
    // Só troca a janela inteira depois que a busca terminou: busca pela metade não apaga nada.
    if (insights.complete) await AdInsightDaily.deleteMany({ organization: org, adAccount: acc._id, date: { $gte: since, $lte: today } });
    if (rows.length)
      await AdInsightDaily.bulkWrite(
        rows.map((r) => ({ updateOne: { filter: { organization: org, adAccount: acc._id, adId: r.adId, date: r.date }, update: { $set: { ...base, ...r } }, upsert: true } })),
        { ordered: false }
      );

    // Alcance de verdade dos períodos-padrão (uma chamada cada, sem somar dias)
    const reach: Record<string, { reach: number | null; at: Date }> = {};
    for (const p of PERIOD_PRESETS.filter((x) => x.key !== "datas")) {
      const per = resolvePeriod({ periodo: p.key }, now);
      try {
        reach[`${per.from}_${per.to}`] = { reach: await client.accountReach(acc.adAccountId, per.from, per.to), at: new Date(now) };
      } catch {
        /* sem alcance desse período: a tela mostra a soma diária com o aviso */
      }
    }
    const oldest = !acc.insightsSince || since < acc.insightsSince ? since : acc.insightsSince;
    const stats = { days, rows: rows.length, campaigns: campaigns.items.length, adsets: adsets.items.length, ads: ads.items.length, calls: client.calls, complete: insights.complete && campaigns.complete && adsets.complete && ads.complete };
    await AdAccount.updateOne({ _id: acc._id, organization: org }, { $set: { lastSync: new Date(now), lastSyncError: stats.complete ? "" : "A Meta tem mais dados do que buscamos de uma vez; os números podem estar incompletos.", lastSyncStats: stats, insightsSince: oldest, reachByRange: reach } });
    return { account: String(acc._id), name: acc.name, ok: true, ...stats };
  } catch (e) {
    const msg = e instanceof FriendlyError ? e.message : "Erro inesperado ao buscar os anúncios.";
    await AdAccount.updateOne({ _id: acc._id, organization: org }, { $set: { lastSyncError: msg } });
    if (!(e instanceof FriendlyError)) throw e;
    return { account: String(acc._id), name: acc.name, ok: false, error: msg, calls: client.calls };
  }
}
