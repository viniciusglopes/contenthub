import type { Types } from "mongoose";
import { accountToken } from "@/lib/instagram/accounts";
import { InstagramApiError, InstagramClient, type FetchLike, getDefaultFetch } from "@/lib/instagram/client";
import { ensureMock } from "@/lib/instagram/mock";
import { InstagramMedia } from "@/models/InstagramMedia";
import Organization from "@/models/Organization";
import SocialAccount from "@/models/SocialAccount";
import { Automation, AutomationCounter, AutomationEvent, AutomationLedger, AutomationRun, Contact } from "@/models/Automation";
import {
  excerpt, hourKey, hourlyCap, isOptOut, keywordMatches, nextHourMs, normalize, validEmail, validPhone,
  withinMessagingWindow, withinPrivateReplyWindow, consentVersion, WINDOW_MS,
} from "./match";
import { automationsGlobal } from "./switches";
import { trackedUrl } from "./links";

/* eslint-disable @typescript-eslint/no-explicit-any */

// MOTOR DAS AUTOMAÇÕES. Lê os eventos guardados pelo webhook (por organização, com trava atômica),
// decide qual automação casa e executa os passos. Regras que valem SEMPRE (inclusive no ensaio):
//  - comentário da própria conta não dispara nada;
//  - private reply só até 7 dias do comentário e UMA por comentário;
//  - UMA DM por pessoa por post;
//  - direct comum só dentro das 24h da última mensagem RECEBIDA da pessoa (janela); fora dela, não sai.
//    Nunca usamos tag de mensagem (HUMAN_AGENT exige análise da Meta e atendimento humano);
//  - quem pediu para parar não recebe mais nada automático;
//  - teto por hora por conta (AUTOMACOES_HOURLY_CAP, padrão 60, máx. 200; a Meta permite 750 private replies/h);
//  - e-mail/telefone só são guardados DEPOIS do "sim" explícito ao texto de consentimento.

type Org = Types.ObjectId;

export interface EngineOpts {
  now?: number;
  fetchImpl?: FetchLike;
  /** máximo de eventos por organização por rodada */
  limit?: number;
}

export class RetryLater extends Error {
  constructor(public at: number, msg: string) {
    super(msg);
  }
}

const RETRYABLE = new Set(["rede", "temporario", "limite"]);
const MAX_ATTEMPTS = 3;
const LOCK_MS = 5 * 60_000;

interface Step { kind: string; status: "sent" | "dry_run" | "skipped" | "failed" | "done"; detail?: string; payload?: unknown; metaId?: string; metaError?: string; at?: Date }

const metaErr = (e: unknown) => {
  const x = e as any;
  return x instanceof InstagramApiError ? `${x.code ?? ""} ${x.metaMessage || x.message}`.trim().slice(0, 300) : String(x?.message || x).slice(0, 300);
};

/** Execução de UM evento: conta, modo (ensaio/simulação), passos e travas. */
class Exec {
  steps: Step[] = [];
  private client: InstagramClient | null = null;
  constructor(
    public org: Org,
    public orgDoc: any,
    public account: any,
    public now: number,
    public sim: boolean,
    private fetchImpl?: FetchLike
  ) {}

  api(): InstagramClient {
    if (this.sim) throw new Error("simulação nunca chama a Meta");
    if (!this.client) {
      ensureMock();
      this.client = new InstagramClient(accountToken(this.account), this.fetchImpl ?? getDefaultFetch());
    }
    return this.client;
  }
  step(s: Step) {
    this.steps.push({ ...s, at: new Date(this.now) });
  }
  /** "Uma vez só": grava a chave antes de enviar. Ensaio usa chaves próprias; simulação não grava. */
  async once(key: string, dry: boolean): Promise<boolean> {
    if (this.sim) return true;
    try {
      await AutomationLedger.create({ organization: this.org, account: this.account._id, key: dry ? `dry:${key}` : key });
      return true;
    } catch (e: any) {
      if (e?.code === 11000) return false;
      throw e;
    }
  }
  async release(key: string, dry: boolean) {
    if (this.sim) return;
    await AutomationLedger.deleteOne({ organization: this.org, account: this.account._id, key: dry ? `dry:${key}` : key });
  }
  async capLeft(kind: "dm" | "public"): Promise<number> {
    const c: any = await AutomationCounter.findOne({ organization: this.org, account: this.account._id, kind, hour: hourKey(this.now) }).lean();
    return hourlyCap() - (c?.count ?? 0);
  }
  /** Reserva 1 envio no teto da hora (só envio de verdade conta). */
  async reserve(kind: "dm" | "public"): Promise<boolean> {
    const hour = hourKey(this.now);
    const q = { organization: this.org, account: this.account._id, kind, hour };
    const r = await AutomationCounter.updateOne({ ...q, count: { $lt: hourlyCap() } }, { $inc: { count: 1 } });
    if (r.modifiedCount === 1) return true;
    try {
      await AutomationCounter.create({ ...q, count: 1, expiresAt: new Date(nextHourMs(this.now) + 3_600_000) });
      return true;
    } catch (e: any) {
      if (e?.code === 11000) {
        const again = await AutomationCounter.updateOne({ ...q, count: { $lt: hourlyCap() } }, { $inc: { count: 1 } });
        return again.modifiedCount === 1;
      }
      throw e;
    }
  }

  /**
   * Envia (ou registra o ensaio). `to` = comment_id (private reply) ou IGSID (direct, só na janela).
   * Erro passageiro da Meta (rede, instabilidade, limite) libera a trava e pede nova tentativa.
   */
  async send(kind: "public_reply" | "private_reply" | "dm", opts: { dry: boolean; lockKey?: string; commentId?: string; contact?: any; text?: string; message?: Record<string, unknown>; detail?: string }): Promise<boolean> {
    const { dry } = opts;
    const payload = kind === "public_reply" ? { message: opts.text } : { recipient: kind === "private_reply" ? { comment_id: opts.commentId } : { id: opts.contact?.igsid }, message: opts.message };
    if (kind === "dm") {
      if (!withinMessagingWindow(opts.contact?.lastInboundAt, this.now)) {
        this.step({ kind, status: "skipped", detail: "Fora da janela de 24h desde a última mensagem da pessoa: a Meta não permite enviar.", payload });
        return false;
      }
    }
    if (dry) {
      this.step({ kind, status: "dry_run", detail: opts.detail || (this.sim ? "Simulação: nada foi enviado." : "Modo ensaio: nada foi enviado."), payload });
      return true;
    }
    if (!(await this.reserve(kind === "public_reply" ? "public" : "dm"))) {
      // outro evento pegou a última vaga da hora: volta para a fila na hora seguinte
      if (opts.lockKey) await this.release(opts.lockKey, dry);
      throw new RetryLater(nextHourMs(this.now) + Math.floor(Math.random() * 300_000), `teto de ${hourlyCap()} envios por hora`);
    }
    try {
      let metaId = "";
      if (kind === "public_reply") metaId = await this.api().replyToComment(opts.commentId!, opts.text!);
      else {
        const r = await this.api().sendMessage(this.account.accountId, payload.recipient as any, opts.message!);
        metaId = r.messageId;
      }
      this.step({ kind, status: "sent", payload, metaId, detail: opts.detail });
      return true;
    } catch (e) {
      if (e instanceof InstagramApiError && RETRYABLE.has(e.kind)) {
        if (opts.lockKey) await this.release(opts.lockKey, dry);
        throw new RetryLater(this.now + 2 * 60_000, `${kind}: ${metaErr(e)}`);
      }
      this.step({ kind, status: "failed", payload, metaError: metaErr(e), detail: e instanceof InstagramApiError ? e.friendly : "Erro ao enviar." });
      return false;
    }
  }
}

// ---------- contatos ----------

/** Cria/atualiza o contato. `inboundAt` só AVANÇA a janela (mensagem antiga processada depois não a encolhe). */
async function touchContact(x: Exec, igsid: string, set: Record<string, unknown>, source: string, inboundAt?: Date): Promise<any> {
  if (x.sim) {
    const existing: any = await Contact.findOne({ organization: x.org, account: x.account._id, igsid }).lean();
    const base = existing || { igsid, tags: [], fields: {}, pending: {}, consent: {} };
    const last = base.lastInboundAt && inboundAt && new Date(base.lastInboundAt) > inboundAt ? base.lastInboundAt : inboundAt ?? base.lastInboundAt;
    return { ...base, ...set, lastInboundAt: last ?? null, _virtual: true };
  }
  return Contact.findOneAndUpdate(
    { organization: x.org, account: x.account._id, igsid },
    { $set: set, ...(inboundAt ? { $max: { lastInboundAt: inboundAt } } : {}), $setOnInsert: { project: x.account.project, source, firstSeenAt: new Date(x.now) } },
    { upsert: true, returnDocument: "after" }
  ).lean();
}
async function updateContact(x: Exec, contact: any, update: Record<string, unknown>) {
  if (x.sim || !contact?._id) return;
  await Contact.updateOne({ _id: contact._id, organization: x.org }, update);
}
async function addTags(x: Exec, contact: any, tags: string[]) {
  const t = tags.filter(Boolean);
  if (!t.length) return;
  await updateContact(x, contact, { $addToSet: { tags: { $each: t } } });
  x.step({ kind: "tag", status: "done", detail: t.join(", ") });
}

// ---------- mensagens montadas a partir da automação ----------

export function buildDm(a: any, org: Org): Record<string, unknown> {
  const buttons: any[] = (a.dm?.buttons || []).slice(0, 3).map((b: any, i: number) =>
    b.kind === "postback"
      ? { type: "postback", title: b.title, payload: `b:${a._id}:${i}` }
      : { type: "web_url", title: b.title, url: trackedUrl(org, b.linkCode) || b.url }
  );
  if (a.ask?.enabled && buttons.length < 3) buttons.push({ type: "postback", title: a.ask.buttonTitle || "Quero receber", payload: `ask:${a._id}` });
  const message: Record<string, unknown> = buttons.length
    ? { attachment: { type: "template", payload: { template_type: "button", text: a.dm.text, buttons } } }
    : { text: a.dm.text };
  const qr = (a.dm?.quickReplies || []).slice(0, 13);
  if (qr.length) message.quick_replies = qr.map((q: any, i: number) => ({ content_type: "text", title: q.title, payload: `q:${a._id}:${i}` }));
  return message;
}

const FIELD_PT: Record<string, string> = { email: "e-mail", phone: "telefone (WhatsApp)" };
export function defaultConsent(field: string, orgName: string): string {
  return `Para te enviar o material, a ${orgName} precisa guardar o seu ${FIELD_PT[field] || field} e usar só para falar com você sobre este assunto. Você pode pedir para apagar quando quiser. Você autoriza?`;
}
export function defaultQuestion(field: string): string {
  return field === "phone" ? "Perfeito! Qual o seu telefone com DDD?" : "Perfeito! Qual o seu melhor e-mail?";
}
const consentTextOf = (a: any, orgDoc: any) => (a.ask?.consentText || "").trim() || defaultConsent(a.ask?.field || "email", orgDoc?.brand?.displayName || orgDoc?.name || "empresa");

// ---------- escopo do post ----------

async function scopeMatches(x: Exec, a: any, mediaId: string): Promise<boolean> {
  const t = a.trigger || {};
  if (t.scope === "all") return true;
  if (t.scope === "posts") return (t.mediaIds || []).includes(mediaId);
  // "próximo post": o primeiro publicado depois de `nextAfter`; ao casar, fica preso a ele
  if ((t.mediaIds || []).length) return t.mediaIds.includes(mediaId);
  if (!t.nextAfter) return false;
  const media: any = await InstagramMedia.findOne({ organization: x.org, account: x.account._id, igId: mediaId }).select("timestamp").lean();
  let ts = media?.timestamp ? new Date(media.timestamp).getTime() : NaN;
  if (!Number.isFinite(ts) && !x.sim) {
    try {
      const iso = await x.api().getMediaTimestamp(mediaId);
      ts = iso ? new Date(iso).getTime() : NaN;
    } catch { /* sem data: não casa */ }
  }
  if (!Number.isFinite(ts) || ts < new Date(t.nextAfter).getTime()) return false;
  if (x.sim) return true;
  await Automation.updateOne({ _id: a._id, organization: x.org, "trigger.mediaIds.0": { $exists: false } }, { $set: { "trigger.mediaIds": [mediaId] } });
  const fresh: any = await Automation.findOne({ _id: a._id, organization: x.org }).select("trigger.mediaIds").lean();
  return (fresh?.trigger?.mediaIds || []).includes(mediaId);
}

// ---------- registro ----------

function runStatus(steps: Step[], dry: boolean): string {
  const real = steps.filter((s) => s.kind !== "tag");
  if (real.some((s) => s.status === "failed")) return real.some((s) => s.status === "sent") ? "partial" : "failed";
  if (real.length && real.every((s) => s.status === "skipped")) return "skipped";
  if (dry || real.some((s) => s.status === "dry_run")) return "dry_run";
  return "done";
}

async function saveRun(x: Exec, ev: any, a: any | null, contact: any, base: Record<string, unknown>, dry: boolean) {
  const status = runStatus(x.steps, dry);
  const run = await AutomationRun.create({
    organization: x.org,
    account: x.account._id,
    automation: a?._id ?? null,
    automationName: a?.name || "",
    contact: contact?._id && !contact._virtual ? contact._id : null,
    eventKey: ev.key,
    dryRun: dry,
    simulated: x.sim,
    status,
    steps: x.steps,
    ...base,
  });
  if (a && !x.sim) {
    const inc: Record<string, number> = { "stats.matched": base.trigger === "comment" || base.trigger === "dm" ? 1 : 0 };
    for (const s of x.steps) {
      if (s.status === "sent" && s.kind === "public_reply") inc["stats.publicSent"] = (inc["stats.publicSent"] || 0) + 1;
      if (s.status === "sent" && (s.kind === "private_reply" || s.kind === "dm")) inc["stats.dmSent"] = (inc["stats.dmSent"] || 0) + 1;
      if (s.kind === "lead" && s.status === "done") inc["stats.leads"] = (inc["stats.leads"] || 0) + 1;
    }
    if (status === "dry_run") inc["stats.dryRuns"] = 1;
    if (status === "skipped") inc["stats.skipped"] = 1;
    if (status === "failed" || status === "partial") inc["stats.failed"] = 1;
    await Automation.updateOne({ _id: a._id, organization: x.org }, { $inc: inc, $set: { "stats.lastRunAt": new Date(x.now) } });
  }
  return run;
}

// ---------- comentário ----------

async function onComment(x: Exec, ev: any, forced: any | null) {
  const d = ev.data || {};
  const own = d.fromId && String(d.fromId) === String(x.account.accountId);
  const ownName = d.fromUsername && x.account.username && String(d.fromUsername).toLowerCase() === String(x.account.username).toLowerCase();
  if (!d.fromId || own || ownName) return { note: "comentário da própria conta (ou sem autor): ignorado" };
  const list: any[] = forced ? [forced] : await Automation.find({ organization: x.org, account: x.account._id, active: true, "trigger.kind": "comment" }).sort({ createdAt: 1 }).lean();
  let a: any = null;
  let word: string | null = null;
  for (const cand of list) {
    word = cand.trigger?.anyText ? "(qualquer comentário)" : keywordMatches(d.text, cand.trigger?.keywords || [], cand.trigger?.match);
    if (!word) continue;
    if (!(await scopeMatches(x, cand, d.mediaId))) continue;
    a = cand;
    break;
  }
  if (!a) return { note: "nenhuma automação casou" };
  const dry = x.sim || a.dryRun !== false;
  // teto por hora: conferido ANTES de qualquer envio (se faltar, o evento volta para a fila na próxima hora)
  if (!dry) {
    if (a.publicReplies?.length && (await x.capLeft("public")) <= 0) throw new RetryLater(nextHourMs(x.now) + Math.floor(Math.random() * 300_000), "teto por hora (respostas públicas)");
    if (a.dm?.text && (await x.capLeft("dm")) <= 0) throw new RetryLater(nextHourMs(x.now) + Math.floor(Math.random() * 300_000), "teto por hora (DMs)");
  }
  const contact = await touchContact(x, String(d.fromId), { username: d.fromUsername || "" }, "comment");
  const base = { trigger: "comment", mediaIgId: d.mediaId, commentId: d.commentId, username: d.fromUsername || "", text: excerpt(d.text) };
  if (contact?.optOutAt) {
    x.step({ kind: "optout", status: "skipped", detail: "A pessoa pediu para parar de receber mensagens automáticas." });
    await saveRun(x, ev, a, contact, base, dry);
    return { note: "contato pediu para parar" };
  }
  // 1) resposta pública, em rodízio
  const replies = (a.publicReplies || []).filter((s: string) => s.trim());
  if (replies.length) {
    const key = `pub:${d.commentId}`;
    if (await x.once(key, dry)) {
      let idx = 0;
      if (!x.sim) {
        const upd: any = await Automation.findOneAndUpdate({ _id: a._id, organization: x.org }, { $inc: { rotation: 1 } }, { returnDocument: "before" }).select("rotation").lean();
        idx = Number(upd?.rotation ?? 0);
      }
      const text = replies[idx % replies.length];
      await x.send("public_reply", { dry, lockKey: key, commentId: d.parentId || d.commentId, text, detail: `Palavra: ${word}` });
    } else x.step({ kind: "public_reply", status: "skipped", detail: "Este comentário já foi respondido." });
  }
  // 2) private reply (DM a partir do comentário)
  if ((a.dm?.text || "").trim()) {
    const at = new Date(ev.eventAt).getTime();
    if (!withinPrivateReplyWindow(at, x.now)) x.step({ kind: "private_reply", status: "skipped", detail: "Comentário com mais de 7 dias: a Meta não permite DM a partir dele." });
    else if (!(await x.once(`dm-comment:${d.commentId}`, dry))) x.step({ kind: "private_reply", status: "skipped", detail: "Este comentário já recebeu DM (a Meta permite uma por comentário)." });
    else if (!(await x.once(`dm-post:${d.mediaId}:${d.fromId}`, dry))) x.step({ kind: "private_reply", status: "skipped", detail: "Essa pessoa já recebeu a DM deste post." });
    else {
      const ok = await x.send("private_reply", { dry, commentId: d.commentId, message: buildDm(a, x.org) }).catch(async (e) => {
        await x.release(`dm-comment:${d.commentId}`, dry);
        await x.release(`dm-post:${d.mediaId}:${d.fromId}`, dry);
        throw e;
      });
      if (!ok && !dry) await x.release(`dm-post:${d.mediaId}:${d.fromId}`, dry);
      if (ok) await updateContact(x, contact, { $set: { lastOutboundAt: new Date(x.now) } });
    }
  }
  await addTags(x, contact, a.tags || []);
  await saveRun(x, ev, a, contact, base, dry);
  return { note: "" };
}

// ---------- direct: palavra, botões, pedir e-mail/telefone ----------

async function automationById(x: Exec, id: string, forced: any | null): Promise<any | null> {
  if (forced && String(forced._id) === id) return forced;
  if (!/^[0-9a-f]{24}$/i.test(id)) return null;
  // botão de uma automação desligada depois não age mais
  return Automation.findOne({ _id: id, organization: x.org, account: x.account._id, active: true }).lean();
}

async function askConsent(x: Exec, a: any, contact: any, dry: boolean) {
  const text = consentTextOf(a, x.orgDoc);
  const message = { text, quick_replies: [{ content_type: "text", title: "Sim, autorizo", payload: `ask-yes:${a._id}` }, { content_type: "text", title: "Não", payload: `ask-no:${a._id}` }] };
  x.step({ kind: "ask", status: "done", detail: `Pedido de consentimento (${FIELD_PT[a.ask.field] || a.ask.field}).` });
  await updateContact(x, contact, { $set: { pending: { automation: a._id, step: "consent", tries: 0, at: new Date(x.now) } } });
  await x.send("dm", { dry, contact, message });
}

async function consentYes(x: Exec, a: any, contact: any, dry: boolean) {
  const text = consentTextOf(a, x.orgDoc);
  const version = await consentVersion(text);
  // o "sim" é guardado com data, texto e versão do texto; o valor ainda não existe
  await updateContact(x, contact, { $set: { "consent.given": true, "consent.at": new Date(x.now), "consent.text": text, "consent.version": version, "consent.automation": a._id, "consent.refusedAt": null, pending: { automation: a._id, step: "value", tries: 0, at: new Date(x.now) } } });
  x.step({ kind: "consent", status: "done", detail: `Autorizou (texto ${version}).` });
  await x.send("dm", { dry, contact, message: { text: (a.ask.question || "").trim() || defaultQuestion(a.ask.field) } });
}

async function consentNo(x: Exec, a: any, contact: any, dry: boolean) {
  await updateContact(x, contact, { $set: { "consent.refusedAt": new Date(x.now), pending: { automation: null, step: "", tries: 0, at: null } } });
  x.step({ kind: "consent", status: "skipped", detail: "Não autorizou: nada foi guardado." });
  await x.send("dm", { dry, contact, message: { text: "Tudo bem! Não guardei nenhum dado seu." } });
}

async function handlePayload(x: Exec, payload: string, contact: any, forced: any | null): Promise<any | null> {
  const [kind, id, idx] = payload.split(":");
  const a = await automationById(x, id || "", forced);
  if (!a) {
    x.step({ kind: "dm", status: "skipped", detail: "Botão de uma automação que não existe mais ou está desligada." });
    return null;
  }
  const dry = x.sim || a.dryRun !== false;
  if (kind === "b" || kind === "q") {
    const item = kind === "b" ? a.dm?.buttons?.[Number(idx)] : a.dm?.quickReplies?.[Number(idx)];
    if (!item) return a;
    if ((item.replyText || "").trim()) await x.send("dm", { dry, contact, message: { text: item.replyText } });
    if (item.tag) await addTags(x, contact, [item.tag]);
    return a;
  }
  if (!a.ask?.enabled) return a;
  if (kind === "ask") await askConsent(x, a, contact, dry);
  else if (kind === "ask-yes") await consentYes(x, a, contact, dry);
  else if (kind === "ask-no") await consentNo(x, a, contact, dry);
  return a;
}

const YES = ["sim", "s", "autorizo", "sim autorizo", "pode", "ok"];
const NO = ["nao", "n", "nao autorizo"];

async function handlePending(x: Exec, contact: any, text: string, forced: any | null): Promise<any | null> {
  const p = contact.pending || {};
  const a = await automationById(x, String(p.automation || ""), forced);
  if (!a || !a.ask?.enabled) {
    await updateContact(x, contact, { $set: { pending: { automation: null, step: "", tries: 0, at: null } } });
    return null;
  }
  const dry = x.sim || a.dryRun !== false;
  const t = normalize(text);
  if (p.step === "consent") {
    if (YES.includes(t)) await consentYes(x, a, contact, dry);
    else if (NO.includes(t)) await consentNo(x, a, contact, dry);
    else if ((p.tries || 0) < 1) {
      await updateContact(x, contact, { $inc: { "pending.tries": 1 } });
      x.step({ kind: "ask", status: "done", detail: "Resposta não entendida: perguntou de novo." });
      await x.send("dm", { dry, contact, message: { text: "Só para confirmar: você autoriza? Responda SIM ou NÃO.", quick_replies: [{ content_type: "text", title: "Sim, autorizo", payload: `ask-yes:${a._id}` }, { content_type: "text", title: "Não", payload: `ask-no:${a._id}` }] } });
    } else {
      await updateContact(x, contact, { $set: { pending: { automation: null, step: "", tries: 0, at: null } } });
      x.step({ kind: "consent", status: "skipped", detail: "Sem resposta clara ao consentimento: desistiu, nada guardado." });
    }
    return a;
  }
  // step "value": validar e-mail/telefone; só chega aqui quem já disse "sim"
  const field = a.ask.field === "phone" ? "phone" : "email";
  const value = field === "phone" ? validPhone(text) : validEmail(text);
  if (value) {
    await updateContact(x, contact, { $set: { [field]: value, pending: { automation: null, step: "", tries: 0, at: null } }, $addToSet: { tags: { $each: (a.tags || []).filter(Boolean) } } });
    x.step({ kind: "lead", status: "done", detail: field === "phone" ? "Telefone guardado com consentimento." : "E-mail guardado com consentimento." });
    await x.send("dm", { dry, contact, message: { text: (a.ask.thanks || "").trim() || "Prontinho, anotado! Obrigado." } });
  } else if ((p.tries || 0) < 2) {
    await updateContact(x, contact, { $inc: { "pending.tries": 1 } });
    x.step({ kind: "ask", status: "done", detail: field === "phone" ? "Telefone inválido: pediu de novo." : "E-mail inválido: pediu de novo." });
    await x.send("dm", { dry, contact, message: { text: field === "phone" ? "Hum, não parece um telefone válido. Manda com DDD, por favor (ex.: 11 91234-5678)." : "Hum, não parece um e-mail válido. Pode mandar de novo?" } });
  } else {
    await updateContact(x, contact, { $set: { pending: { automation: null, step: "", tries: 0, at: null } } });
    x.step({ kind: "lead", status: "skipped", detail: "Três respostas inválidas: desistiu." });
  }
  return a;
}

async function anyLive(x: Exec): Promise<boolean> {
  if (x.sim) return false;
  return Boolean(await Automation.exists({ organization: x.org, account: x.account._id, active: true, dryRun: false }));
}

async function onMessage(x: Exec, ev: any, forced: any | null) {
  const d = ev.data || {};
  if (d.echo || !d.senderId || String(d.senderId) === String(x.account.accountId)) return { note: "mensagem enviada pela própria conta: ignorada" };
  const at = new Date(Math.min(new Date(ev.eventAt).getTime(), x.now));
  const isPostback = ev.field === "messaging_postbacks";
  // toda mensagem recebida abre (ou renova) a janela de 24h
  let contact = await touchContact(x, String(d.senderId), {}, isPostback ? "postback" : "dm", at);
  const text = String(d.text || "");
  const base = { trigger: isPostback ? "postback" : d.quickReply ? "quick_reply" : "dm", username: contact.username || "", text: excerpt(isPostback ? d.title : text) };

  if (!isPostback && isOptOut(text)) {
    await updateContact(x, contact, { $set: { optOutAt: new Date(x.now), pending: { automation: null, step: "", tries: 0, at: null } } });
    x.step({ kind: "optout", status: "done", detail: "Pediu para parar: não recebe mais mensagens automáticas." });
    const dry = !(await anyLive(x));
    await x.send("dm", { dry, contact, message: { text: "Pronto, você não vai mais receber mensagens automáticas. Se mudar de ideia, é só mandar a palavra de novo." } });
    await saveRun(x, ev, null, contact, base, dry);
    return { note: "" };
  }
  // pending expirado (mais de 24h) é descartado
  const pend = contact.pending || {};
  if (pend.step && pend.at && x.now - new Date(pend.at).getTime() > WINDOW_MS) {
    await updateContact(x, contact, { $set: { pending: { automation: null, step: "", tries: 0, at: null } } });
    contact = { ...contact, pending: {} };
  }

  let a: any = null;
  const payload = isPostback ? String(d.payload || "") : String(d.quickReply || "");
  if (payload && /^(b|q|ask|ask-yes|ask-no):/.test(payload)) {
    if (contact.optOutAt) return { note: "contato pediu para parar" };
    a = await handlePayload(x, payload, contact, forced);
  } else if (!isPostback && contact.pending?.step) {
    if (contact.optOutAt) return { note: "contato pediu para parar" };
    base.trigger = "input"; // resposta a um pedido (consentimento/e-mail): não conta como novo disparo
    a = await handlePending(x, contact, text, forced);
  } else if (!isPostback) {
    const list: any[] = forced ? [forced] : await Automation.find({ organization: x.org, account: x.account._id, active: true, "trigger.kind": "dm" }).sort({ createdAt: 1 }).lean();
    for (const cand of list) {
      const word = cand.trigger?.anyText ? "(qualquer mensagem)" : keywordMatches(text, cand.trigger?.keywords || [], cand.trigger?.match);
      if (!word) continue;
      a = cand;
      const dry = x.sim || a.dryRun !== false;
      if (contact.optOutAt) {
        // mandar a palavra de novo é pedido explícito: volta a receber
        await updateContact(x, contact, { $set: { optOutAt: null } });
        x.step({ kind: "optout", status: "done", detail: "Mandou a palavra de novo: voltou a receber." });
      }
      if (!dry && (await x.capLeft("dm")) <= 0) throw new RetryLater(nextHourMs(x.now), "teto por hora (DMs)");
      if ((a.dm?.text || "").trim()) await x.send("dm", { dry, contact, message: buildDm(a, x.org), detail: `Palavra: ${word}` });
      await addTags(x, contact, a.tags || []);
      break;
    }
  }
  if (!x.steps.length) return { note: a ? "" : "nenhuma automação casou" };
  await saveRun(x, ev, a, contact, base, x.sim || (a ? a.dryRun !== false : true));
  return { note: "" };
}

// ---------- fila ----------

export async function processEvent(org: Org, ev: any, opts: EngineOpts & { forced?: any } = {}): Promise<{ note: string; run?: any }> {
  const now = opts.now ?? Date.now();
  const [orgDoc, account] = await Promise.all([
    Organization.findById(org).select("name brand automationsEnabled active").lean(),
    SocialAccount.findOne({ _id: ev.account, organization: org }).lean(),
  ]);
  if (!account || !(account as any).active) return { note: "conta desconectada" };
  const x = new Exec(org, orgDoc, account, now, ev.simulated === true, opts.fetchImpl);
  const forced = opts.forced ?? null;
  const r = ev.field === "comments" ? await onComment(x, ev, forced) : await onMessage(x, ev, forced);
  return { note: r.note, run: x.steps };
}

/** Uma rodada: para cada organização com a chave ligada, pega os eventos vencidos com trava atômica. */
export async function processDue(opts: EngineOpts = {}) {
  const now = opts.now ?? Date.now();
  const out = { enabled: automationsGlobal(), organizations: 0, processed: 0, deferred: 0, failed: 0 };
  if (!out.enabled) return out;
  const orgs: any[] = await Organization.find({ active: true, automationsEnabled: true }).select("_id").lean();
  out.organizations = orgs.length;
  for (const o of orgs) {
    for (let i = 0; i < (opts.limit ?? 50); i++) {
      const ev: any = await AutomationEvent.findOneAndUpdate(
        { organization: o._id, $or: [{ status: "pending", runAfter: { $lte: new Date(now) } }, { status: "processing", lockedAt: { $lt: new Date(now - LOCK_MS) } }] },
        { $set: { status: "processing", lockedAt: new Date(now) }, $inc: { attempts: 1 } },
        { sort: { runAfter: 1 }, returnDocument: "after" }
      ).lean();
      if (!ev) break;
      try {
        const r = await processEvent(o._id, ev, { ...opts, now });
        await AutomationEvent.updateOne({ _id: ev._id, organization: o._id }, { $set: { status: "done", processedAt: new Date(now), note: r.note, lockedAt: null } });
        out.processed++;
      } catch (e: any) {
        const retry = e instanceof RetryLater;
        if (retry && (e.message.startsWith("teto") || ev.attempts < MAX_ATTEMPTS)) {
          // teto por hora não gasta tentativa
          const upd: Record<string, unknown> = { status: "pending", runAfter: new Date(e.at), lockedAt: null, note: `Nova tentativa: ${e.message}` };
          await AutomationEvent.updateOne({ _id: ev._id, organization: o._id }, { $set: upd, ...(e.message.startsWith("teto") ? { $inc: { attempts: -1 } } : {}) });
          out.deferred++;
        } else {
          const note = String(e?.message || e).slice(0, 300);
          await AutomationEvent.updateOne({ _id: ev._id, organization: o._id }, { $set: { status: "failed", lockedAt: null, note } });
          // o erro também aparece no log de execuções (ex.: conta sem token, Meta fora do ar 3 vezes)
          await AutomationRun.create({ organization: o._id, account: ev.account, eventKey: ev.key, trigger: ev.field === "comments" ? "comment" : "dm", dryRun: false, status: "failed", steps: [{ kind: "erro", status: "failed", detail: e?.friendly || note, at: new Date(now) }] }).catch(() => {});
          out.failed++;
          if (!retry) console.error("[automacoes]", e instanceof Error ? `${e.name}: ${e.message}` : "erro");
        }
      }
    }
  }
  return out;
}

// laço do servidor (instrumentation.ts), como o da fila do Estúdio
let timer: ReturnType<typeof setInterval> | null = null;
let busy = false;
export function startAutomationLoop(everyMs = 5_000): void {
  if (timer) return;
  timer = setInterval(async () => {
    if (busy || !automationsGlobal()) return;
    busy = true;
    try {
      await processDue();
    } catch (e) {
      console.error("[automacoes] laço", e instanceof Error ? e.message : "erro");
    } finally {
      busy = false;
    }
  }, everyMs);
  timer.unref?.();
}
