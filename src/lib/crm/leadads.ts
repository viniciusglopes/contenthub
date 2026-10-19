import type { Types } from "mongoose";
import { FriendlyError, notFound } from "@/lib/errors";
import { decrypt, encrypt } from "@/lib/crypto";
import { toObjectId } from "@/lib/tenant";
import { checkSignature } from "@/lib/automations/webhook";
import { MetaApiError, MetaGraphClient, getMetaFetch } from "@/lib/ads/client";
import { ensureAdsMock } from "@/lib/ads/mock";
import type { FetchLike } from "@/lib/instagram/client";
import { createHash, timingSafeEqual } from "node:crypto";
import { AdObject } from "@/models/Ads";
import { Contact, WebhookDaily } from "@/models/Automation";
import { LeadAdsEvent, LeadAdsPage } from "@/models/Crm";
import Organization from "@/models/Organization";
import { ownUser, upsertLead } from "./leads";
import { resolveStage } from "./pipelines";
import { cleanTags, mapLeadFields, normEmail, normPhone } from "./pure";

/* eslint-disable @typescript-eslint/no-explicit-any */

// FORMULÁRIOS DE CADASTRO DA META (Lead Ads) ENTRANDO NO CRM.
// Doc oficial lida em 19/10/2026:
//  - https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-leadgen
//    objeto Page, campo "leadgen"; valor do aviso: leadgen_id, page_id, form_id, adgroup_id, ad_id, created_time
//    (o aviso NÃO traz os dados preenchidos); o app precisa estar instalado na Página
//    (POST /{page-id}/subscribed_apps?subscribed_fields=leadgen com token da Página: escrita na Meta,
//    feita por quem administra a Página, NUNCA por este código); permissões leads_retrieval,
//    pages_manage_metadata, pages_show_list, pages_read_engagement, ads_management.
//  - https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving
//    GET /{LEAD_ID} com token da Página ou do usuário; resposta created_time, id, ad_id, form_id,
//    field_data [{name, values}]; "The leads_retrieval permission is required to read leads";
//    limite: 200 x 24 x número de leads dos últimos 90 dias, por Página.
//    adset_id/campaign_id/ad_name/campaign_name NÃO aparecem no exemplo da página: pedimos e tratamos
//    como opcionais; faltando, completamos pelo anúncio já sincronizado no Tráfego (AdObject).
//  - Assinatura X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com o App Secret do app da Meta),
//    igual aos outros webhooks da Meta.
//
// Duas chaves, as duas DESLIGADAS: env CRM_LEAD_ADS_ENABLED=true e Organization.leadAdsEnabled.

type Org = Types.ObjectId;
const bad = (msg: string, field: string) => new FriendlyError(msg, 400, field);

export const LEAD_FIELDS = "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data,is_organic,platform";
export const MAX_BODY_BYTES = 256 * 1024;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60_000;

export const leadAdsGlobal = () => process.env.CRM_LEAD_ADS_ENABLED === "true";
export function leadAdsSwitch(orgDoc: any) {
  const global = leadAdsGlobal();
  const org = orgDoc?.leadAdsEnabled === true;
  return {
    global, org, on: global && org,
    message: global && org ? "" : !org ? "A entrada de leads dos formulários da Meta está desligada para esta conta (o suporte liga em Admin › Clientes). Você já pode cadastrar a Página." : "A entrada de leads dos formulários da Meta está desligada no servidor (CRM_LEAD_ADS_ENABLED).",
  };
}

export const leadAdsSecret = () => process.env.META_APP_SECRET || process.env.LEAD_ADS_APP_SECRET || "";
export const leadAdsVerifyToken = () => process.env.LEAD_ADS_VERIFY_TOKEN || "";

export function verifyLeadAdsChallenge(params: URLSearchParams): string | null {
  const token = leadAdsVerifyToken();
  if (token.length < 16 || params.get("hub.mode") !== "subscribe") return null;
  const a = createHash("sha256").update(params.get("hub.verify_token") || "").digest();
  const b = createHash("sha256").update(token).digest();
  if (!timingSafeEqual(a, b)) return null;
  const challenge = params.get("hub.challenge") || "";
  return /^[\w.-]{1,128}$/.test(challenge) ? challenge : null;
}

export const checkLeadAdsSignature = (raw: string | Buffer, header: string | null) => checkSignature(raw, header, leadAdsSecret());

export interface LeadgenRow { pageId: string; leadgenId: string; formId: string; adId: string; adgroupId: string; createdTime: number }

const digits = (v: unknown, n = 30) => {
  const s = String(v ?? "");
  return new RegExp(`^\\d{1,${n}}$`).test(s) ? s : "";
};

/** Separa os avisos leadgen (dedupe dentro do próprio aviso; created_time em segundos). */
export function parseLeadgen(body: any, now = Date.now()): { rows: LeadgenRow[]; ignored: number } {
  const rows: LeadgenRow[] = [];
  let ignored = 0;
  const seen = new Set<string>();
  if (!body || body.object !== "page" || !Array.isArray(body.entry)) return { rows, ignored: 1 };
  for (const entry of body.entry) {
    for (const ch of Array.isArray(entry?.changes) ? entry.changes : []) {
      const v = ch?.value || {};
      const leadgenId = digits(v.leadgen_id);
      const pageId = digits(v.page_id || entry?.id);
      if (ch?.field !== "leadgen" || !leadgenId || !pageId || seen.has(leadgenId)) { ignored++; continue; }
      seen.add(leadgenId);
      const t = Number(v.created_time);
      rows.push({ pageId, leadgenId, formId: digits(v.form_id), adId: digits(v.ad_id), adgroupId: digits(v.adgroup_id), createdTime: Number.isFinite(t) && t > 0 ? (t < 1e12 ? t * 1000 : t) : now });
    }
  }
  return { rows, ignored };
}

async function count(fields: Record<string, number>, now: number) {
  const inc = Object.fromEntries(Object.entries(fields).filter(([, v]) => v));
  if (!Object.keys(inc).length) return;
  await WebhookDaily.updateOne({ day: `leadads:${new Date(now).toISOString().slice(0, 10)}` }, { $inc: inc }, { upsert: true }).catch(() => {});
}
export const leadAdsBadSignature = (now = Date.now()) => count({ badSignature: 1 }, now);

/**
 * Guarda os avisos, um por organização que cadastrou a Página e está com a chave ligada.
 * Consulta entre organizações (só a Página pelo page_id da Meta, só o id da organização), igual ao
 * webhook do Instagram. Nada do cliente volta na resposta.
 */
export async function ingestLeadgen(body: any, now = Date.now()) {
  const { rows, ignored } = parseLeadgen(body, now);
  const r = { received: rows.length, stored: 0, duplicate: 0, unknownPage: 0, switchedOff: 0, ignored };
  if (!leadAdsGlobal()) {
    r.switchedOff = rows.length;
    await count({ received: r.received, switchedOff: r.switchedOff }, now);
    return r;
  }
  for (const row of rows) {
    const pages: any[] = await LeadAdsPage.find({ pageId: row.pageId, active: true }).setOptions({ crossOrg: true }).select("organization").lean();
    if (!pages.length) { r.unknownPage++; continue; }
    const on: any[] = await Organization.find({ _id: { $in: pages.map((p) => p.organization) }, active: true, leadAdsEnabled: true }).select("_id").lean();
    const allowed = new Set(on.map((o) => String(o._id)));
    if (!allowed.size) { r.switchedOff++; continue; }
    for (const p of pages.filter((x) => allowed.has(String(x.organization)))) {
      try {
        await LeadAdsEvent.create({ organization: p.organization, page: p._id, pageId: row.pageId, leadgenId: row.leadgenId, formId: row.formId, adId: row.adId, adgroupId: row.adgroupId, createdTime: new Date(row.createdTime), runAfter: new Date(now) });
        r.stored++;
      } catch (e: any) {
        if (e?.code === 11000) r.duplicate++;
        else throw e;
      }
    }
  }
  await count({ received: r.received, stored: r.stored, duplicate: r.duplicate, unknownAccount: r.unknownPage, switchedOff: r.switchedOff }, now);
  return r;
}

const CONSENT_TEXT = "Preencheu o formulário de cadastro do anúncio na Meta (o formulário mostra a política de privacidade do anunciante).";

/** Busca o lead na Meta e cria/atualiza no CRM. Erro passageiro = nova tentativa; o resto fica registrado. */
export async function processLeadEvent(org: Org, ev: any, opts: { now?: number; fetchImpl?: FetchLike } = {}) {
  const now = opts.now ?? Date.now();
  const page: any = await LeadAdsPage.findOne({ _id: ev.page, organization: org }).lean();
  if (!page || !page.active) return { note: "Página desligada ou removida: aviso ignorado." };
  const already: any = await Contact.findOne({ organization: org, "origin.leadgenId": ev.leadgenId }).select("_id").lean();
  if (already) return { note: "Lead já estava no CRM.", contact: already._id };
  ensureAdsMock(); // só no modo demonstração (IG_MOCK=1)
  if (!page.credentials?.accessToken) throw new FriendlyError("A Página está sem token: cole o token da Página no CRM › Formulários da Meta.", 400);
  const client = new MetaGraphClient(decrypt(page.credentials.accessToken), opts.fetchImpl ?? getMetaFetch(), undefined, 5);
  const lead: any = await client.get(`/${ev.leadgenId}`, { fields: LEAD_FIELDS });
  const mapped = mapLeadFields(lead.field_data || [], page.fieldMap || {});
  // valor que não passa na conferência não derruba o lead: vai para os campos, como veio
  if (mapped.email && !normEmail(mapped.email)) { mapped.fields.email_informado = mapped.email; mapped.email = ""; }
  if (mapped.phone && !normPhone(mapped.phone)) { mapped.fields.telefone_informado = mapped.phone; mapped.phone = ""; }
  const adId = digits(lead.ad_id) || ev.adId || "";
  let adsetId = digits(lead.adset_id);
  let campaignId = digits(lead.campaign_id);
  if (adId && (!adsetId || !campaignId)) {
    const ad: any = await AdObject.findOne({ organization: org, level: "ad", metaId: adId }).select("adsetId campaignId").lean();
    adsetId ||= ad?.adsetId || "";
    campaignId ||= ad?.campaignId || "";
  }
  const formId = digits(lead.form_id) || ev.formId || "";
  const organic = lead.is_organic === true || lead.is_organic === 1;
  const label = String(lead.campaign_name || lead.ad_name || (organic ? "Formulário (orgânico)" : `Formulário ${formId}`)).slice(0, 160);
  const at = lead.created_time ? new Date(lead.created_time) : ev.createdTime ? new Date(ev.createdTime) : new Date(now);
  const res = await upsertLead(
    org,
    {
      name: mapped.name, email: mapped.email, phone: mapped.phone, fields: mapped.fields,
      tags: page.tags || [], pipeline: page.pipeline, stage: page.stage, owner: page.owner,
      source: "meta_lead_ads",
      origin: { leadgenId: ev.leadgenId, formId, pageId: ev.pageId, adId, adsetId, campaignId, label },
      touch: { at: Number.isFinite(at.getTime()) ? at : new Date(now), kind: "meta_lead_ads", label, campaignId, adsetId, adId, formId, utm: {} },
      consent: mapped.email || mapped.phone ? { given: true, channel: "meta_lead_form", text: CONSENT_TEXT, version: `form:${formId}`, basis: `formulário ${formId} da Página ${page.name || ev.pageId}`, at } : null,
      eventKind: "lead_ads",
      eventText: `Preencheu o formulário da Meta${label ? ` (${label})` : ""}${organic ? ", orgânico" : ""}.`,
      eventData: { leadgenId: ev.leadgenId, formId, adId, adsetId, campaignId, platform: String(lead.platform || "").slice(0, 20) },
    },
    null,
    new Date(now)
  );
  await LeadAdsPage.updateOne({ _id: page._id, organization: org }, { $set: { lastLeadAt: new Date(now), lastError: "" } });
  return { note: res.created ? "Lead criado." : "Lead já existia (mesmo e-mail/telefone): atualizado.", contact: res.contact._id };
}

export async function processLeadAds(opts: { now?: number; fetchImpl?: FetchLike; limit?: number; orgs?: Org[] } = {}) {
  const now = opts.now ?? Date.now();
  const out = { enabled: leadAdsGlobal(), organizations: 0, processed: 0, deferred: 0, failed: 0 };
  if (!out.enabled) return out;
  const q: any = { active: true, leadAdsEnabled: true };
  if (opts.orgs) q._id = { $in: opts.orgs };
  const orgs: any[] = await Organization.find(q).select("_id").lean();
  out.organizations = orgs.length;
  for (const o of orgs) {
    for (let i = 0; i < (opts.limit ?? 50); i++) {
      const ev: any = await LeadAdsEvent.findOneAndUpdate(
        { organization: o._id, $or: [{ status: "pending", runAfter: { $lte: new Date(now) } }, { status: "processing", lockedAt: { $lt: new Date(now - LOCK_MS) } }] },
        { $set: { status: "processing", lockedAt: new Date(now) }, $inc: { attempts: 1 } },
        { sort: { runAfter: 1 }, returnDocument: "after" }
      ).lean();
      if (!ev) break;
      try {
        const r = await processLeadEvent(o._id, ev, { now, fetchImpl: opts.fetchImpl });
        await LeadAdsEvent.updateOne({ _id: ev._id, organization: o._id }, { $set: { status: "done", processedAt: new Date(now), note: r.note, contact: r.contact ?? null, lockedAt: null } });
        out.processed++;
      } catch (e: any) {
        const passing = e instanceof MetaApiError && ["limite", "temporario", "rede"].includes(e.kind);
        const msg = String(e?.message || e).slice(0, 300);
        if (passing && ev.attempts < MAX_ATTEMPTS) {
          const wait = Math.min(60, 2 ** ev.attempts) * 60_000;
          await LeadAdsEvent.updateOne({ _id: ev._id, organization: o._id }, { $set: { status: "pending", runAfter: new Date(now + wait), lockedAt: null, note: `Nova tentativa: ${msg}` } });
          out.deferred++;
        } else {
          await LeadAdsEvent.updateOne({ _id: ev._id, organization: o._id }, { $set: { status: "failed", lockedAt: null, note: msg } });
          await LeadAdsPage.updateOne({ _id: ev.page, organization: o._id }, { $set: { lastError: msg } });
          out.failed++;
        }
      }
    }
  }
  return out;
}

// laço do servidor (instrumentation.ts), só roda com a chave geral ligada
let timer: ReturnType<typeof setInterval> | null = null;
let busy = false;
export function startLeadAdsLoop(everyMs = 15_000): void {
  if (timer) return;
  timer = setInterval(async () => {
    if (busy || !leadAdsGlobal()) return;
    busy = true;
    try {
      await processLeadAds();
    } catch (e) {
      console.error("[lead-ads] laço", e instanceof Error ? e.message : "erro");
    } finally {
      busy = false;
    }
  }, everyMs);
  timer.unref?.();
}

// ---------- Páginas (tela) ----------

export function publicPage(p: any) {
  return {
    _id: String(p._id), pageId: p.pageId, name: p.name || "", active: p.active === true, hasToken: Boolean(p.credentials?.accessToken),
    pipeline: p.pipeline ? String(p.pipeline) : "", stage: p.stage || "", owner: p.owner ? String(p.owner) : "", tags: p.tags || [], fieldMap: p.fieldMap || {},
    lastLeadAt: p.lastLeadAt || null, lastError: p.lastError || "",
  };
}

function cleanFieldMap(raw: unknown): Record<string, string> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw bad("Mapa de campos inválido.", "fieldMap");
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 40)) {
    const key = String(k).trim().slice(0, 100);
    const dest = String(v ?? "").trim();
    if (!key) continue;
    if (!/^(name|first_name|last_name|email|phone|ignore|field:[a-z0-9_]{1,30})$/.test(dest)) throw bad(`Destino inválido para o campo ${key}.`, "fieldMap");
    out[key] = dest;
  }
  return out;
}

async function cleanPage(org: Org, b: Record<string, any>, current?: any) {
  const { pipeline, stage } = await resolveStage(org, b.pipeline ?? current?.pipeline ?? null, b.stage ?? current?.stage ?? "");
  const ownerRaw = b.owner !== undefined ? b.owner : current?.owner;
  const owner = ownerRaw ? await ownUser(org, ownerRaw) : null;
  return {
    name: String(b.name ?? current?.name ?? "").trim().slice(0, 100),
    pipeline: pipeline._id, stage: stage.key, owner: owner?._id ?? null,
    tags: cleanTags(b.tags ?? current?.tags ?? []),
    fieldMap: b.fieldMap !== undefined ? cleanFieldMap(b.fieldMap) : current?.fieldMap || {},
    active: b.active === undefined ? (current ? current.active : true) : b.active === true,
  };
}

/** Confere o token só com LEITURA (GET /{page-id}?fields=id,name). Nada é escrito na Meta. */
async function checkPageToken(pageId: string, token: string, fetchImpl?: FetchLike): Promise<string> {
  ensureAdsMock(); // só no modo demonstração (IG_MOCK=1)
  const client = new MetaGraphClient(token, fetchImpl ?? getMetaFetch(), undefined, 2);
  const p = await client.get<{ id?: string; name?: string }>(`/${pageId}`, { fields: "id,name" });
  if (String(p.id || "") !== pageId) throw bad("Esse token não é desta Página.", "token");
  return p.name || "";
}

export async function createPage(org: Org, b: Record<string, any>, opts: { fetchImpl?: FetchLike } = {}) {
  const pageId = digits(String(b.pageId ?? "").trim());
  if (!pageId || pageId.length < 5) throw bad("Id da Página inválido (só números).", "pageId");
  const token = String(b.token ?? "").trim();
  if (token.length < 20) throw bad("Cole o token da Página (com a permissão leads_retrieval).", "token");
  const fields = await cleanPage(org, b);
  const metaName = await checkPageToken(pageId, token, opts.fetchImpl);
  try {
    return await LeadAdsPage.create({ organization: org, pageId, ...fields, name: fields.name || metaName, credentials: { accessToken: encrypt(token) } });
  } catch (e: any) {
    if (e?.code === 11000) throw bad("Esta Página já está cadastrada.", "pageId");
    throw e;
  }
}

export async function updatePage(org: Org, id: unknown, b: Record<string, any>, opts: { fetchImpl?: FetchLike } = {}) {
  const oid = toObjectId(id);
  const p: any = oid ? await LeadAdsPage.findOne({ _id: oid, organization: org }) : null;
  if (!p) throw notFound("Página");
  Object.assign(p, await cleanPage(org, b, p.toObject()));
  const token = String(b.token ?? "").trim();
  if (token) {
    if (token.length < 20) throw bad("Token inválido.", "token");
    await checkPageToken(p.pageId, token, opts.fetchImpl);
    p.credentials = { accessToken: encrypt(token) };
    p.lastError = "";
  }
  await p.save();
  return p;
}

export async function deletePage(org: Org, id: unknown) {
  const oid = toObjectId(id);
  const p: any = oid ? await LeadAdsPage.findOne({ _id: oid, organization: org }).lean() : null;
  if (!p) throw notFound("Página");
  await LeadAdsEvent.deleteMany({ organization: org, page: p._id, status: { $ne: "done" } });
  await LeadAdsPage.deleteOne({ _id: p._id, organization: org });
}

export async function leadAdsOverview(org: Org, orgDoc: any) {
  const [pages, events] = await Promise.all([
    LeadAdsPage.find({ organization: org }).sort({ createdAt: 1 }).lean(),
    LeadAdsEvent.find({ organization: org }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  return {
    switch: leadAdsSwitch(orgDoc),
    callbackPath: "/api/crm/lead-ads/webhook",
    verifyTokenSet: leadAdsVerifyToken().length >= 16,
    secretSet: Boolean(leadAdsSecret()),
    pages: (pages as any[]).map(publicPage),
    events: (events as any[]).map((e) => ({ _id: String(e._id), pageId: e.pageId, leadgenId: e.leadgenId, formId: e.formId, adId: e.adId, status: e.status, attempts: e.attempts, note: e.note, contact: e.contact ? String(e.contact) : null, createdAt: e.createdAt })),
  };
}
