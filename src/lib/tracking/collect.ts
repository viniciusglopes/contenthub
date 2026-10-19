import { createHash, randomBytes } from "node:crypto";
import type { Types } from "mongoose";
import { FriendlyError, notFound } from "@/lib/errors";
import { encrypt } from "@/lib/crypto";
import { toObjectId } from "@/lib/tenant";
import { appUrl } from "@/lib/automations/links";
import { applyTouch, logEvent, upsertLead } from "@/lib/crm/leads";
import { normEmail, normPhone } from "@/lib/crm/pure";
import { assertProject } from "@/lib/orgs";
import Organization from "@/models/Organization";
import { CaptureRate } from "@/models/Crm";
import { Contact } from "@/models/Automation";
import { TrackEvent, TrackVisitor, TrackingSite } from "@/models/Tracking";
import { sendCapi } from "./capi";
import { type TouchSnapT, fbcFrom, touchFromParams, touchHasData } from "./pure";
import { buildScript, snippetFor } from "./script";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Org = Types.ObjectId;
const bad = (msg: string, field: string) => new FriendlyError(msg, 400, field);

export const trackingGlobal = () => process.env.TRACKING_ENABLED === "true";
export function trackingSwitch(orgDoc: any) {
  const global = trackingGlobal();
  const org = orgDoc?.trackingEnabled === true;
  return { global, org, on: global && org, message: global && org ? "" : !org ? "O rastreamento está desligado para esta conta (o suporte liga em Admin › Clientes). Você já pode configurar; nada é recebido ainda." : "O rastreamento está desligado no servidor (TRACKING_ENABLED)." };
}

export const MAX_EVENT_BYTES = 8 * 1024;
const PER_IP_MIN = 60;

/** Site pela chave pública (consulta entre organizações só pela chave sorteada, como o webhook). */
export async function siteByKey(key: unknown): Promise<any | null> {
  const k = String(key || "");
  if (!/^[\w-]{10,24}$/.test(k)) return null;
  const site: any = await TrackingSite.findOne({ key: k }).setOptions({ crossOrg: true }).lean();
  if (!site) return null;
  const org: any = await Organization.findOne({ _id: site.organization, active: true }).select("trackingEnabled capiEnabled").lean();
  return org ? { site, org } : null;
}

export function scriptFor(site: any): string {
  return buildScript({ key: site.key, endpoint: `${appUrl()}/api/t/${site.key}/evento`, requireConsent: site.requireConsent !== false, banner: site.banner !== false, bannerText: site.bannerText || "", checkoutDomains: site.checkoutDomains || [] });
}

const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
const allowedHost = (site: any, host: string) => !site.domains?.length || site.domains.some((d: string) => host === d || host.endsWith(`.${d}`));

function snap(raw: any, fallbackAt: number): TouchSnapT | null {
  if (!raw || typeof raw !== "object") return null;
  const at = Number(raw.at);
  const t = touchFromParams({ ...raw, referrer: raw.referrer, landing: raw.landing }, new Date(Number.isFinite(at) && at > 0 ? Math.min(at, Date.now()) : fallbackAt));
  return t;
}

/** Converte o toque do rastreamento no toque do CRM (para o primeiro/último toque do lead). */
export function crmTouch(t: TouchSnapT | null, kind = "landing", label = "") {
  if (!t) return { kind, label, utm: {} };
  return {
    at: t.at ?? undefined, kind: t.adId || t.campaignId ? "link" : kind, label: label || t.campaign || t.source || "", campaignId: t.campaignId, adsetId: t.adsetId, adId: t.adId,
    utm: Object.fromEntries(Object.entries({ source: t.source, medium: t.medium, campaign: t.campaign, content: t.content, term: t.term }).filter(([, v]) => v)),
  };
}

/**
 * Evento do script. Resposta sempre curta (204/4xx) e sem dado do cliente.
 * Sem consentimento (quando o site exige) o evento é descartado aqui também.
 */
export async function collectEvent(keyRaw: unknown, body: any, meta: { ip: string; ua: string; origin: string }, now = Date.now()): Promise<{ status: number; error?: string }> {
  const found = await siteByKey(keyRaw);
  if (!found) return { status: 404, error: "site" };
  const { site, org } = found;
  if (!(trackingGlobal() && org.trackingEnabled === true)) return { status: 204 };
  if (!body || typeof body !== "object") return { status: 400, error: "corpo" };
  const type = body.t === "lead" ? "lead" : body.t === "initiate_checkout" ? "initiate_checkout" : body.t === "page_view" ? "page_view" : "";
  const vid = String(body.v || "");
  if (!type || !/^[0-9a-f]{24}$/.test(vid)) return { status: 400, error: "evento" };
  if (site.requireConsent !== false && body.c !== true) return { status: 204 };
  const url = String(body.u || "").slice(0, 800);
  const host = hostOf(url) || hostOf(meta.origin);
  if (!host || !allowedHost(site, host)) return { status: 403, error: "dominio" };
  const ipKey = createHash("sha256").update(`${process.env.AUTH_SECRET || ""}|${meta.ip}`).digest("hex").slice(0, 20);
  const minute = Math.floor(now / 60_000);
  const rate: any = await CaptureRate.findOneAndUpdate({ organization: site.organization, key: `trk:${ipKey}:${minute}` }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(now + 5 * 60_000) } }, { upsert: true, returnDocument: "after" }).lean();
  if ((rate?.count ?? 1) > PER_IP_MIN) return { status: 429, error: "limite" };

  const orgId: Org = site.organization;
  const first = snap(body.f, now);
  const last = snap(body.l, now);
  const fbcRaw = String(body.fbc || "").slice(0, 600);
  const fbc = /^fb\.\d\.\d+\..+/.test(fbcRaw) ? fbcRaw : last?.clickType === "fbclid" ? fbcFrom(last.clickId, now) : "";
  const fbp = /^fb\.\d\.\d+\.\d+$/.test(String(body.fbp || "")) ? String(body.fbp) : "";
  const set: Record<string, unknown> = { lastSeenAt: new Date(now), expiresAt: new Date(now + 395 * 86_400_000) };
  if (last && touchHasData(last)) set.lastTouch = last;
  if (fbc) set.fbc = fbc;
  if (fbp) set.fbp = fbp;
  const visitor: any = await TrackVisitor.findOneAndUpdate(
    { organization: orgId, site: site._id, vid },
    { $set: set, $setOnInsert: { firstTouch: first && touchHasData(first) ? first : last, ...(set.lastTouch ? {} : { lastTouch: last }) }, $inc: { pageViews: type === "page_view" ? 1 : 0 } },
    { upsert: true, returnDocument: "after" }
  ).lean();
  const eventId = /^[\w.-]{6,80}$/.test(String(body.id || "")) ? String(body.id) : "";
  const path = (() => { try { const u = new URL(url); return `${u.origin}${u.pathname}`.slice(0, 300); } catch { return ""; } })();
  await TrackEvent.create({ organization: orgId, site: site._id, vid, type, eventId, path, host, touch: last, contact: visitor.contact ?? null, at: new Date(now) });
  await TrackingSite.updateOne({ _id: site._id, organization: orgId }, { $set: { lastHitAt: new Date(now) }, $inc: { hits: 1 } });

  let contactId: any = visitor.contact ?? null;
  if (type === "lead") {
    const l = body.lead && typeof body.lead === "object" ? body.lead : {};
    const email = normEmail(l.email) || "";
    const phone = normPhone(l.phone)?.phone || "";
    if ((email || phone) && l.consent === true) {
      const touch = crmTouch(visitor.firstTouch || last, "landing");
      const r = await upsertLead(orgId, {
        name: String(l.name || "").slice(0, 120), email, phone, tags: ["site"], source: "landing",
        origin: { label: host, url: path, campaignId: touch.campaignId || "", adId: touch.adId || "" },
        touch: crmTouch(last || visitor.firstTouch, "landing", host) as any,
        utm: (touch as any).utm,
        consent: { given: true, channel: "landing", text: "Marcou a caixinha de autorização no formulário do site.", basis: `formulário em ${host}`, at: new Date(now) },
        eventKind: "capture", eventText: `Preencheu o formulário em ${path || host}.`,
      }, null, new Date(now));
      contactId = r.contact._id;
      // primeiro toque do visitante (anterior ao lead) também vale para o lead
      if (visitor.firstTouch && touchHasData(visitor.firstTouch)) {
        const c: any = await Contact.findOne({ _id: contactId, organization: orgId }).lean();
        const extra = applyTouch(c, crmTouch(visitor.firstTouch, "landing", host) as any, new Date(now));
        if (Object.keys(extra).length) await Contact.updateOne({ _id: contactId, organization: orgId }, { $set: extra });
      }
      await TrackVisitor.updateOne({ _id: visitor._id, organization: orgId }, { $set: { contact: contactId } });
      await TrackEvent.updateMany({ organization: orgId, site: site._id, vid }, { $set: { contact: contactId } });
      await sendCapi(orgId, site, { eventName: "Lead", eventId: eventId || `lead.${randomBytes(8).toString("hex")}`, at: new Date(now), url, contact: contactId, person: { email, phone, name: l.name, externalId: String(contactId), fbc: visitor.fbc || fbc, fbp: visitor.fbp || fbp, ip: meta.ip, ua: meta.ua } });
    }
  } else if (type === "initiate_checkout" && contactId) {
    await logEvent(orgId, contactId, "checkout", `Clicou para o checkout em ${host}.`, null, null, new Date(now));
  }
  if (type === "initiate_checkout" && eventId) {
    const c: any = contactId ? await Contact.findOne({ _id: contactId, organization: orgId }).select("email phone name").lean() : null;
    await sendCapi(orgId, site, { eventName: "InitiateCheckout", eventId, at: new Date(now), url, contact: contactId, person: { email: c?.email, phone: c?.phone, name: c?.name, externalId: contactId ? String(contactId) : vid, fbc: visitor.fbc || fbc, fbp: visitor.fbp || fbp, ip: meta.ip, ua: meta.ua } });
  }
  return { status: 204 };
}

// ---------- sites (tela) ----------

const cleanDomains = (v: unknown) =>
  [...new Set((Array.isArray(v) ? v : String(v ?? "").split(/[,\s]+/)).map((x) => String(x).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter((x) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(x)))].slice(0, 20);

export function publicSite(s: any) {
  const scriptUrl = `${appUrl()}/api/t/${s.key}/script`;
  return {
    _id: String(s._id), project: String(s.project), name: s.name || "", key: s.key, domains: s.domains || [], requireConsent: s.requireConsent !== false, banner: s.banner !== false, bannerText: s.bannerText || "",
    checkoutDomains: s.checkoutDomains || [], pixelId: s.pixelId || "", capi: { enabled: s.capi?.enabled === true, hasToken: Boolean(s.capi?.accessToken), testEventCode: s.capi?.testEventCode || "", initiateCheckout: s.capi?.initiateCheckout === true },
    lastHitAt: s.lastHitAt || null, hits: s.hits || 0, scriptUrl, snippet: snippetFor(scriptUrl),
  };
}

async function applySite(org: Org, s: any, b: Record<string, any>) {
  if (b.name !== undefined) s.name = String(b.name ?? "").trim().slice(0, 80);
  if (b.domains !== undefined) s.domains = cleanDomains(b.domains);
  if (b.checkoutDomains !== undefined) s.checkoutDomains = cleanDomains(b.checkoutDomains);
  if (b.requireConsent !== undefined) s.requireConsent = b.requireConsent !== false;
  if (b.banner !== undefined) s.banner = b.banner !== false;
  if (b.bannerText !== undefined) s.bannerText = String(b.bannerText ?? "").trim().slice(0, 300);
  if (b.pixelId !== undefined) {
    const p = String(b.pixelId ?? "").trim();
    if (p && !/^\d{10,20}$/.test(p)) throw bad("Id do pixel inválido (só números).", "pixelId");
    s.pixelId = p;
  }
  s.capi = s.capi || {};
  if (b.capiToken !== undefined && String(b.capiToken).trim()) {
    const t = String(b.capiToken).trim();
    if (t.length < 30 || /\s/.test(t)) throw bad("Token da API de Conversões inválido.", "capiToken");
    s.capi.accessToken = encrypt(t);
  }
  if (b.removeCapiToken === true) s.capi.accessToken = "";
  if (b.testEventCode !== undefined) {
    const c = String(b.testEventCode ?? "").trim();
    if (c && !/^[A-Z0-9]{4,20}$/i.test(c)) throw bad("Código de teste inválido (ex.: TEST12345).", "testEventCode");
    s.capi.testEventCode = c;
  }
  if (b.initiateCheckout !== undefined) s.capi.initiateCheckout = b.initiateCheckout === true;
  if (b.capiEnabled !== undefined) {
    if (b.capiEnabled === true && (!s.pixelId || !s.capi.accessToken)) throw bad("Para ligar o envio, preencha o pixel e o token.", "capiEnabled");
    s.capi.enabled = b.capiEnabled === true;
  }
  void org;
}

export async function createSite(org: Org, b: Record<string, any>) {
  const project = toObjectId(b.project);
  if (!project) throw notFound("Projeto");
  await assertProject(org, project);
  if (await TrackingSite.exists({ organization: org, project })) throw bad("Este projeto já tem um script de rastreamento.", "project");
  const s: any = new TrackingSite({ organization: org, project, key: randomBytes(8).toString("hex"), requireConsent: true, banner: true });
  await applySite(org, s, b);
  await s.save();
  return s;
}

export async function updateSite(org: Org, id: unknown, b: Record<string, any>) {
  const oid = toObjectId(id);
  const s: any = oid ? await TrackingSite.findOne({ _id: oid, organization: org }) : null;
  if (!s) throw notFound("Site");
  await applySite(org, s, b);
  s.markModified("capi");
  await s.save();
  return s;
}

export async function deleteSite(org: Org, id: unknown) {
  const oid = toObjectId(id);
  const s: any = oid ? await TrackingSite.findOne({ _id: oid, organization: org }).lean() : null;
  if (!s) throw notFound("Site");
  await TrackVisitor.deleteMany({ organization: org, site: s._id });
  await TrackEvent.deleteMany({ organization: org, site: s._id });
  await TrackingSite.deleteOne({ _id: s._id, organization: org });
}
