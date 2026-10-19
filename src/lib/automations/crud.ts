import { randomBytes } from "node:crypto";
import type { Types } from "mongoose";
import { FriendlyError, notFound } from "@/lib/errors";
import { InstagramClient, getDefaultFetch, type FetchLike } from "@/lib/instagram/client";
import { accountToken } from "@/lib/instagram/accounts";
import { ensureMock } from "@/lib/instagram/mock";
import { audit } from "@/lib/orgs";
import type { Session } from "@/lib/session";
import { toObjectId } from "@/lib/tenant";
import { InstagramMedia } from "@/models/InstagramMedia";
import SocialAccount from "@/models/SocialAccount";
import { Automation, AutomationLedger, AutomationRun, Contact, TrackedLink } from "@/models/Automation";
import { ConsentLog, LeadAdsEvent, LeadEvent, LeadTask } from "@/models/Crm";
import { LIMITS, excerpt, hourlyCap } from "./match";
import { ensureLinks, safeHttpUrl, trackedUrl } from "./links";
import { automationSwitch } from "./switches";
import { defaultConsent, defaultQuestion, processEvent } from "./engine";
import { WEBHOOK_FIELDS } from "./webhook";
import { resolveStage } from "@/lib/crm/pipelines";
import { ownUser } from "@/lib/crm/leads";
import { cleanTags } from "@/lib/crm/pure";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Org = Types.ObjectId;

const bad = (msg: string, field: string) => new FriendlyError(msg, 400, field);
const text = (v: unknown, max: number, field: string, label: string): string => {
  const s = String(v ?? "").trim();
  if (s.length > max) throw bad(`${label}: no máximo ${max} caracteres.`, field);
  return s;
};
const list = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : []).map((s) => String(s ?? "").trim()).filter(Boolean);

async function ownInstagramAccount(org: Org, id: unknown): Promise<any> {
  const oid = toObjectId(id);
  const acc = oid ? await SocialAccount.findOne({ _id: oid, organization: org, platform: "instagram" }).lean() : null;
  if (!acc) throw notFound("Conta do Instagram");
  return acc;
}

export async function ownAutomation(org: Org, id: unknown): Promise<any> {
  const oid = toObjectId(id);
  const a = oid ? await Automation.findOne({ _id: oid, organization: org }) : null;
  if (!a) throw notFound("Automação");
  return a;
}

/** Confere e normaliza o que veio da tela. Devolve só campos conhecidos. */
export function cleanAutomation(b: Record<string, any>, currentDoc?: any): Record<string, any> {
  const out: Record<string, any> = {};
  const current = currentDoc ? (typeof currentDoc.toObject === "function" ? currentDoc.toObject() : currentDoc) : null;
  if (b.name !== undefined || !current) {
    const name = text(b.name, LIMITS.name, "name", "Nome");
    if (name.length < 2) throw bad("Dê um nome para a automação.", "name");
    out.name = name;
  }
  const t = { ...(current?.trigger ?? {}), ...(b.trigger || {}) };
  const kind = t.kind === "dm" ? "dm" : "comment";
  const scope = ["posts", "all", "next"].includes(t.scope) ? t.scope : "posts";
  const keywords = list(t.keywords).map((k) => k.slice(0, LIMITS.keyword + 1));
  if (keywords.some((k) => k.length > LIMITS.keyword)) throw bad(`Palavra-chave: no máximo ${LIMITS.keyword} caracteres.`, "keywords");
  if (keywords.length > LIMITS.keywords) throw bad(`No máximo ${LIMITS.keywords} palavras.`, "keywords");
  const anyText = t.anyText === true;
  if (!anyText && !keywords.length) throw bad("Diga pelo menos uma palavra (ex.: QUERO).", "keywords");
  const mediaIds = list(t.mediaIds);
  if (mediaIds.some((m) => !/^\d{5,30}$/.test(m))) throw bad("Post inválido.", "mediaIds");
  if (kind === "comment" && scope === "posts" && !mediaIds.length) throw bad("Escolha pelo menos um post (ou mude para todos os posts / próximo post).", "mediaIds");
  const scopeChanged = !current || current.trigger?.scope !== scope;
  out.trigger = {
    kind,
    scope,
    mediaIds: kind === "comment" && scope !== "all" ? (scope === "next" && scopeChanged ? [] : mediaIds.slice(0, 50)) : [],
    nextAfter: kind === "comment" && scope === "next" ? (scopeChanged || !current?.trigger?.nextAfter ? new Date() : current.trigger.nextAfter) : null,
    keywords,
    match: ["word", "contains", "exact"].includes(t.match) ? t.match : "word",
    anyText,
  };

  const replies = b.publicReplies !== undefined ? list(b.publicReplies) : current ? [...(current.publicReplies || [])] : [];
  if (replies.length > LIMITS.publicReplies) throw bad(`No máximo ${LIMITS.publicReplies} respostas públicas.`, "publicReplies");
  if (replies.some((r) => r.length > LIMITS.publicReply)) throw bad(`Resposta pública: no máximo ${LIMITS.publicReply} caracteres.`, "publicReplies");
  out.publicReplies = kind === "comment" ? replies : [];

  const dmIn = b.dm !== undefined ? b.dm || {} : current?.dm ?? {};
  const dmText = text(dmIn.text, LIMITS.dmText, "dm.text", "Mensagem da DM");
  const buttons = (Array.isArray(dmIn.buttons) ? dmIn.buttons : []).map((x: any, i: number) => {
    const title = text(x?.title, LIMITS.buttonTitle, `dm.buttons.${i}.title`, "Texto do botão");
    if (!title) throw bad("Escreva o texto do botão.", `dm.buttons.${i}.title`);
    if (x?.kind === "postback") {
      const replyText = text(x?.replyText, LIMITS.replyText, `dm.buttons.${i}.replyText`, "Resposta do botão");
      const tag = text(x?.tag, LIMITS.tag, `dm.buttons.${i}.tag`, "Etiqueta");
      if (!replyText && !tag) throw bad("Diga o que o botão responde (ou a etiqueta que ele põe).", `dm.buttons.${i}.replyText`);
      return { kind: "postback", title, url: "", linkCode: "", replyText, tag };
    }
    const url = safeHttpUrl(x?.url);
    if (!url) throw bad("Link inválido: use o endereço completo (https://...).", `dm.buttons.${i}.url`);
    return { kind: "url", title, url, linkCode: String(x?.linkCode || "").slice(0, 20), replyText: "", tag: "" };
  });
  const qrs = (Array.isArray(dmIn.quickReplies) ? dmIn.quickReplies : []).map((x: any, i: number) => {
    const title = text(x?.title, LIMITS.quickTitle, `dm.quickReplies.${i}.title`, "Resposta rápida");
    if (!title) throw bad("Escreva o texto da resposta rápida.", `dm.quickReplies.${i}.title`);
    return { title, replyText: text(x?.replyText, LIMITS.replyText, `dm.quickReplies.${i}.replyText`, "Resposta"), tag: text(x?.tag, LIMITS.tag, `dm.quickReplies.${i}.tag`, "Etiqueta") };
  });
  if (qrs.length > LIMITS.quickReplies) throw bad(`No máximo ${LIMITS.quickReplies} respostas rápidas.`, "dm.quickReplies");

  const askIn = b.ask !== undefined ? b.ask || {} : current?.ask ?? {};
  const ask = {
    enabled: askIn.enabled === true,
    field: askIn.field === "phone" ? "phone" : "email",
    buttonTitle: text(askIn.buttonTitle || "Quero receber", LIMITS.buttonTitle, "ask.buttonTitle", "Botão de pedir o contato"),
    consentText: text(askIn.consentText, LIMITS.consentText, "ask.consentText", "Texto de consentimento"),
    question: text(askIn.question, LIMITS.question, "ask.question", "Pergunta"),
    thanks: text(askIn.thanks, LIMITS.question, "ask.thanks", "Agradecimento"),
  };
  if (buttons.length > (ask.enabled ? LIMITS.buttons - 1 : LIMITS.buttons))
    throw bad(ask.enabled ? "Com o pedido de e-mail/telefone ligado, cabem só 2 botões (o 3º é o de pedir)." : "No máximo 3 botões.", "dm.buttons");
  if (ask.enabled && !dmText) throw bad("Para pedir e-mail/telefone, escreva a mensagem da DM (o botão vai nela).", "dm.text");
  if (kind === "dm" && !dmText) throw bad("Escreva a mensagem que a automação manda.", "dm.text");
  if (kind === "comment" && !dmText && !replies.length) throw bad("Escreva a resposta pública, a DM, ou as duas.", "dm.text");
  out.dm = { text: dmText, buttons, quickReplies: qrs };
  out.ask = ask;

  if (b.tags !== undefined || !current) {
    const tags = [...new Set(list(b.tags))];
    if (tags.length > LIMITS.tags) throw bad(`No máximo ${LIMITS.tags} etiquetas.`, "tags");
    if (tags.some((x) => x.length > LIMITS.tag)) throw bad(`Etiqueta: no máximo ${LIMITS.tag} caracteres.`, "tags");
    out.tags = tags;
  }
  return out;
}

/** Passo "Enviar para o CRM": confere funil, etapa e responsável (todos desta organização). */
export async function cleanCrmStep(org: Org, raw: unknown, current?: any): Promise<Record<string, any> | undefined> {
  if (raw === undefined) return undefined;
  const b: any = raw && typeof raw === "object" ? raw : {};
  if (b.enabled !== true) return { enabled: false, pipeline: current?.crm?.pipeline ?? null, stage: current?.crm?.stage ?? "", owner: current?.crm?.owner ?? null, tags: current?.crm?.tags ?? [] };
  const { pipeline, stage } = await resolveStage(org, b.pipeline || null, b.stage || "");
  const owner = b.owner ? await ownUser(org, b.owner) : null;
  const tags = cleanTags(b.tags);
  return { enabled: true, pipeline: pipeline._id, stage: stage.key, owner: owner?._id ?? null, tags };
}

export async function createAutomation(org: Org, session: Session, b: Record<string, any>) {
  const account = await ownInstagramAccount(org, b.account);
  const fields = cleanAutomation(b);
  const crm = await cleanCrmStep(org, b.crm);
  if (crm) fields.crm = crm;
  const wantsLive = b.active === true || b.dryRun === false;
  if (wantsLive && !session.canManage) throw new FriendlyError("Só o dono da conta liga uma automação. Salve e peça para ele ligar.", 403);
  const a = new Automation({ organization: org, project: account.project, account: account._id, ...fields, active: b.active === true, dryRun: b.dryRun !== false, createdBy: session.user?._id ?? null });
  await ensureLinks(org, a);
  await a.save();
  return a;
}

export async function updateAutomation(org: Org, session: Session, id: unknown, b: Record<string, any>, ip?: string) {
  const a = await ownAutomation(org, id);
  const fields = cleanAutomation(b, a);
  const crm = await cleanCrmStep(org, b.crm, a);
  if (crm) fields.crm = crm;
  Object.assign(a, fields);
  const prev = { active: a.active, dryRun: a.dryRun };
  if (b.active !== undefined && Boolean(b.active) !== a.active) {
    if (!session.canManage) throw new FriendlyError("Só o dono da conta liga ou desliga uma automação.", 403);
    a.active = Boolean(b.active);
  }
  if (b.dryRun !== undefined && Boolean(b.dryRun) !== a.dryRun) {
    if (!session.canManage) throw new FriendlyError("Só o dono da conta tira uma automação do modo ensaio.", 403);
    if (b.dryRun === false && b.confirm !== true) throw new FriendlyError("Confirme: fora do ensaio, a automação responde e manda DM de verdade no Instagram.", 409, "confirm");
    a.dryRun = Boolean(b.dryRun);
  }
  await ensureLinks(org, a);
  await a.save();
  if (prev.active !== a.active || prev.dryRun !== a.dryRun)
    await audit({ action: a.active && !a.dryRun ? "automacao.ligada_de_verdade" : a.active ? "automacao.ligada_ensaio" : "automacao.desligada", actor: session.user, organization: org, target: String(a._id), ip });
  return a;
}

export async function deleteAutomation(org: Org, id: unknown) {
  const a = await ownAutomation(org, id);
  await TrackedLink.deleteMany({ organization: org, automation: a._id });
  await Automation.deleteOne({ _id: a._id, organization: org });
}

export async function publicAutomation(org: Org, a: any) {
  const o = typeof a.toObject === "function" ? a.toObject() : a;
  const links: any[] = await TrackedLink.find({ organization: org, automation: o._id }).select("code clicks url").lean();
  const clicks = new Map(links.map((l) => [l.code, l.clicks]));
  return {
    _id: String(o._id),
    project: String(o.project),
    account: String(o.account),
    name: o.name,
    trigger: { ...o.trigger, mediaIds: o.trigger?.mediaIds || [] },
    publicReplies: o.publicReplies || [],
    dm: {
      text: o.dm?.text || "",
      buttons: (o.dm?.buttons || []).map((b: any) => ({ ...b, trackedUrl: b.kind === "url" ? trackedUrl(org, b.linkCode) : "", clicks: clicks.get(b.linkCode) ?? 0 })),
      quickReplies: o.dm?.quickReplies || [],
    },
    ask: { ...o.ask, defaultConsent: defaultConsent(o.ask?.field || "email", "{nome da sua empresa}"), defaultQuestion: defaultQuestion(o.ask?.field || "email") },
    tags: o.tags || [],
    crm: { enabled: o.crm?.enabled === true, pipeline: o.crm?.pipeline ? String(o.crm.pipeline) : "", stage: o.crm?.stage || "", owner: o.crm?.owner ? String(o.crm.owner) : "", tags: o.crm?.tags || [] },
    active: o.active === true,
    dryRun: o.dryRun !== false,
    stats: o.stats || {},
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export async function automationsOverview(org: Org, orgDoc: any, project?: Types.ObjectId | null) {
  const q: Record<string, unknown> = { organization: org };
  if (project) q.project = project;
  const [items, accounts] = await Promise.all([
    Automation.find(q).sort({ createdAt: -1 }).lean(),
    SocialAccount.find({ organization: org, platform: "instagram", ...(project ? { project } : {}) }).select("username accountName project active").lean(),
  ]);
  return {
    switch: automationSwitch(orgDoc),
    hourlyCap: hourlyCap(),
    accounts: (accounts as any[]).map((a) => ({ _id: String(a._id), username: a.username || a.accountName, project: String(a.project), active: a.active })),
    automations: await Promise.all((items as any[]).map((a) => publicAutomation(org, a))),
  };
}

/** Posts recentes da conta (para escolher em quais a automação vale). */
export async function recentMedia(org: Org, accountId: unknown) {
  const account = await ownInstagramAccount(org, accountId);
  const medias: any[] = await InstagramMedia.find({ organization: org, account: account._id }).sort({ timestamp: -1 }).limit(40).select("igId caption timestamp thumbnailUrl kind permalink").lean();
  return medias.map((m) => ({ igId: m.igId, caption: excerpt((m.caption || "").split("\n")[0], 90) || "(sem legenda)", timestamp: m.timestamp, thumbnailUrl: m.thumbnailUrl || "", kind: m.kind || "", permalink: m.permalink || "" }));
}

// ---------- execuções ----------

export async function listRuns(org: Org, params: URLSearchParams) {
  const q: Record<string, unknown> = { organization: org };
  const a = toObjectId(params.get("automation"));
  if (params.get("automation")) {
    if (!a) throw notFound("Automação");
    q.automation = a;
  }
  const acc = toObjectId(params.get("account"));
  if (params.get("account")) {
    if (!acc) throw notFound("Conta");
    q.account = acc;
  }
  const status = params.get("status");
  if (status && ["done", "dry_run", "skipped", "failed", "partial"].includes(status)) q.status = status;
  const runs: any[] = await AutomationRun.find(q).sort({ createdAt: -1 }).limit(Math.min(200, Number(params.get("limite")) || 100)).lean();
  return runs.map((r) => ({
    _id: String(r._id), automation: r.automation ? String(r.automation) : null, automationName: r.automationName, account: String(r.account), contact: r.contact ? String(r.contact) : null,
    trigger: r.trigger, mediaIgId: r.mediaIgId, username: r.username, text: r.text, dryRun: r.dryRun, simulated: r.simulated, status: r.status, steps: r.steps, createdAt: r.createdAt,
  }));
}

// ---------- contatos ----------

export function publicContact(c: any) {
  return {
    _id: String(c._id), account: c.account ? String(c.account) : "", igsid: String(c.igsid || "").startsWith("x:") ? "" : c.igsid, username: c.username, name: c.name || "", lead: c.lead === true, tags: c.tags || [], fields: c.fields || {}, email: c.email || "", phone: c.phone || "",
    consent: { given: c.consent?.given === true, at: c.consent?.at || null, version: c.consent?.version || "", text: c.consent?.text || "", refusedAt: c.consent?.refusedAt || null },
    optOutAt: c.optOutAt || null, source: c.source, firstSeenAt: c.firstSeenAt, lastInboundAt: c.lastInboundAt || null,
    windowOpen: Boolean(c.lastInboundAt && Date.now() - new Date(c.lastInboundAt).getTime() <= 86_400_000),
  };
}

export async function listContacts(org: Org, params: URLSearchParams) {
  const q: Record<string, unknown> = { organization: org };
  const acc = params.get("account");
  if (acc) {
    const oid = toObjectId(acc);
    if (!oid) throw notFound("Conta");
    q.account = oid;
  }
  const project = params.get("project");
  if (project) {
    const oid = toObjectId(project);
    if (!oid) throw notFound("Projeto");
    q.project = oid;
  }
  const tag = (params.get("tag") || "").trim();
  if (tag) q.tags = tag;
  const s = (params.get("q") || "").trim().slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (s) q.$or = [{ username: { $regex: s, $options: "i" } }, { email: { $regex: s, $options: "i" } }, { name: { $regex: s, $options: "i" } }];
  if (params.get("lead") === "1") q.$and = [{ $or: [{ email: { $ne: "" } }, { phone: { $ne: "" } }] }];
  const rows: any[] = await Contact.find(q).sort({ lastInboundAt: -1, updatedAt: -1 }).limit(500).lean();
  const tags = await Contact.distinct("tags", { organization: org, ...(q.account ? { account: q.account } : {}), ...(q.project ? { project: q.project } : {}) });
  return { contacts: rows.map(publicContact), tags: (tags as string[]).sort() };
}

const csvCell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // planilha não executa fórmula
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function contactsCsv(rows: ReturnType<typeof publicContact>[]): string {
  const head = ["usuario", "email", "telefone", "etiquetas", "consentimento_em", "versao_do_texto", "parou_em", "ultima_mensagem"];
  const lines = rows.map((c) => [c.username, c.email, c.phone, c.tags.join(" "), c.consent.at ? new Date(c.consent.at).toISOString() : "", c.consent.version, c.optOutAt ? new Date(c.optOutAt).toISOString() : "", c.lastInboundAt ? new Date(c.lastInboundAt).toISOString() : ""].map(csvCell).join(","));
  return "﻿" + [head.join(","), ...lines].join("\n");
}

export async function updateContactFields(org: Org, id: unknown, b: Record<string, any>) {
  const oid = toObjectId(id);
  const c: any = oid ? await Contact.findOne({ _id: oid, organization: org }) : null;
  if (!c) throw notFound("Contato");
  if (b.tags !== undefined) {
    const tags = [...new Set(list(b.tags))];
    if (tags.length > 30 || tags.some((t) => t.length > LIMITS.tag)) throw bad("Etiquetas demais ou longas demais.", "tags");
    c.tags = tags;
  }
  if (b.fields !== undefined) {
    if (!b.fields || typeof b.fields !== "object" || Array.isArray(b.fields)) throw bad("Campos inválidos.", "fields");
    const entries = Object.entries(b.fields as Record<string, unknown>);
    if (entries.length > 20) throw bad("No máximo 20 campos.", "fields");
    const out: Record<string, string> = {};
    for (const [k, v] of entries) {
      if (!/^[a-z0-9_]{1,30}$/.test(k)) throw bad(`Nome de campo inválido: ${k.slice(0, 30)} (use letras minúsculas, números e _).`, "fields");
      out[k] = String(v ?? "").slice(0, 200);
    }
    c.fields = out;
    c.markModified("fields");
  }
  if (b.optOut !== undefined) c.optOutAt = b.optOut ? c.optOutAt || new Date() : null;
  await c.save();
  return c;
}

/** Excluir a pedido (LGPD): apaga o contato, as travas dele e tira o nome/texto das execuções. */
export async function eraseContact(org: Org, session: Session, id: unknown, ip?: string) {
  const oid = toObjectId(id);
  const c: any = oid ? await Contact.findOne({ _id: oid, organization: org }).lean() : null;
  if (!c) throw notFound("Contato");
  await AutomationRun.updateMany({ organization: org, contact: c._id }, { $set: { username: "", text: "", contact: null } });
  const esc = String(c.igsid).replace(/[^\w-]/g, "");
  if (esc) await AutomationLedger.deleteMany({ organization: org, account: c.account, key: { $regex: `:${esc}$` } });
  // CRM: linha do tempo e tarefas somem; o registro de consentimento fica (sem dado pessoal) com "apagado"
  await LeadEvent.deleteMany({ organization: org, contact: c._id });
  await LeadTask.deleteMany({ organization: org, contact: c._id });
  await LeadAdsEvent.updateMany({ organization: org, contact: c._id }, { $set: { contact: null } });
  await Contact.deleteOne({ _id: c._id, organization: org });
  await ConsentLog.create({ organization: org, contact: c._id, action: "erased", channel: "manual", basis: "exclusão a pedido (LGPD)", by: session.user?._id ?? null });
  await audit({ action: "contato.excluido", actor: session.user, organization: org, target: String(c._id), ip });
}

// ---------- simular (sempre ensaio, nunca chama a Meta) ----------

export async function simulate(org: Org, session: Session, b: Record<string, any>) {
  const a: any = await ownAutomation(org, b.automation);
  const msg = String(b.text ?? "").slice(0, 1000);
  if (!msg.trim() && !String(b.payload || "")) throw bad("Escreva o comentário ou a mensagem de teste.", "text");
  const now = Date.now();
  const who = `sim${String(session.userId).slice(-8)}`;
  const kind = a.trigger?.kind === "dm" ? "messages" : "comments";
  const data =
    kind === "comments"
      ? { commentId: `sim${now}`, parentId: "", mediaId: a.trigger?.mediaIds?.[0] || "0000000", fromId: who, fromUsername: String(b.username || "pessoa_teste").slice(0, 30), text: msg }
      : { senderId: who, recipientId: "", text: msg, quickReply: "", echo: false };
  const ev = { key: `sim:${randomBytes(6).toString("hex")}`, field: kind, data, eventAt: new Date(now), account: a.account, simulated: true };
  const lean = a.toObject();
  const r = await processEvent(org, ev, { now, forced: { ...lean, trigger: { ...lean.trigger, scope: "all" } } });
  const run: any = await AutomationRun.findOne({ organization: org, eventKey: ev.key }).lean();
  return { matched: Boolean(run), note: r.note, run: run ? { status: run.status, steps: run.steps } : null };
}

// ---------- ligar o webhook na conta (ESCRITA na Meta) ----------

export async function subscribeAccount(org: Org, session: Session, accountId: unknown, opts: { fetchImpl?: FetchLike; ip?: string } = {}) {
  const sw = automationSwitch(session.organization);
  if (!sw.on) throw new FriendlyError(`${sw.message} Nada foi feito na Meta.`, 403);
  const account = await ownInstagramAccount(org, accountId);
  ensureMock();
  const api = new InstagramClient(accountToken(account), opts.fetchImpl ?? getDefaultFetch());
  const ok = await api.subscribeApp([...WEBHOOK_FIELDS]);
  await audit({ action: "automacao.webhook_assinado", actor: session.user, organization: org, target: String(account._id), ip: opts.ip, meta: { fields: WEBHOOK_FIELDS.join(","), ok } });
  return { ok, fields: [...WEBHOOK_FIELDS] };
}
