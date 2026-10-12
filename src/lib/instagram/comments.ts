import type { Types } from "mongoose";
import { type Classification, isClassification } from "@/lib/comments/classify";
import { RULES_ID, classifyText } from "@/lib/comments/rules";
import { type GapInfo, type Study, type StudyComment, buildCommentsReport, buildStudy } from "@/lib/comments/study";
import { FriendlyError, notFound, toFriendly } from "@/lib/errors";
import { audit } from "@/lib/orgs";
import type { Session } from "@/lib/session";
import { toObjectId } from "@/lib/tenant";
import InstagramComment from "@/models/InstagramComment";
import { InstagramMedia } from "@/models/InstagramMedia";
import SocialAccount from "@/models/SocialAccount";
import { accountToken } from "./accounts";
import { InstagramApiError, InstagramClient, type FetchLike, type RawComment, getDefaultFetch } from "./client";
import { dayStartMs } from "./dates";
import { ensureMock } from "./mock";

/* eslint-disable @typescript-eslint/no-explicit-any */

// COMENTÁRIOS: busca (só leitura), leitura do que está guardado, exclusão junto com a conta e a
// resposta pública (atrás de duas chaves desligadas). Tudo sempre com a organização no filtro.

type Org = Types.ObjectId;

export const RECENT_COMMENT_DAYS = 30; // sincronização normal: comentários dos posts recentes
export const RECENT_COMMENT_MEDIA = 25;
export const RECENT_COMMENT_CALLS = 80;
export const PERIOD_COMMENT_CALLS = 400; // "Buscar comentários" do período
export const PERIOD_COMMENT_MEDIA = 300;
export const COMMENT_TIME_BUDGET_MS = 200_000;
export const REPLY_MAX_CHARS = 1000;

export type CommentScope = { recent: true } | { from: string; to: string } | { mediaIgId: string };

export interface CommentSyncResult {
  ok: boolean;
  /** mídias no escopo / conferidas nesta rodada (as sem comentário informado não gastam chamada) */
  medias: number;
  checked: number;
  /** soma do que o Instagram informou (comments_count) e do que ele entregou, nas mídias conferidas */
  reported: number;
  fetched: number;
  added: number;
  removed: number;
  calls: number;
  /** por que parou antes do fim (vazio = foi até o fim) */
  stopped: string;
  error?: string;
}

export interface MediaCommentsSync {
  at: Date;
  reported: number;
  fetched: number;
  topLevel: number;
  replies: number;
  complete: boolean;
  error: string;
}

const lower = (s: unknown) => String(s || "").toLowerCase();
const PERMISSION_MSG =
  "O token desta conta não tem a permissão de comentários (instagram_business_manage_comments). Gere um token novo no painel do app da Meta marcando essa permissão e cole em Configurações.";

function toDoc(raw: RawComment, base: Record<string, unknown>, parentIgId: string | null, ownUser: string) {
  const username = raw.username || raw.from?.username || "";
  return {
    ...base,
    igId: String(raw.id),
    parentIgId,
    username,
    text: raw.text || "",
    timestamp: raw.timestamp ? new Date(raw.timestamp) : new Date(),
    likeCount: raw.like_count ?? 0,
    hidden: raw.hidden === true,
    own: Boolean(ownUser) && lower(username) === ownUser,
  };
}

/** Busca e grava os comentários de UMA mídia. Idempotente: rodar de novo não duplica. */
async function syncOneMedia(org: Org, account: any, media: any, api: InstagramClient, now: number, budget: () => number): Promise<MediaCommentsSync & { added: number; removed: number }> {
  const reported = Number(media.metrics?.comments ?? 0);
  const base = { organization: org, account: account._id, project: account.project, mediaIgId: media.igId };
  const ownUser = lower(account.username);
  const page = await api.listComments(media.igId, { budget });
  const ops: any[] = [];
  const seen: string[] = [];
  let replies = 0;
  for (const c of page.items) {
    const own = c.allReplies.filter((r) => ownUser && lower(r.username || r.from?.username) === ownUser);
    const firstOwn = own.map((r) => (r.timestamp ? new Date(r.timestamp).getTime() : now)).sort((a, b) => a - b)[0];
    const top = { ...toDoc(c, base, null, ownUser), answered: own.length > 0, answeredAt: firstOwn ? new Date(firstOwn) : null };
    seen.push(top.igId);
    ops.push({ updateOne: { filter: { organization: org, account: account._id, igId: top.igId }, update: { $set: top }, upsert: true } });
    for (const r of c.allReplies) {
      const doc = toDoc(r, base, top.igId, ownUser);
      seen.push(doc.igId);
      replies++;
      ops.push({ updateOne: { filter: { organization: org, account: account._id, igId: doc.igId }, update: { $set: doc }, upsert: true } });
    }
  }
  let added = 0;
  let removed = 0;
  if (ops.length) added = (await InstagramComment.bulkWrite(ops, { ordered: false })).upsertedCount ?? 0;
  // Busca completa: o que não veio mais (apagado no Instagram) sai daqui também.
  if (page.complete) {
    const r = await InstagramComment.deleteMany({ organization: org, account: account._id, mediaIgId: media.igId, igId: { $nin: seen } });
    removed = r.deletedCount ?? 0;
  }
  const sync: MediaCommentsSync = { at: new Date(now), reported, fetched: seen.length, topLevel: page.items.length, replies, complete: page.complete, error: "" };
  await InstagramMedia.updateOne({ organization: org, account: account._id, igId: media.igId }, { $set: { commentsSync: sync } });
  return { ...sync, added, removed };
}

/**
 * Busca comentários das mídias do escopo. SÓ LEITURA no Instagram.
 * Teto de chamadas e de tempo: ao bater, guarda o que veio e diz onde parou.
 */
export async function syncComments(
  org: Org,
  accountId: string,
  scope: CommentScope,
  opts: { fetchImpl?: FetchLike; now?: number; maxCalls?: number; timeBudgetMs?: number; client?: InstagramClient } = {}
): Promise<CommentSyncResult> {
  ensureMock();
  const now = opts.now ?? Date.now();
  const id = toObjectId(accountId);
  const account: any = id ? await SocialAccount.findOne({ _id: id, organization: org }) : null;
  if (!account) throw notFound("Conta");
  const result: CommentSyncResult = { ok: false, medias: 0, checked: 0, reported: 0, fetched: 0, added: 0, removed: 0, calls: 0, stopped: "" };

  const q: Record<string, unknown> = { organization: org, account: account._id };
  let limit = PERIOD_COMMENT_MEDIA;
  if ("mediaIgId" in scope) q.igId = String(scope.mediaIgId);
  else if ("recent" in scope) {
    q.timestamp = { $gte: new Date(now - RECENT_COMMENT_DAYS * 86_400_000) };
    limit = RECENT_COMMENT_MEDIA;
  } else q.timestamp = { $gte: new Date(dayStartMs(scope.from)), $lt: new Date(dayStartMs(scope.to) + 86_400_000) };
  const medias: any[] = await InstagramMedia.find(q).sort({ timestamp: -1 }).limit(limit).lean();
  if ("mediaIgId" in scope && medias.length === 0) throw notFound("Post");
  result.medias = medias.length;

  const api = opts.client ?? new InstagramClient(accountToken(account), opts.fetchImpl ?? getDefaultFetch());
  const startCalls = api.calls;
  const startedAt = Date.now();
  const maxCalls = opts.maxCalls ?? ("recent" in scope ? RECENT_COMMENT_CALLS : PERIOD_COMMENT_CALLS);
  const budget = () => maxCalls - (api.calls - startCalls);
  try {
    for (const media of medias) {
      const reported = Number(media.metrics?.comments ?? 0);
      // O Instagram diz que não há comentário: registra e não gasta chamada.
      if (media.metrics?.comments === 0) {
        if (media.commentsSync?.fetched) await InstagramComment.deleteMany({ organization: org, account: account._id, mediaIgId: media.igId });
        const sync: MediaCommentsSync = { at: new Date(now), reported: 0, fetched: 0, topLevel: 0, replies: 0, complete: true, error: "" };
        await InstagramMedia.updateOne({ organization: org, account: account._id, igId: media.igId }, { $set: { commentsSync: sync } });
        result.checked++;
        continue;
      }
      if (budget() <= 0) {
        result.stopped = `teto de segurança de ${maxCalls} chamadas por rodada`;
        break;
      }
      if (Date.now() - startedAt > (opts.timeBudgetMs ?? COMMENT_TIME_BUDGET_MS)) {
        result.stopped = "tempo máximo da rodada";
        break;
      }
      try {
        const r = await syncOneMedia(org, account, media, api, now, budget);
        result.checked++;
        result.reported += reported;
        result.fetched += r.fetched;
        result.added += r.added;
        result.removed += r.removed;
        if (!r.complete) {
          result.stopped = `teto de segurança de ${maxCalls} chamadas por rodada`;
          break;
        }
      } catch (e) {
        const kind = e instanceof InstagramApiError ? e.kind : "";
        const message = kind === "permissao" ? PERMISSION_MSG : toFriendly(e).message;
        await InstagramMedia.updateOne(
          { organization: org, account: account._id, igId: media.igId },
          { $set: { "commentsSync.at": new Date(now), "commentsSync.reported": reported, "commentsSync.error": message, "commentsSync.complete": false } }
        );
        // Erro de uma mídia só (parâmetro/desconhecido): segue para a próxima. O resto para a rodada.
        if (kind === "parametro" || kind === "desconhecido") continue;
        throw kind === "permissao" ? new FriendlyError(PERMISSION_MSG, 400, "token") : e;
      }
    }
    result.ok = true;
  } catch (e) {
    result.error = toFriendly(e).message;
  }
  result.calls = api.calls - startCalls;
  return result;
}

/** A classificação guardada (IA) vale; sem ela, regras calculadas na hora. */
export function classificationOf(doc: { cls?: unknown; text?: string }): Classification {
  return isClassification(doc.cls) ? doc.cls : classifyText(doc.text || "");
}
export { RULES_ID };

export async function loadComments(org: Org, accountId: unknown, filter: { mediaIgId?: string; mediaIgIds?: string[]; fromMs?: number; toMs?: number } = {}): Promise<(StudyComment & { _id: string; hidden: boolean; sentByName: string })[]> {
  const q: Record<string, unknown> = { organization: org, account: accountId };
  if (filter.mediaIgId) q.mediaIgId = filter.mediaIgId;
  if (filter.mediaIgIds) q.mediaIgId = { $in: filter.mediaIgIds };
  if (filter.fromMs != null || filter.toMs != null) q.timestamp = { ...(filter.fromMs != null ? { $gte: new Date(filter.fromMs) } : {}), ...(filter.toMs != null ? { $lt: new Date(filter.toMs) } : {}) };
  const docs: any[] = await InstagramComment.find(q).sort({ timestamp: 1 }).limit(20_000).lean();
  return docs.map((d) => ({
    _id: String(d._id),
    igId: d.igId,
    mediaIgId: d.mediaIgId,
    parentIgId: d.parentIgId ?? null,
    username: d.username || "",
    text: d.text || "",
    timestamp: d.timestamp,
    likeCount: d.likeCount ?? 0,
    hidden: d.hidden === true,
    own: d.own === true,
    answered: d.answered === true,
    answeredAt: d.answeredAt ?? null,
    sentByName: d.sentByName || "",
    cls: classificationOf(d),
  }));
}

/** Diferença entre o que o Instagram informa e o que entregou, nas mídias dadas. */
export function gapOf(medias: { metrics?: { comments?: number }; commentsSync?: Partial<MediaCommentsSync> | null }[]): GapInfo & { error: string } {
  const g = { reported: 0, fetched: 0, pendingMedia: 0, checkedMedia: 0, lastSyncAt: null as string | null, error: "" };
  let last = 0;
  for (const m of medias) {
    const s = m.commentsSync;
    if (!s?.at || s.error) {
      if (s?.error && !g.error) g.error = s.error;
      if ((m.metrics?.comments ?? 0) > 0) g.pendingMedia++;
      continue;
    }
    g.checkedMedia++;
    const reported = Number(s.reported ?? 0);
    g.reported += reported;
    g.fetched += Math.min(Number(s.fetched ?? 0), reported);
    last = Math.max(last, new Date(s.at).getTime());
  }
  g.lastSyncAt = last ? new Date(last).toISOString() : null;
  return g;
}

/** Apaga os comentários guardados de uma conta (ou de toda a organização). Chamado ao desconectar. */
export async function purgeComments(org: Org, accountId?: unknown): Promise<number> {
  const q: Record<string, unknown> = { organization: org };
  if (accountId) q.account = accountId;
  const r = await InstagramComment.deleteMany(q);
  return r.deletedCount ?? 0;
}

// ---- Responder (ESCRITA): duas chaves, as duas desligadas por padrão ----

export interface ReplySwitch { global: boolean; org: boolean; on: boolean; message: string }

export function replySwitch(organization: any): ReplySwitch {
  const global = process.env.IG_COMMENT_REPLY_ENABLED === "true";
  const org = organization?.commentReplyEnabled === true;
  return { global, org, on: global && org, message: global && org ? "" : "Responder comentários pelo ContentHub está desligado para esta conta. Responda pelo Instagram; o suporte liga quando o aplicativo for aprovado." };
}

export async function replyToComment(
  org: Org,
  session: Session,
  commentId: unknown,
  input: { message?: unknown; confirm?: unknown },
  opts: { fetchImpl?: FetchLike; now?: number; ip?: string } = {}
) {
  ensureMock();
  const sw = replySwitch(session.organization);
  // A chave vem ANTES de qualquer outra coisa: desligada, nada é lido nem enviado.
  if (!sw.on) throw new FriendlyError(`${sw.message} Nada foi enviado.`, 403);
  const id = toObjectId(commentId);
  const comment: any = id ? await InstagramComment.findOne({ _id: id, organization: org }) : null;
  if (!comment) throw notFound("Comentário");
  const message = String(input.message ?? "").trim();
  if (!message) throw new FriendlyError("Escreva a resposta.", 400, "message");
  if (message.length > REPLY_MAX_CHARS) throw new FriendlyError(`A resposta passou de ${REPLY_MAX_CHARS} caracteres.`, 400, "message");
  if (input.confirm !== true) throw new FriendlyError("Confirme o envio: a resposta é pública e aparece no Instagram na hora.", 409, "confirm");
  if (comment.hidden) throw new FriendlyError("Esse comentário está oculto no Instagram: não dá para responder.", 409);
  const account: any = await SocialAccount.findOne({ _id: comment.account, organization: org });
  if (!account || !account.active) throw notFound("Conta");
  // O Instagram só aceita resposta a comentário de primeiro nível: resposta a uma resposta entra na conversa do comentário pai.
  const targetIgId = comment.parentIgId || comment.igId;
  const now = opts.now ?? Date.now();
  const api = new InstagramClient(accountToken(account), opts.fetchImpl ?? getDefaultFetch());
  const replyIgId = await api.replyToComment(targetIgId, message);
  const name = session.user?.name || session.user?.email || "";
  const reply = await InstagramComment.findOneAndUpdate(
    { organization: org, account: account._id, igId: String(replyIgId) },
    { $set: { project: account.project, mediaIgId: comment.mediaIgId, parentIgId: targetIgId, username: account.username || "", text: message, timestamp: new Date(now), own: true, sentBy: session.user?._id ?? null, sentByName: name } },
    { upsert: true, returnDocument: "after" }
  );
  await InstagramComment.updateOne({ organization: org, account: account._id, igId: targetIgId, answered: { $ne: true } }, { $set: { answered: true, answeredAt: new Date(now) } });
  // O registro guarda quem e onde; o texto fica só no comentário.
  await audit({ action: "comentario.respondido", actor: session.user, organization: org, target: String(reply._id), ip: opts.ip, meta: { commentIgId: targetIgId, replyIgId: String(replyIgId), mediaIgId: comment.mediaIgId } });
  return reply;
}

// ---- Estudo por período: comentários dos posts PUBLICADOS no período ----

const firstLine = (caption: string) => (caption || "").split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#")) || "";

export interface PeriodStudy {
  study: Study;
  gap: GapInfo & { error: string };
  posts: { igId: string; title: string; kind: string; timestamp: Date; permalink: string; thumbnailUrl: string; reported: number; fetched: number | null; unanswered: number; questions: number; error: string }[];
  report: string;
}

export async function periodStudy(org: Org, account: any, period: { from: string; to: string; label: string }): Promise<PeriodStudy> {
  const medias: any[] = await InstagramMedia.find({
    organization: org,
    account: account._id,
    timestamp: { $gte: new Date(dayStartMs(period.from)), $lt: new Date(dayStartMs(period.to) + 86_400_000) },
  }).populate({ path: "post", select: "title", match: { organization: org } }).sort({ timestamp: -1 }).limit(PERIOD_COMMENT_MEDIA).lean();
  const comments = medias.length ? await loadComments(org, account._id, { mediaIgIds: medias.map((m) => m.igId) }) : [];
  const study = buildStudy(comments);
  const gap = gapOf(medias);
  const per = new Map<string, { unanswered: number; questions: number }>();
  for (const c of comments) {
    if (c.own) continue;
    const slot = per.get(c.mediaIgId) ?? { unanswered: 0, questions: 0 };
    if (!c.parentIgId && !c.answered && c.cls.category !== "spam") slot.unanswered++;
    if (c.cls.isQuestion) slot.questions++;
    per.set(c.mediaIgId, slot);
  }
  const posts = medias.map((m) => ({
    igId: m.igId,
    title: (m.post?.title || firstLine(m.caption) || "(sem legenda)").slice(0, 140),
    kind: m.kind,
    timestamp: m.timestamp,
    permalink: m.permalink || "",
    thumbnailUrl: m.thumbnailUrl || "",
    reported: Number(m.commentsSync?.at ? m.commentsSync.reported ?? 0 : m.metrics?.comments ?? 0),
    fetched: m.commentsSync?.at && !m.commentsSync.error ? Number(m.commentsSync.fetched ?? 0) : null,
    unanswered: per.get(m.igId)?.unanswered ?? 0,
    questions: per.get(m.igId)?.questions ?? 0,
    error: m.commentsSync?.error || "",
  }));
  const report = buildCommentsReport({ username: account.username || account.accountName, scope: `Posts publicados de ${period.label}`, study, gap, posts: medias.length });
  return { study, gap, posts, report };
}
