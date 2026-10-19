import { randomBytes } from "node:crypto";
import type { Types } from "mongoose";
import { FriendlyError, notFound } from "@/lib/errors";
import { toObjectId } from "@/lib/tenant";
import { periodFromParams, hasPeriodParams } from "@/lib/instagram/period";
import { dayStartMs, addDays } from "@/lib/instagram/dates";
import { AutomationRun, Contact } from "@/models/Automation";
import { ConsentLog, LeadAdsEvent, LeadEvent, LeadTask } from "@/models/Crm";
import User from "@/models/User";
import { firstOpenStage, ownPipeline, resolveStage, stageOf } from "./pipelines";
import { LIMITS, SOURCE_PT, type Utm, cleanTags, fieldKey, hasUtm, normEmail, normPhone, parseMoney, toCsv } from "./pure";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Org = Types.ObjectId;
export interface Actor { _id?: unknown; name?: string; email?: string }

const bad = (msg: string, field: string) => new FriendlyError(msg, 400, field);
const realIgsid = (c: any) => Boolean(c?.igsid && !String(c.igsid).startsWith("x:"));

// ---------- linha do tempo e consentimento ----------

export async function logEvent(org: Org, contact: unknown, kind: string, text = "", data: unknown = null, by?: Actor | null, at?: Date) {
  if (!contact) return;
  await LeadEvent.create({ organization: org, contact, kind, text: String(text).slice(0, 2000), data, by: by?._id ?? null, byName: by?.name || by?.email || "", at: at ?? new Date() });
}

export interface ConsentInput {
  given: boolean;
  /** dm | meta_lead_form | landing | manual | import */
  channel: string;
  text?: string;
  version?: string;
  basis?: string;
  at?: Date;
}

export async function logConsent(org: Org, contact: unknown, action: "given" | "refused" | "revoked" | "erased" | "exported", c: Partial<ConsentInput> & { fields?: string }, by?: Actor | null) {
  await ConsentLog.create({ organization: org, contact, action, channel: c.channel || "", fields: c.fields || "", text: String(c.text || "").slice(0, 1000), version: c.version || "", basis: String(c.basis || "").slice(0, 300), by: by?._id ?? null, at: c.at ?? new Date() });
}

// ---------- responsável ----------

export async function ownUser(org: Org, id: unknown): Promise<any | null> {
  if (id === undefined || id === null || id === "") return null;
  const oid = toObjectId(id);
  const u = oid ? await User.findOne({ _id: oid, organization: org, active: true }).select("name email").lean() : null;
  if (!u) throw bad("Responsável não encontrado nesta conta.", "owner");
  return u;
}

export async function teamOf(org: Org) {
  const users: any[] = await User.find({ organization: org, active: true }).select("name email role").sort({ name: 1 }).lean();
  return users.map((u) => ({ _id: String(u._id), name: u.name || u.email, role: u.role }));
}

// ---------- entrada de lead (todas as portas passam aqui) ----------

export interface Touch {
  at?: Date;
  kind: string;
  label?: string;
  automation?: unknown;
  campaignId?: string;
  adsetId?: string;
  adId?: string;
  formId?: string;
  postIgId?: string;
  capture?: unknown;
  utm?: Utm;
}

export interface LeadInput {
  name?: string;
  email?: string;
  phone?: string;
  username?: string;
  /** contato já existente do direct (automação) */
  contactId?: unknown;
  tags?: string[];
  fields?: Record<string, string>;
  value?: number | null;
  pipeline?: unknown;
  stage?: string;
  owner?: unknown;
  source: "meta_lead_ads" | "landing" | "manual" | "import";
  origin: Record<string, unknown>;
  touch: Touch;
  utm?: Utm;
  consent?: ConsentInput | null;
  /** texto da linha do tempo */
  eventText?: string;
  eventKind?: string;
  eventData?: unknown;
}

export interface LeadResult { contact: any; created: boolean; deduped: boolean; droppedContact: boolean }

/** Procura o mesmo lead: e-mail, depois telefone (sempre dentro da organização). */
export async function findDuplicate(org: Org, keys: { email?: string | null; phoneKey?: string | null }, exclude?: unknown): Promise<any | null> {
  const ex = exclude ? { _id: { $ne: exclude } } : {};
  if (keys.email) {
    const hit = await Contact.findOne({ organization: org, email: keys.email, ...ex }).sort({ createdAt: 1 }).lean();
    if (hit) return hit;
  }
  if (keys.phoneKey) {
    const hit = await Contact.findOne({ organization: org, phoneKey: keys.phoneKey, ...ex }).sort({ createdAt: 1 }).lean();
    if (hit) return hit;
  }
  return null;
}

function touchDoc(t: Touch, now: Date) {
  return {
    at: t.at ?? now, kind: t.kind, label: String(t.label || "").slice(0, 160), automation: t.automation ?? null,
    campaignId: t.campaignId || "", adsetId: t.adsetId || "", adId: t.adId || "", formId: t.formId || "", postIgId: t.postIgId || "", capture: t.capture ?? null,
    utm: t.utm && hasUtm(t.utm) ? t.utm : undefined,
  };
}

/** Atribuição: o primeiro toque nunca muda; o último é sempre o mais recente. */
export function applyTouch(c: any, t: Touch, now = new Date()): Record<string, unknown> {
  const doc = touchDoc(t, now);
  const set: Record<string, unknown> = {};
  const first = c?.firstTouch?.at ? new Date(c.firstTouch.at).getTime() : Infinity;
  const at = new Date(doc.at as Date).getTime();
  if (!c?.firstTouch?.kind || at < first) set.firstTouch = doc;
  const last = c?.lastTouch?.at ? new Date(c.lastTouch.at).getTime() : -Infinity;
  if (at >= last) set.lastTouch = doc;
  if (t.utm && hasUtm(t.utm)) set.utm = t.utm;
  return set;
}

/**
 * Cria ou atualiza o lead. E-mail e telefone SÓ são guardados com consentimento registrado
 * (`consent.given`); sem ele, vão embora e a resposta avisa (`droppedContact`).
 * Duplicado (mesmo e-mail ou telefone) vira atualização do existente.
 */
export async function upsertLead(org: Org, input: LeadInput, by?: Actor | null, now = new Date()): Promise<LeadResult> {
  const email = input.email ? normEmail(input.email) : null;
  if (input.email && !email) throw bad("E-mail inválido.", "email");
  const ph = input.phone ? normPhone(input.phone) : null;
  if (input.phone && !ph) throw bad("Telefone inválido: use DDD + número (ou +código do país).", "phone");
  const consentOk = input.consent?.given === true;
  const droppedContact = Boolean((email || ph) && !consentOk);
  const keep = { email: consentOk ? email : null, phone: consentOk ? ph : null };
  const tags = cleanTags(input.tags || []);
  const name = String(input.name || "").trim().slice(0, LIMITS.name);
  const username = String(input.username || "").trim().replace(/^@/, "").slice(0, 60);
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.fields || {})) {
    const key = fieldKey(k);
    if (key && Object.keys(fields).length < LIMITS.fields) fields[key] = String(v ?? "").slice(0, LIMITS.fieldValue);
  }

  let existing: any = null;
  if (input.contactId) {
    const oid = toObjectId(input.contactId);
    existing = oid ? await Contact.findOne({ _id: oid, organization: org }).lean() : null;
    if (!existing) throw notFound("Contato");
  }
  // dedupe pela chave que veio (mesmo sem consentimento: o e-mail não é guardado, mas acha o mesmo lead)
  if (!existing) existing = await findDuplicate(org, { email, phoneKey: ph?.key });

  const { pipeline, stage } = await resolveStage(org, input.pipeline ?? existing?.pipeline, input.stage ?? (existing?.lead ? existing.stage : ""));
  const owner = input.owner ? await ownUser(org, input.owner) : null;
  const consentSet = consentOk
    ? { "consent.given": true, "consent.at": input.consent!.at ?? now, "consent.text": String(input.consent!.text || "").slice(0, 1000), "consent.version": input.consent!.version || "", "consent.channel": input.consent!.channel, "consent.refusedAt": null }
    : {};
  const fieldsTouched = [keep.email && "email", keep.phone && "phone"].filter(Boolean).join("+");

  if (existing) {
    const set: Record<string, unknown> = { ...applyTouch(existing, input.touch, now), ...consentSet };
    if (name && !existing.name) set.name = name;
    if (username && !existing.username) set.username = username;
    if (keep.email && keep.email !== existing.email) set.email = keep.email;
    if (keep.phone && keep.phone.key !== existing.phoneKey) Object.assign(set, { phone: keep.phone.phone, phoneKey: keep.phone.key });
    for (const [k, v] of Object.entries(fields)) if (!existing.fields?.[k]) set[`fields.${k}`] = v;
    if (input.value != null && existing.value == null) set.value = input.value;
    if (!existing.lead) Object.assign(set, { lead: true, leadAt: now, pipeline: pipeline._id, stage: stage.key, stageAt: now });
    if (owner && !existing.owner) set.owner = owner._id;
    if (!existing.origin?.kind) set.origin = { kind: input.source, ...input.origin };
    const contact: any = await Contact.findOneAndUpdate({ _id: existing._id, organization: org }, { $set: set, ...(tags.length ? { $addToSet: { tags: { $each: tags } } } : {}) }, { returnDocument: "after" }).lean();
    await logEvent(org, contact._id, input.eventKind || input.source, input.eventText || `Entrou de novo: ${SOURCE_PT[input.touch.kind] || input.touch.kind}${input.touch.label ? ` (${input.touch.label})` : ""}.`, input.eventData ?? null, by, now);
    if (!existing.lead) await logEvent(org, contact._id, "stage", `Entrou no funil ${pipeline.name} na etapa ${stage.name}.`, { to: stage.key }, by, now);
    if (consentOk && fieldsTouched) await logConsent(org, contact._id, "given", { ...input.consent!, fields: fieldsTouched }, by);
    return { contact, created: false, deduped: !input.contactId, droppedContact };
  }

  const contact: any = (
    await Contact.create({
      organization: org,
      name,
      username,
      email: keep.email || "",
      phone: keep.phone?.phone || "",
      phoneKey: keep.phone?.key || "",
      tags,
      fields,
      source: input.source,
      origin: { kind: input.source, ...input.origin },
      utm: input.utm && hasUtm(input.utm) ? input.utm : input.touch.utm && hasUtm(input.touch.utm) ? input.touch.utm : undefined,
      firstTouch: touchDoc(input.touch, now),
      lastTouch: touchDoc(input.touch, now),
      lead: true,
      leadAt: now,
      pipeline: pipeline._id,
      stage: stage.key,
      stageAt: now,
      owner: owner?._id ?? null,
      value: input.value ?? null,
      firstSeenAt: now,
      consent: consentOk ? { given: true, at: input.consent!.at ?? now, text: String(input.consent!.text || "").slice(0, 1000), version: input.consent!.version || "", channel: input.consent!.channel } : undefined,
    })
  ).toObject();
  await logEvent(org, contact._id, input.eventKind || "created", input.eventText || `Lead criado: ${SOURCE_PT[input.source] || input.source}${input.touch.label ? ` (${input.touch.label})` : ""}.`, input.eventData ?? null, by, now);
  if (consentOk && fieldsTouched) await logConsent(org, contact._id, "given", { ...input.consent!, fields: fieldsTouched }, by);
  return { contact, created: true, deduped: false, droppedContact };
}

/** Passo "Enviar para o CRM" da automação: o contato do direct vira lead (ou ganha etiquetas). */
export async function sendContactToCrm(org: Org, contactId: unknown, opts: { pipeline?: unknown; stage?: string; owner?: unknown; tags?: string[]; touch: Touch }, now = new Date()) {
  const c: any = await Contact.findOne({ _id: contactId, organization: org }).lean();
  if (!c) return null;
  const set: Record<string, unknown> = applyTouch(c, opts.touch, now);
  let stageName = "";
  let entered = false;
  if (!c.lead) {
    // funil/etapa/responsável apagados depois de salvar a automação: cai no padrão, não falha
    const { pipeline, stage } = await resolveStage(org, opts.pipeline, opts.stage).catch(() => resolveStage(org, null, ""));
    Object.assign(set, { lead: true, leadAt: now, pipeline: pipeline._id, stage: stage.key, stageAt: now });
    if (!c.origin?.kind) set.origin = { kind: "automation", automation: opts.touch.automation ?? null, postIgId: opts.touch.postIgId || "", label: opts.touch.label || "" };
    stageName = `${pipeline.name} › ${stage.name}`;
    entered = true;
  }
  if (opts.owner && !c.owner) {
    const u = await ownUser(org, opts.owner).catch(() => null);
    if (u) set.owner = u._id;
  }
  const tags = cleanTags(opts.tags || []);
  await Contact.updateOne({ _id: c._id, organization: org }, { $set: set, ...(tags.length ? { $addToSet: { tags: { $each: tags } } } : {}) });
  if (entered) await logEvent(org, c._id, "stage", `Entrou no funil pela automação "${opts.touch.label || ""}": ${stageName}.`, { to: set.stage, automation: opts.touch.automation }, null, now);
  return { entered, stageName };
}

// ---------- leitura ----------

export function displayName(c: any): string {
  return c.name || (c.username ? `@${c.username}` : "") || c.email || c.phone || (realIgsid(c) ? c.igsid : "(sem nome)");
}

export function publicLead(c: any, team?: Map<string, string>) {
  return {
    _id: String(c._id),
    name: c.name || "",
    display: displayName(c),
    username: c.username || "",
    igsid: realIgsid(c) ? c.igsid : "",
    account: c.account ? String(c.account) : null,
    email: c.email || "",
    phone: c.phone || "",
    tags: c.tags || [],
    fields: c.fields || {},
    source: c.origin?.kind || c.source || "",
    sourceLabel: SOURCE_PT[c.origin?.kind || c.source] || c.origin?.kind || c.source || "",
    origin: c.origin || {},
    utm: c.utm || {},
    firstTouch: c.firstTouch || null,
    lastTouch: c.lastTouch || null,
    lead: c.lead === true,
    leadAt: c.leadAt || null,
    pipeline: c.pipeline ? String(c.pipeline) : null,
    stage: c.stage || "",
    stageAt: c.stageAt || null,
    owner: c.owner ? String(c.owner) : null,
    ownerName: c.owner && team ? team.get(String(c.owner)) || "" : "",
    value: c.value ?? null,
    lostReason: c.lostReason || "",
    wonAt: c.wonAt || null,
    lostAt: c.lostAt || null,
    consent: { given: c.consent?.given === true, at: c.consent?.at || null, channel: c.consent?.channel || "", version: c.consent?.version || "", text: c.consent?.text || "" },
    optOutAt: c.optOutAt || null,
    lastInboundAt: c.lastInboundAt || null,
    createdAt: c.createdAt || c.firstSeenAt || null,
  };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Filtro da lista/kanban, sempre dentro da organização. */
export async function leadQuery(org: Org, p: URLSearchParams, session?: { userId?: string } | null) {
  const q: Record<string, any> = { organization: org, lead: true };
  const pipe = await ownPipeline(org, p.get("funil") || null);
  q.pipeline = pipe._id;
  const stage = (p.get("etapa") || "").trim();
  if (stage) q.stage = stage;
  const owner = (p.get("responsavel") || "").trim();
  if (owner === "eu" && session?.userId) q.owner = toObjectId(session.userId);
  else if (owner === "ninguem") q.owner = null;
  else if (owner) {
    const oid = toObjectId(owner);
    if (!oid) throw notFound("Responsável");
    q.owner = oid;
  }
  const source = (p.get("origem") || "").trim();
  if (source) q["origin.kind"] = source;
  const campaign = (p.get("campanha") || "").trim().slice(0, 40);
  if (campaign) q.$or = [{ "firstTouch.campaignId": campaign }, { "lastTouch.campaignId": campaign }, { "utm.campaign": campaign }];
  const tag = (p.get("etiqueta") || "").trim();
  if (tag) q.tags = tag;
  if (hasPeriodParams(p)) {
    const per = periodFromParams(p);
    q.leadAt = { $gte: new Date(dayStartMs(per.from)), $lt: new Date(dayStartMs(addDays(per.to, 1))) };
  }
  const s = (p.get("q") || "").trim().slice(0, 60);
  if (s) {
    const digits = s.replace(/\D/g, "");
    const or: any[] = [{ name: { $regex: esc(s), $options: "i" } }, { username: { $regex: esc(s.replace(/^@/, "")), $options: "i" } }, { email: { $regex: esc(s), $options: "i" } }];
    if (digits.length >= 4) or.push({ phoneKey: { $regex: esc(digits) } });
    q.$and = [...(q.$and || []), { $or: or }];
  }
  return { q, pipeline: pipe };
}

export async function listLeads(org: Org, p: URLSearchParams, session?: { userId?: string } | null) {
  const { q, pipeline } = await leadQuery(org, p, session);
  const team = await teamOf(org);
  const names = new Map(team.map((u) => [u._id, u.name]));
  const rows: any[] = await Contact.find(q).sort({ stageAt: -1, updatedAt: -1 }).limit(1000).lean();
  const ids = rows.map((r) => r._id);
  const open = ids.length ? await LeadTask.aggregate([{ $match: { organization: org, contact: { $in: ids }, done: false } }, { $group: { _id: "$contact", n: { $sum: 1 }, next: { $min: "$dueAt" } } }]) : [];
  const tasks = new Map(open.map((t: any) => [String(t._id), { n: t.n, next: t.next }]));
  const leads = rows.map((r) => ({ ...publicLead(r, names), tasks: tasks.get(String(r._id)) || { n: 0, next: null } }));
  const byStage: Record<string, { n: number; value: number }> = {};
  for (const l of leads) {
    const b = (byStage[l.stage] ||= { n: 0, value: 0 });
    b.n++;
    b.value += l.value || 0;
  }
  return { pipeline, leads, byStage, total: leads.length, capped: rows.length >= 1000 };
}

export function leadsCsv(leads: ReturnType<typeof publicLead>[], pipeline: any): string {
  const stageName = (k: string) => stageOf(pipeline, k)?.name || k;
  return toCsv(
    ["nome", "instagram", "email", "telefone", "etapa", "responsavel", "valor", "origem", "campanha_id", "anuncio_id", "post_id", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "etiquetas", "entrou_em", "consentimento_em", "canal_do_consentimento"],
    leads.map((l) => [l.name, l.username, l.email, l.phone, stageName(l.stage), l.ownerName, l.value ?? "", l.sourceLabel, l.firstTouch?.campaignId || "", l.firstTouch?.adId || "", l.firstTouch?.postIgId || "", l.utm?.source || "", l.utm?.medium || "", l.utm?.campaign || "", l.utm?.content || "", l.utm?.term || "", l.tags.join(" "), l.leadAt ? new Date(l.leadAt).toISOString() : "", l.consent.at ? new Date(l.consent.at).toISOString() : "", l.consent.channel])
  );
}

export async function ownContact(org: Org, id: unknown): Promise<any> {
  const oid = toObjectId(id);
  const c: any = oid ? await Contact.findOne({ _id: oid, organization: org }).lean() : null;
  if (!c) throw notFound("Lead");
  return c;
}

export async function leadDetail(org: Org, id: unknown) {
  const c = await ownContact(org, id);
  const team = await teamOf(org);
  const names = new Map(team.map((u) => [u._id, u.name]));
  const [events, tasks, consents, dupByEmail, dupByPhone] = await Promise.all([
    LeadEvent.find({ organization: org, contact: c._id }).sort({ at: -1 }).limit(200).lean(),
    LeadTask.find({ organization: org, contact: c._id }).sort({ done: 1, dueAt: 1, createdAt: -1 }).lean(),
    ConsentLog.find({ organization: org, contact: c._id }).sort({ at: -1 }).limit(50).lean(),
    c.email ? Contact.find({ organization: org, email: c.email, _id: { $ne: c._id } }).limit(5).lean() : [],
    c.phoneKey ? Contact.find({ organization: org, phoneKey: c.phoneKey, _id: { $ne: c._id } }).limit(5).lean() : [],
  ]);
  const dups = new Map<string, any>();
  for (const d of [...(dupByEmail as any[]), ...(dupByPhone as any[])]) dups.set(String(d._id), d);
  // contato do direct com o mesmo @ (sem e-mail/telefone ainda)
  if (c.username && !realIgsid(c)) for (const d of (await Contact.find({ organization: org, username: c.username, _id: { $ne: c._id } }).limit(3).lean()) as any[]) dups.set(String(d._id), d);
  return {
    lead: publicLead(c, names),
    events: (events as any[]).map((e) => ({ _id: String(e._id), kind: e.kind, at: e.at, text: e.text, byName: e.byName, data: e.data })),
    tasks: (tasks as any[]).map(publicTask),
    consents: (consents as any[]).map((x) => ({ action: x.action, channel: x.channel, fields: x.fields, text: x.text, version: x.version, basis: x.basis, at: x.at })),
    duplicates: [...dups.values()].map((d) => ({ _id: String(d._id), display: displayName(d), email: d.email || "", phone: d.phone || "", lead: d.lead === true })),
    team,
  };
}

// ---------- edição ----------

/** Etapa nova: confere o funil, marca ganhou/perdeu e escreve na linha do tempo. */
export async function changeStage(org: Org, c: any, key: string, by: Actor | null, opts: { lostReason?: string; pipeline?: unknown } = {}, now = new Date()) {
  const pipeline = await ownPipeline(org, opts.pipeline ?? c.pipeline);
  const to = stageOf(pipeline, key);
  if (!to) throw bad("Etapa não existe neste funil.", "stage");
  const samePipe = String(pipeline._id) === String(c.pipeline);
  if (samePipe && c.stage === key && c.lead) return c;
  const from = samePipe ? stageOf(pipeline, c.stage) : undefined;
  const set: Record<string, unknown> = { lead: true, pipeline: pipeline._id, stage: to.key, stageAt: now };
  if (!c.lead) set.leadAt = now;
  set.wonAt = to.kind === "won" ? now : null;
  set.lostAt = to.kind === "lost" ? now : null;
  if (to.kind === "lost") {
    const reason = String(opts.lostReason ?? c.lostReason ?? "").trim().slice(0, LIMITS.lostReason);
    set.lostReason = reason;
  } else set.lostReason = "";
  const updated: any = await Contact.findOneAndUpdate({ _id: c._id, organization: org }, { $set: set }, { returnDocument: "after" }).lean();
  const txt = `${from ? `${from.name} → ` : ""}${to.name}${to.kind === "lost" && set.lostReason ? ` (motivo: ${set.lostReason})` : ""}${!samePipe ? ` no funil ${pipeline.name}` : ""}`;
  await logEvent(org, c._id, "stage", txt, { from: from?.key || "", to: to.key, kind: to.kind }, by, now);
  return updated;
}

export async function createManualLead(org: Org, b: Record<string, any>, by: Actor) {
  const email = String(b.email ?? "").trim();
  const phone = String(b.phone ?? "").trim();
  if (!String(b.name ?? "").trim() && !email && !phone && !String(b.username ?? "").trim()) throw bad("Diga pelo menos o nome, o @, o e-mail ou o telefone.", "name");
  const consentGiven = b.consent === true;
  if ((email || phone) && !consentGiven) throw bad("Para guardar e-mail ou telefone, marque que a pessoa autorizou (e diga como).", "consent");
  const basis = String(b.consentBasis ?? "").trim().slice(0, 300);
  if ((email || phone) && basis.length < 3) throw bad("Diga como a pessoa autorizou (ex.: pediu orçamento por telefone em 10/10).", "consentBasis");
  const value = b.value === undefined || b.value === "" || b.value === null ? null : parseMoney(b.value);
  if (b.value !== undefined && b.value !== "" && b.value !== null && value === null) throw bad("Valor inválido.", "value");
  return upsertLead(
    org,
    {
      name: b.name, email, phone, username: b.username, tags: cleanTags(b.tags), value, pipeline: b.pipeline, stage: b.stage, owner: b.owner,
      source: "manual",
      origin: { label: String(b.sourceNote ?? "").slice(0, 120) },
      touch: { kind: "manual", label: String(b.sourceNote ?? "").slice(0, 120), utm: {} },
      consent: consentGiven ? { given: true, channel: "manual", text: "Autorização informada pela equipe ao cadastrar.", basis } : null,
    },
    by
  );
}

export async function updateLead(org: Org, id: unknown, b: Record<string, any>, by: Actor) {
  const c = await ownContact(org, id);
  const set: Record<string, unknown> = {};
  const notes: string[] = [];
  if (b.name !== undefined) {
    const name = String(b.name ?? "").trim().slice(0, LIMITS.name);
    if (name !== (c.name || "")) { set.name = name; notes.push("nome"); }
  }
  for (const f of ["email", "phone"] as const) {
    if (b[f] === undefined) continue;
    const raw = String(b[f] ?? "").trim();
    if (!raw) {
      if (c[f]) { set[f] = ""; if (f === "phone") set.phoneKey = ""; notes.push(`${f === "email" ? "e-mail" : "telefone"} apagado`); }
      continue;
    }
    if (f === "email") {
      const v = normEmail(raw);
      if (!v) throw bad("E-mail inválido.", "email");
      if (v === c.email) continue;
      set.email = v;
    } else {
      const v = normPhone(raw);
      if (!v) throw bad("Telefone inválido: use DDD + número.", "phone");
      if (v.key === c.phoneKey) continue;
      Object.assign(set, { phone: v.phone, phoneKey: v.key });
    }
    // dado de contato novo só com consentimento (o que já existe ou um novo, informado agora)
    if (!c.consent?.given) {
      const basis = String(b.consentBasis ?? "").trim().slice(0, 300);
      if (b.consent !== true || basis.length < 3) throw bad("Para guardar e-mail ou telefone, marque que a pessoa autorizou e diga como.", "consent");
      Object.assign(set, { "consent.given": true, "consent.at": new Date(), "consent.text": "Autorização informada pela equipe.", "consent.channel": "manual", "consent.version": "", "consent.refusedAt": null });
      await logConsent(org, c._id, "given", { channel: "manual", basis, text: "Autorização informada pela equipe.", fields: f }, by);
    }
    notes.push(f === "email" ? "e-mail" : "telefone");
  }
  if (b.tags !== undefined) { set.tags = cleanTags(b.tags); notes.push("etiquetas"); }
  if (b.fields !== undefined) {
    if (!b.fields || typeof b.fields !== "object" || Array.isArray(b.fields)) throw bad("Campos inválidos.", "fields");
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(b.fields as Record<string, unknown>)) {
      const key = fieldKey(k);
      if (!key) throw bad(`Nome de campo inválido: ${String(k).slice(0, 30)}.`, "fields");
      if (Object.keys(out).length >= LIMITS.fields) throw bad(`No máximo ${LIMITS.fields} campos.`, "fields");
      out[key] = String(v ?? "").slice(0, LIMITS.fieldValue);
    }
    set.fields = out;
    notes.push("campos");
  }
  if (b.value !== undefined) {
    const v = b.value === "" || b.value === null ? null : parseMoney(b.value);
    if (b.value !== "" && b.value !== null && v === null) throw bad("Valor inválido.", "value");
    if (v !== (c.value ?? null)) {
      set.value = v;
      await logEvent(org, c._id, "value", v == null ? "Valor apagado." : `Valor: R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`, { value: v }, by);
    }
  }
  if (b.owner !== undefined) {
    const u = b.owner ? await ownUser(org, b.owner) : null;
    if (String(u?._id ?? "") !== String(c.owner ?? "")) {
      set.owner = u?._id ?? null;
      await logEvent(org, c._id, "owner", u ? `Responsável: ${u.name || u.email}.` : "Sem responsável.", null, by);
    }
  }
  if (b.lostReason !== undefined && b.stage === undefined) set.lostReason = String(b.lostReason ?? "").trim().slice(0, LIMITS.lostReason);
  if (b.lead === false && c.lead) {
    set.lead = false;
    await logEvent(org, c._id, "stage", "Saiu do funil (continua nos contatos).", null, by);
  }
  if (Object.keys(set).length) {
    try {
      await Contact.updateOne({ _id: c._id, organization: org }, { $set: set });
    } catch (e: any) {
      throw e;
    }
    if (notes.length) await logEvent(org, c._id, "edit", `Alterado: ${notes.join(", ")}.`, null, by);
  }
  let out: any = await Contact.findOne({ _id: c._id, organization: org }).lean();
  if (b.stage !== undefined && b.lead !== false) out = await changeStage(org, out, String(b.stage), by, { lostReason: b.lostReason, pipeline: b.pipeline });
  return out;
}

export async function addNote(org: Org, id: unknown, text: unknown, by: Actor) {
  const c = await ownContact(org, id);
  const t = String(text ?? "").trim();
  if (!t) throw bad("Escreva a nota.", "text");
  if (t.length > LIMITS.note) throw bad(`Nota: no máximo ${LIMITS.note} caracteres.`, "text");
  await logEvent(org, c._id, "note", t, null, by);
  return { ok: true };
}

// ---------- tarefas / lembretes ----------

export function publicTask(t: any) {
  return { _id: String(t._id), contact: String(t.contact), title: t.title, dueAt: t.dueAt || null, done: t.done === true, doneAt: t.doneAt || null, assignee: t.assignee ? String(t.assignee) : null, overdue: !t.done && t.dueAt ? new Date(t.dueAt).getTime() < Date.now() : false };
}

const parseDue = (v: unknown): Date | null => {
  if (v === undefined || v === null || v === "") return null;
  const d = new Date(String(v));
  if (!Number.isFinite(d.getTime())) throw bad("Data do lembrete inválida.", "dueAt");
  return d;
};

export async function createTask(org: Org, contactId: unknown, b: Record<string, any>, by: Actor) {
  const c = await ownContact(org, contactId);
  const title = String(b.title ?? "").trim();
  if (!title) throw bad("Diga o que precisa ser feito.", "title");
  if (title.length > LIMITS.task) throw bad(`No máximo ${LIMITS.task} caracteres.`, "title");
  const assignee = b.assignee ? await ownUser(org, b.assignee) : null;
  const t = await LeadTask.create({ organization: org, contact: c._id, title, dueAt: parseDue(b.dueAt), assignee: assignee?._id ?? (by?._id || null), createdBy: by?._id ?? null });
  await logEvent(org, c._id, "task", `Tarefa: ${title}${t.dueAt ? ` (para ${new Date(t.dueAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})` : ""}.`, null, by);
  return t;
}

export async function updateTask(org: Org, id: unknown, b: Record<string, any>, by: Actor) {
  const oid = toObjectId(id);
  const t: any = oid ? await LeadTask.findOne({ _id: oid, organization: org }) : null;
  if (!t) throw notFound("Tarefa");
  if (b.title !== undefined) {
    const title = String(b.title ?? "").trim();
    if (!title || title.length > LIMITS.task) throw bad("Título inválido.", "title");
    t.title = title;
  }
  if (b.dueAt !== undefined) t.dueAt = parseDue(b.dueAt);
  if (b.assignee !== undefined) t.assignee = b.assignee ? (await ownUser(org, b.assignee))._id : null;
  if (b.done !== undefined && Boolean(b.done) !== t.done) {
    t.done = Boolean(b.done);
    t.doneAt = t.done ? new Date() : null;
    if (t.done) await logEvent(org, t.contact, "task", `Concluída: ${t.title}.`, null, by);
  }
  await t.save();
  return t;
}

export async function deleteTask(org: Org, id: unknown) {
  const oid = toObjectId(id);
  const t: any = oid ? await LeadTask.findOne({ _id: oid, organization: org }).lean() : null;
  if (!t) throw notFound("Tarefa");
  await LeadTask.deleteOne({ _id: t._id, organization: org });
}

export async function listTasks(org: Org, p: URLSearchParams, session: { userId: string }) {
  const q: Record<string, any> = { organization: org, done: p.get("feitas") === "1" };
  if (p.get("minhas") === "1") q.assignee = toObjectId(session.userId);
  const rows: any[] = await LeadTask.find(q).sort({ dueAt: 1, createdAt: 1 }).limit(300).lean();
  const contacts: any[] = rows.length ? await Contact.find({ organization: org, _id: { $in: rows.map((r) => r.contact) } }).select("name username email phone igsid").lean() : [];
  const names = new Map(contacts.map((c) => [String(c._id), displayName(c)]));
  return rows.map((t) => ({ ...publicTask(t), contactName: names.get(String(t.contact)) || "" }));
}

// ---------- mesclar duplicados ----------

/**
 * Junta dois cadastros da mesma pessoa. Fica o do Instagram (se houver um), senão o mais antigo.
 * O outro some; linha do tempo, tarefas, consentimentos e execuções passam para o que fica.
 */
export async function mergeLeads(org: Org, keepId: unknown, dropId: unknown, by: Actor) {
  let keep = await ownContact(org, keepId);
  let drop = await ownContact(org, dropId);
  if (String(keep._id) === String(drop._id)) throw bad("Escolha dois cadastros diferentes.", "other");
  if (realIgsid(drop) && realIgsid(keep) && String(drop.account) === String(keep.account)) throw bad("Os dois são contatos diferentes do Instagram nesta conta: não dá para juntar.", "other");
  if (realIgsid(drop) && !realIgsid(keep)) [keep, drop] = [drop, keep];
  const set: Record<string, unknown> = {};
  for (const f of ["name", "username"]) if (!keep[f] && drop[f]) set[f] = drop[f];
  if (!keep.email && drop.email) set.email = drop.email;
  if (!keep.phone && drop.phone) Object.assign(set, { phone: drop.phone, phoneKey: drop.phoneKey });
  if (!keep.consent?.given && drop.consent?.given) set.consent = drop.consent;
  set.fields = { ...(drop.fields || {}), ...(keep.fields || {}) };
  set.tags = [...new Set([...(keep.tags || []), ...(drop.tags || [])])];
  const ft = [keep.firstTouch, drop.firstTouch].filter((t) => t?.at).sort((a, b) => +new Date(a.at) - +new Date(b.at));
  if (ft[0]) set.firstTouch = ft[0];
  const lt = [keep.lastTouch, drop.lastTouch].filter((t) => t?.at).sort((a, b) => +new Date(b.at) - +new Date(a.at));
  if (lt[0]) set.lastTouch = lt[0];
  if (!keep.origin?.kind && drop.origin?.kind) set.origin = drop.origin;
  else if (keep.origin?.kind && drop.origin?.kind && drop.leadAt && (!keep.leadAt || new Date(drop.leadAt) < new Date(keep.leadAt))) set.origin = drop.origin;
  if (!keep.lead && drop.lead) Object.assign(set, { lead: true, leadAt: drop.leadAt, pipeline: drop.pipeline, stage: drop.stage, stageAt: drop.stageAt, wonAt: drop.wonAt, lostAt: drop.lostAt, lostReason: drop.lostReason });
  else if (keep.lead && drop.lead && drop.leadAt && keep.leadAt && new Date(drop.leadAt) < new Date(keep.leadAt)) set.leadAt = drop.leadAt;
  if (!keep.owner && drop.owner) set.owner = drop.owner;
  if (keep.value == null && drop.value != null) set.value = drop.value;
  if (!keep.utm?.source && drop.utm?.source) set.utm = drop.utm;
  // o que sai primeiro (índice de e-mail/telefone não é único, mas evita ler 2 iguais no meio)
  await LeadEvent.updateMany({ organization: org, contact: drop._id }, { $set: { contact: keep._id } });
  await LeadTask.updateMany({ organization: org, contact: drop._id }, { $set: { contact: keep._id } });
  await ConsentLog.updateMany({ organization: org, contact: drop._id }, { $set: { contact: keep._id } });
  await AutomationRun.updateMany({ organization: org, contact: drop._id }, { $set: { contact: keep._id } });
  await LeadAdsEvent.updateMany({ organization: org, contact: drop._id }, { $set: { contact: keep._id } });
  await Contact.deleteOne({ _id: drop._id, organization: org });
  await Contact.updateOne({ _id: keep._id, organization: org }, { $set: set, $addToSet: { mergedFrom: drop._id } });
  await logEvent(org, keep._id, "merge", `Juntado com ${displayName(drop)} (cadastro repetido).`, { dropped: String(drop._id) }, by);
  return Contact.findOne({ _id: keep._id, organization: org }).lean();
}

// ---------- LGPD ----------

/** Tudo o que existe sobre a pessoa, para entregar a ela (pedido de acesso/portabilidade). */
export async function exportLead(org: Org, id: unknown, by: Actor) {
  const c = await ownContact(org, id);
  const [events, tasks, consents, runs] = await Promise.all([
    LeadEvent.find({ organization: org, contact: c._id }).sort({ at: 1 }).lean(),
    LeadTask.find({ organization: org, contact: c._id }).lean(),
    ConsentLog.find({ organization: org, contact: c._id }).sort({ at: 1 }).lean(),
    AutomationRun.find({ organization: org, contact: c._id }).sort({ createdAt: 1 }).select("automationName trigger text status createdAt").lean(),
  ]);
  await logConsent(org, c._id, "exported", { channel: "manual", basis: "exportação a pedido (LGPD)" }, by);
  const strip = (x: any) => { const rest = { ...x }; delete rest.organization; delete rest.__v; return rest; };
  return {
    geradoEm: new Date().toISOString(),
    pessoa: strip({ ...c, clickKey: undefined, pending: undefined }),
    linhaDoTempo: (events as any[]).map(strip),
    tarefas: (tasks as any[]).map(strip),
    consentimentos: (consents as any[]).map(strip),
    execucoesDeAutomacao: (runs as any[]).map(strip),
  };
}

/** Chave opaca do clique (?k=) do contato; cria na primeira vez. */
export async function clickKeyFor(org: Org, contact: any): Promise<string> {
  if (contact?.clickKey) return contact.clickKey;
  if (!contact?._id || contact._virtual) return "";
  const key = randomBytes(9).toString("base64url");
  const r: any = await Contact.findOneAndUpdate({ _id: contact._id, organization: org, clickKey: { $in: ["", null] } }, { $set: { clickKey: key } }, { returnDocument: "after" }).lean();
  if (r?.clickKey) return r.clickKey;
  const again: any = await Contact.findOne({ _id: contact._id, organization: org }).select("clickKey").lean();
  return again?.clickKey || "";
}

export const firstStageOf = firstOpenStage;
