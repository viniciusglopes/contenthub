import type { Types } from "mongoose";
import { nowMs } from "@/lib/clock";
import { FriendlyError, notFound } from "@/lib/errors";
import { accountToken } from "@/lib/instagram/accounts";
import { InstagramApiError, InstagramClient } from "@/lib/instagram/client";
import { dayStartMs, formatDateTimeBR } from "@/lib/instagram/dates";
import { ensureMock } from "@/lib/instagram/mock";
import { type PublishablePost, planPublish, publishEnabled } from "@/lib/instagram/publish";
import { assetExists, mediaPublicUrl, publicAsset } from "@/lib/media/store";
import { IG_LIMITS } from "@/lib/media/specs";
import { audit } from "@/lib/orgs";
import type { Session } from "@/lib/session";
import MediaAsset from "@/models/MediaAsset";
import Organization from "@/models/Organization";
import Post from "@/models/Post";
import SocialAccount from "@/models/SocialAccount";

/* eslint-disable @typescript-eslint/no-explicit-any */

// FLUXO DO POST
//   rascunho -> aguardando aprovação -> aprovado/agendado -> publicando -> publicado | falhou | perdeu o horário
// Só o dono da organização (ou o administrador) aprova. Membro pede aprovação.
// Editar um post aprovado devolve para "aguardando aprovação". Tudo fica no histórico do post;
// aprovação, pedido de ajuste e publicação também vão para o AuditLog.

type Org = Types.ObjectId;

/** Estados em que o post está "valendo" para o agendador ou esperando decisão. */
export const APPROVED_STATES = ["scheduled", "failed", "missed"];
export const QUEUE_STATES = ["pending", "approved", "failed", "missed"];

/** Momento exato (UTC) de um dia + horário de Brasília. */
export function publishAtOf(post: { scheduledDate: Date | string; scheduledTime: string }): Date | null {
  const key = new Date(post.scheduledDate).toISOString().slice(0, 10);
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(post.scheduledTime || ""));
  if (!m || Number.isNaN(Date.parse(key))) return null;
  return new Date(dayStartMs(key) + (Number(m[1]) * 60 + Number(m[2])) * 60_000);
}

export interface PublishSwitch { global: boolean; org: boolean; on: boolean; message: string }
/** As DUAS chaves: a geral (IG_PUBLISH_ENABLED) e a da organização. Qualquer uma desligada = nada sai. */
export function publishSwitch(organization: any): PublishSwitch {
  const global = publishEnabled();
  const org = organization?.publishEnabled === true;
  return {
    global,
    org,
    on: global && org,
    message: global && org ? "" : "Publicação automática desligada para esta conta. Você pode criar, aprovar e agendar, mas nada sai sozinho até o suporte ligar.",
  };
}

export const historyEntry = (type: string, by: string, note = "", at: Date = new Date(nowMs())) => ({ at, type, by, note });
const pushHistory = (type: string, by: string, note = "", at?: Date) => ({ history: { $each: [historyEntry(type, by, note, at)], $slice: -60 } });
const actorName = (s: Session) => s.user?.name || s.user?.email || "Alguém";

export async function loadAssets(org: Org, post: any): Promise<any[]> {
  const ids = (post.media || []).map((m: any) => m?._id ?? m);
  if (!ids.length) return [];
  const found: any[] = await MediaAsset.find({ organization: org, _id: { $in: ids } }).lean();
  const by = new Map(found.map((a) => [String(a._id), a]));
  return ids.map((id: any) => by.get(String(id))).filter(Boolean);
}

/** O post como a tela recebe: mídias com endereço, sem a trava interna do agendador. */
export function publicPost(doc: any, assets: any[]): any {
  const p = typeof doc.toObject === "function" ? doc.toObject({ flattenMaps: true }) : { ...doc };
  if (p.publish) delete p.publish.lockId;
  p.media = assets.map(publicAsset);
  return p;
}
export async function publicPosts(org: Org, docs: any[]): Promise<any[]> {
  const ids = docs.flatMap((d) => d.media || []);
  const all: any[] = ids.length ? await MediaAsset.find({ organization: org, _id: { $in: ids } }).lean() : [];
  const by = new Map(all.map((a) => [String(a._id), a]));
  return docs.map((d) => publicPost(d, (d.media || []).map((id: any) => by.get(String(id))).filter(Boolean)));
}

/** O que o publicador recebe: as mídias viram endereços públicos https (os que a Meta baixa). */
export function publishable(post: any, assets: any[]): PublishablePost {
  const urls = assets.length ? assets.map((a) => mediaPublicUrl(a.organization, a.file) || "") : post.mediaUrls || [];
  return {
    title: post.title, caption: post.caption, hashtags: post.hashtags, format: post.format, platforms: post.platforms,
    status: "scheduled", mediaUrls: urls, externalIds: post.externalIds,
  };
}

export interface CheckItem { key: string; ok: boolean; label: string; detail: string }
export interface PostCheck { ok: boolean; items: CheckItem[]; missing: string[] }

async function accountCheck(org: Org, post: any, probe: boolean, now: number): Promise<CheckItem> {
  const item = (ok: boolean, detail: string): CheckItem => ({ key: "conta", ok, label: "Conta do Instagram conectada, com permissão para publicar", detail });
  const account: any = await SocialAccount.findOne({ organization: org, project: post.project?._id ?? post.project, platform: "instagram", active: true, "credentials.accessToken": { $exists: true, $ne: "" } });
  if (!account) return item(false, "Este projeto não tem conta do Instagram conectada e ativa. Conecte em Configurações.");
  if (account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() < now)
    return item(false, `A conexão com @${account.username} venceu. Conecte de novo em Configurações.`);
  const fresh = account.canPublishCheckedAt && now - new Date(account.canPublishCheckedAt).getTime() < 24 * 3_600_000;
  if (probe && !(fresh && account.canPublish === true)) {
    ensureMock();
    try {
      // Leitura simples que só funciona com a permissão de publicar: é assim que conferimos o token.
      await new InstagramClient(accountToken(account)).getPublishingLimit(account.accountId);
      account.canPublish = true;
    } catch (e) {
      if (!(e instanceof InstagramApiError)) throw e;
      if (e.kind === "permissao" || e.kind === "token_invalido" || e.kind === "conta_nao_profissional") account.canPublish = false;
      else return item(false, `Não consegui conferir a conta @${account.username} agora: ${e.message} Tente de novo em instantes.`);
    }
    account.canPublishCheckedAt = new Date(now);
    await account.save();
  }
  if (account.canPublish === false)
    return item(false, `A conexão com @${account.username} não tem permissão para publicar. Conecte de novo marcando a permissão de publicar conteúdo.`);
  return item(true, `@${account.username}`);
}

/**
 * Tudo que precisa estar certo ANTES de aprovar. Devolve a lista inteira (o que está ok e o
 * que falta), em português. `probe` confere a permissão de publicar na Meta (uma leitura).
 */
export async function checkPost(org: Org, post: any, opts: { now?: number; probe?: boolean; skipDate?: boolean } = {}): Promise<PostCheck> {
  const now = opts.now ?? nowMs();
  const assets = await loadAssets(org, post);
  const items: CheckItem[] = [];
  const add = (key: string, ok: boolean, label: string, detail: string) => items.push({ key, ok, label, detail: ok ? detail : detail });
  const fmt = post.format as string;
  const images = assets.filter((a) => a.kind === "image").length;
  const videos = assets.length - images;
  const supported = ["post", "carrossel", "reel"].includes(fmt);

  add("rede", (post.platforms || []).includes("instagram"), "Marcado para o Instagram", (post.platforms || []).includes("instagram") ? "" : "Marque Instagram nas redes do post.");
  add("formato", supported, "Formato que sai sozinho", supported ? "" : `"${fmt}" ainda não é publicado automaticamente (só Post, Carrossel e Reel). Troque o formato ou publique por fora.`);

  let mediaMsg = "";
  if (!assets.length) mediaMsg = (post.mediaUrls || []).length ? "" : "Falta enviar a imagem ou o vídeo.";
  else if (fmt === "post" && (assets.length !== 1 || videos)) mediaMsg = videos ? "Post é de 1 imagem. Para vídeo, use o formato Reel." : "Post aceita só 1 imagem. Para várias, use o formato Carrossel.";
  else if (fmt === "reel" && (assets.length !== 1 || images)) mediaMsg = images ? "Reel precisa de 1 vídeo (MP4 ou MOV), não de imagem." : "Reel aceita só 1 vídeo.";
  else if (fmt === "carrossel" && (assets.length < IG_LIMITS.carousel.min || assets.length > IG_LIMITS.carousel.max)) mediaMsg = `Carrossel precisa de ${IG_LIMITS.carousel.min} a ${IG_LIMITS.carousel.max} mídias (tem ${assets.length}).`;
  if (!mediaMsg) {
    const bad = assets.flatMap((a, i) => (a.problems || []).filter((p: any) => p.level === "erro").map((p: any) => `Mídia ${i + 1}: ${p.message}`));
    if (bad.length) mediaMsg = bad.join(" ");
  }
  if (!mediaMsg) for (const a of assets) if (!(await assetExists(org, a.file))) mediaMsg = "O arquivo de uma mídia não está mais no servidor. Envie de novo.";
  if (!mediaMsg && assets.length && !mediaPublicUrl(org, assets[0].file)) mediaMsg = "O endereço público do sistema não está configurado (APP_URL em https). Avise o suporte.";
  add("midia", !mediaMsg, "Mídia enviada e no padrão do Instagram", mediaMsg || (assets.length ? `${assets.length} ${assets.length === 1 ? "arquivo" : "arquivos"}` : ""));

  const plan = planPublish(publishable(post, assets));
  const captionErrors = plan.ok ? [] : plan.errors.filter((e) => /legenda|hashtag/i.test(e));
  const mentions = (String(post.caption || "").match(/@[\w.]+/g) || []).length;
  if (mentions > IG_LIMITS.caption.mentions) captionErrors.push(`A legenda marca mais de ${IG_LIMITS.caption.mentions} perfis.`);
  add("legenda", captionErrors.length === 0, "Legenda dentro do limite", captionErrors.join(" "));
  // qualquer outra recusa do publicador que as conferências acima não cobriram
  if (!plan.ok && supported && !mediaMsg && items.every((i) => i.ok)) {
    const rest = plan.errors.filter((e) => !/legenda|hashtag|Aprovado ou Agendado/i.test(e));
    if (rest.length) add("plano", false, "Pronto para o Instagram", rest.join(" "));
  }

  if (!opts.skipDate) {
    const at = publishAtOf(post);
    const future = Boolean(at && at.getTime() > now);
    add("data", future, "Data e hora no futuro", at ? (future ? `Sai em ${formatDateTimeBR(at)}` : `${formatDateTimeBR(at)} já passou. Escolha outra data ou horário.`) : "Informe data e horário.");
  }
  items.push(await accountCheck(org, post, opts.probe === true, now));
  return { ok: items.every((i) => i.ok), items, missing: items.filter((i) => !i.ok).map((i) => i.detail || i.label) };
}

const CLEAN_PUBLISH = {
  "publish.lockId": "", "publish.lockedAt": null, "publish.startedAt": null, "publish.attempts": 0, "publish.recoveries": 0,
  "publish.nextAttemptAt": null, "publish.containerId": "", "publish.children": [], "publish.containerAt": null,
  "publish.publishCalledAt": null, "publish.lastError": "", "publish.lastErrorKind": "", "publish.lastErrorAt": null,
  "publish.uncertain": false, "publish.waitNote": "",
};

/** Mudanças de estado feitas por pessoas. Cada uma é atômica (confere o estado de partida no próprio update). */
export async function workflowAction(
  s: Session,
  postId: Types.ObjectId,
  action: string,
  input: { note?: string; confirm?: boolean; ip?: string; now?: number } = {}
): Promise<any> {
  const org = s.orgId;
  const now = input.now ?? nowMs();
  const who = actorName(s);
  const post: any = await Post.findOne({ _id: postId, organization: org });
  if (!post) throw notFound("Post");
  const move = async (from: string[], set: Record<string, unknown>, hist: ReturnType<typeof pushHistory>) => {
    const updated = await Post.findOneAndUpdate({ _id: postId, organization: org, status: { $in: from } }, { $set: set, $push: hist }, { returnDocument: "after" });
    if (!updated) throw new FriendlyError("O post mudou de situação enquanto você olhava. Abra de novo.", 409);
    return updated;
  };
  const ownerOnly = (what: string) => {
    if (!s.canManage) throw new FriendlyError(`Só o dono da conta pode ${what}. Peça a aprovação.`, 403);
  };
  if (post.status === "publishing") throw new FriendlyError("Esse post está sendo publicado agora. Aguarde um instante.", 409);
  const meta = { title: post.title };

  if (action === "request") {
    if (!["draft", "failed", "missed"].includes(post.status)) throw new FriendlyError("Esse post não está em rascunho.", 409);
    return move(["draft", "failed", "missed"], { status: "pending", "review.requestedByName": who, "review.requestedAt": new Date(now), "review.note": "" }, pushHistory("pedido", who));
  }

  if (action === "approve") {
    ownerOnly("aprovar");
    if (!["draft", "pending", "approved"].includes(post.status)) throw new FriendlyError("Esse post não está aguardando aprovação.", 409);
    if (post.blockers?.length) throw new FriendlyError(`Ainda não dá para aprovar. ${post.blockers.join(" ")}`, 400);
    const check = await checkPost(org, post, { now, probe: true });
    if (!check.ok) throw new FriendlyError(`Ainda não dá para aprovar. Falta: ${check.missing.join(" ")}`, 400);
    const at = publishAtOf(post)!;
    const updated = await move(["draft", "pending", "approved"], {
      ...CLEAN_PUBLISH, status: "scheduled", publishAt: at, "publish.dueAt": at,
      "approval.by": s.user._id, "approval.byName": who, "approval.at": new Date(now), "review.note": "",
    }, pushHistory("aprovado", who, `Sai em ${formatDateTimeBR(at)}`));
    await audit({ action: "post.aprovado", actor: s.user, organization: org, target: String(postId), ip: input.ip, meta: { ...meta, publishAt: at } });
    return updated;
  }

  if (action === "adjust") {
    ownerOnly("pedir ajuste");
    const note = String(input.note || "").trim().slice(0, 500);
    if (!["pending", "approved", "scheduled"].includes(post.status)) throw new FriendlyError("Esse post não está aguardando aprovação.", 409);
    const updated = await move(["pending", "approved", "scheduled"], {
      ...CLEAN_PUBLISH, status: "draft", publishAt: null, "approval.by": null, "approval.byName": "", "approval.at": null,
      "review.note": note || "Precisa de ajuste.", "review.noteByName": who, "review.noteAt": new Date(now),
    }, pushHistory("ajuste", who, note));
    await audit({ action: "post.ajuste_pedido", actor: s.user, organization: org, target: String(postId), ip: input.ip, meta: { ...meta, note } });
    return updated;
  }

  if (action === "draft") {
    if (!["pending", "approved", "scheduled", "failed", "missed"].includes(post.status)) throw new FriendlyError("Esse post não pode voltar para rascunho.", 409);
    if (post.publish?.uncertain) throw new FriendlyError("Confira primeiro no Instagram se esse post saiu e escolha: marcar como publicado ou tentar de novo.", 409);
    return move(["pending", "approved", "scheduled", "failed", "missed"], {
      ...CLEAN_PUBLISH, status: "draft", publishAt: null, "approval.by": null, "approval.byName": "", "approval.at": null,
    }, pushHistory("rascunho", who, post.status === "scheduled" ? "Agendamento cancelado" : ""));
  }

  if (action === "retry") {
    ownerOnly("mandar publicar de novo");
    if (!["failed", "missed"].includes(post.status)) throw new FriendlyError("Esse post não está com falha.", 409);
    if (!post.approval?.at) throw new FriendlyError("Esse post precisa ser aprovado de novo.", 409);
    if (post.publish?.uncertain && !input.confirm)
      throw new FriendlyError("O Instagram pode ter publicado esse post. Confira no perfil antes: se saiu, marque como publicado; se não saiu, confirme para tentar de novo.", 409);
    const check = await checkPost(org, post, { now, probe: true, skipDate: true });
    if (!check.ok) throw new FriendlyError(`Ainda não dá para tentar de novo. Falta: ${check.missing.join(" ")}`, 400);
    const set: Record<string, unknown> = {
      status: "scheduled", "publish.dueAt": new Date(now), "publish.attempts": 0, "publish.recoveries": 0, "publish.nextAttemptAt": null,
      "publish.waitNote": "", "publish.lockId": "", "publish.lockedAt": null, publishAt: post.publishAt && post.publishAt.getTime() <= now ? post.publishAt : new Date(now),
    };
    if (post.publish?.uncertain) Object.assign(set, { "publish.uncertain": false, "publish.containerId": "", "publish.children": [], "publish.containerAt": null, "publish.publishCalledAt": null });
    const updated = await move(["failed", "missed"], set, pushHistory("tentar_de_novo", who));
    await audit({ action: "post.tentar_de_novo", actor: s.user, organization: org, target: String(postId), ip: input.ip, meta });
    return updated;
  }

  if (action === "mark_posted") {
    ownerOnly("marcar como publicado");
    if (post.status === "posted") return post;
    const updated = await move(["draft", "pending", "approved", "scheduled", "failed", "missed"], { ...CLEAN_PUBLISH, status: "posted" }, pushHistory("marcado_publicado", who, "Marcado como publicado à mão"));
    await audit({ action: "post.marcado_publicado", actor: s.user, organization: org, target: String(postId), ip: input.ip, meta });
    return updated;
  }

  throw new FriendlyError("Ação desconhecida.", 400, "action");
}

/**
 * Depois de editar: post aprovado (ou com falha) volta para "aguardando aprovação".
 * Devolve o $set/$push a somar na gravação da edição.
 */
export function afterEdit(post: any, who: string): { set: Record<string, unknown>; push: Record<string, unknown> } {
  if (APPROVED_STATES.includes(post.status) || post.status === "approved") {
    return {
      set: { ...CLEAN_PUBLISH, status: "pending", publishAt: null, "approval.by": null, "approval.byName": "", "approval.at": null, "review.requestedByName": who, "review.requestedAt": new Date(nowMs()) },
      push: pushHistory("voltou_aprovacao", who, "Editado depois de aprovado: precisa de nova aprovação"),
    };
  }
  return { set: {}, push: pushHistory("editado", who) };
}

export async function orgOf(org: Org): Promise<any> {
  return Organization.findById(org).lean();
}
