import { randomBytes } from "node:crypto";
import type { Types } from "mongoose";
import { FriendlyError, notFound } from "@/lib/errors";
import { decrypt, encrypt } from "@/lib/crypto";
import { toObjectId } from "@/lib/tenant";
import { appUrl } from "@/lib/automations/links";
import { changeStage, logEvent, upsertLead } from "@/lib/crm/leads";
import { ownPipeline } from "@/lib/crm/pipelines";
import { normEmail, normPhone } from "@/lib/crm/pure";
import { assertProject } from "@/lib/orgs";
import { Contact } from "@/models/Automation";
import Organization from "@/models/Organization";
import { Sale, SalesIntegration, TrackVisitor, TrackingSite } from "@/models/Tracking";
import { sendCapi } from "./capi";
import { crmTouch, trackingGlobal } from "./collect";
import { type ParsedSale, checkHottok, checkKiwifySignature, parseHotmart, parseKiwify, touchFromParams, touchHasData } from "./pure";

/* eslint-disable @typescript-eslint/no-explicit-any */

// VENDAS (Hotmart e Kiwify): webhook público por integração (/api/vendas/<provedor>/<chave sorteada>),
// autenticação do provedor conferida (hottok / assinatura HMAC), idempotente por transação + tipo,
// liga a venda ao lead (src/sck do nosso script > e-mail > telefone > lead novo), põe na linha do tempo,
// muda a etapa ao aprovar (configurável) e manda Purchase para a API de Conversões (se ligada).

type Org = Types.ObjectId;
const bad = (msg: string, field: string) => new FriendlyError(msg, 400, field);
const KIND_PT: Record<string, string> = { approved: "Compra aprovada", refunded: "Reembolso", chargeback: "Chargeback", abandoned: "Carrinho abandonado", pending: "Aguardando pagamento", canceled: "Compra cancelada/recusada", other: "Evento de venda" };
const PROVIDER_PT: Record<string, string> = { hotmart: "Hotmart", kiwify: "Kiwify" };
const money = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function integrationByKey(provider: string, key: unknown) {
  const k = String(key || "");
  if (!/^[\w-]{16,40}$/.test(k) || !["hotmart", "kiwify"].includes(provider)) return null;
  const integ: any = await SalesIntegration.findOne({ key: k, provider }).setOptions({ crossOrg: true }).lean();
  if (!integ) return null;
  const org: any = await Organization.findOne({ _id: integ.organization, active: true }).select("trackingEnabled").lean();
  return org ? { integ, org } : null;
}

/** Confere a autenticação do provedor no corpo cru. */
export function authenticate(provider: string, integ: any, raw: Buffer, headers: Headers, query: URLSearchParams, body: any): boolean {
  const secret = integ.secret ? decrypt(integ.secret) : "";
  if (provider === "hotmart") return checkHottok(headers.get("x-hotmart-hottok"), body?.hottok, secret);
  return checkKiwifySignature(raw, query.get("signature"), secret);
}

export function parseSale(provider: string, body: any): ParsedSale | null {
  return provider === "hotmart" ? parseHotmart(body) : parseKiwify(body);
}

async function findContactFor(org: Org, sale: ParsedSale): Promise<{ contact: any | null; visitor: any | null; by: string }> {
  for (const v of [sale.src, sale.params.sck, sale.params.src].filter(Boolean)) {
    if (!/^[0-9a-f]{24}$/.test(String(v))) continue;
    const visitor: any = await TrackVisitor.findOne({ organization: org, vid: v }).lean();
    if (visitor?.contact) {
      const c = await Contact.findOne({ _id: visitor.contact, organization: org }).lean();
      if (c) return { contact: c, visitor, by: "src" };
    }
    if (visitor) {
      const byMail = await matchByIdentity(org, sale);
      return { contact: byMail.contact, visitor, by: byMail.contact ? byMail.by : "src-visitor" };
    }
  }
  const m = await matchByIdentity(org, sale);
  return { contact: m.contact, visitor: null, by: m.by };
}

async function matchByIdentity(org: Org, sale: ParsedSale) {
  const email = normEmail(sale.buyer.email);
  if (email) {
    const c = await Contact.findOne({ organization: org, email }).sort({ createdAt: 1 }).lean();
    if (c) return { contact: c, by: "email" };
  }
  const ph = normPhone(sale.buyer.phone);
  if (ph) {
    const c = await Contact.findOne({ organization: org, phoneKey: ph.key }).sort({ createdAt: 1 }).lean();
    if (c) return { contact: c, by: "phone" };
  }
  return { contact: null, by: "none" };
}

export interface SaleResult { status: "stored" | "duplicate" | "ignored"; reason?: string }

export async function processSale(provider: string, integ: any, parsed: ParsedSale, now = Date.now()): Promise<SaleResult> {
  const org: Org = integ.organization;
  let saleDoc: any;
  try {
    saleDoc = await Sale.create({ organization: org, integration: integ._id, provider, externalId: parsed.externalId, kind: parsed.kind, providerEvent: parsed.providerEvent, value: parsed.value, currency: parsed.currency, product: parsed.product, productId: parsed.productId, src: parsed.src, at: parsed.at });
  } catch (e: any) {
    if (e?.code === 11000) return { status: "duplicate" };
    throw e;
  }
  await SalesIntegration.updateOne({ _id: integ._id, organization: org }, { $set: { lastEventAt: new Date(now) }, $inc: { events: 1 } });
  const found = await findContactFor(org, parsed);
  let contact = found.contact;
  let by = found.by;
  const visitor = found.visitor;
  // toque da venda: o do visitante (script) ou os parâmetros que o checkout devolveu
  const paramTouch = touchFromParams(parsed.params, parsed.at);
  const touchSnap = visitor?.lastTouch && touchHasData(visitor.lastTouch) ? visitor.lastTouch : touchHasData(paramTouch) ? paramTouch : null;
  const label = `${PROVIDER_PT[provider]}${parsed.product ? `: ${parsed.product}` : ""}`;
  if (!contact && parsed.kind !== "abandoned" && (parsed.buyer.email || parsed.buyer.phone)) {
    // comprador que não estava no CRM: vira lead (base legal: execução do contrato da compra)
    const firstSnap = visitor?.firstTouch && touchHasData(visitor.firstTouch) ? visitor.firstTouch : touchSnap;
    const r = await upsertLead(org, {
      name: parsed.buyer.name, email: normEmail(parsed.buyer.email) || "", phone: normPhone(parsed.buyer.phone)?.phone || "",
      tags: ["cliente"], pipeline: integ.pipeline, source: "sale",
      origin: { label, campaignId: firstSnap?.campaignId || "", adId: firstSnap?.adId || "" },
      touch: crmTouch(firstSnap, "sale", label) as any,
      utm: (crmTouch(firstSnap) as any).utm,
      consent: { given: true, channel: "purchase", text: "Dados do comprador recebidos da plataforma de pagamento (execução do contrato da compra).", basis: `compra ${parsed.externalId} na ${PROVIDER_PT[provider]}`, at: parsed.at },
      eventKind: "sale", eventText: `Entrou pela compra na ${label}.`,
    }, null, new Date(now));
    contact = r.contact;
    by = by === "src-visitor" ? "src" : "new";
    if (visitor) await TrackVisitor.updateOne({ _id: visitor._id, organization: org }, { $set: { contact: contact._id } });
  }
  const update: Record<string, unknown> = { contact: contact?._id ?? null, matchedBy: contact ? by : "none", touch: touchSnap };
  if (contact) {
    await logEvent(org, contact._id, "sale", `${KIND_PT[parsed.kind]}: ${label}${parsed.value ? ` (${money(parsed.value)})` : ""}.`, { provider, externalId: parsed.externalId, kind: parsed.kind, value: parsed.value }, null, parsed.at);
    if (touchSnap) {
      const { applyTouch } = await import("@/lib/crm/leads");
      const set = applyTouch(contact, crmTouch(touchSnap, "sale", label) as any, parsed.at);
      if (Object.keys(set).length) await Contact.updateOne({ _id: contact._id, organization: org }, { $set: set });
    }
    if (parsed.kind === "approved") {
      const fresh: any = await Contact.findOne({ _id: contact._id, organization: org }).lean();
      if (fresh.value == null && parsed.value) await Contact.updateOne({ _id: contact._id, organization: org }, { $set: { value: parsed.value } });
      if (integ.stageOnApproved !== "-") {
        const pipe = await ownPipeline(org, integ.pipeline || fresh.pipeline || null).catch(() => ownPipeline(org, null));
        const target = integ.stageOnApproved || (pipe.stages || []).find((s: any) => s.kind === "won")?.key;
        if (target && (pipe.stages || []).some((s: any) => s.key === target)) await changeStage(org, { ...fresh, lead: fresh.lead }, target, null, { pipeline: pipe._id }, new Date(now)).catch(() => null);
      }
    } else if ((parsed.kind === "refunded" || parsed.kind === "chargeback") && integ.stageOnRefund) {
      const fresh: any = await Contact.findOne({ _id: contact._id, organization: org }).lean();
      await changeStage(org, fresh, integ.stageOnRefund, null, { pipeline: integ.pipeline || fresh.pipeline, lostReason: KIND_PT[parsed.kind] }, new Date(now)).catch(() => null);
    } else if (parsed.kind === "abandoned") {
      await Contact.updateOne({ _id: contact._id, organization: org }, { $addToSet: { tags: "carrinho-abandonado" } });
    }
  }
  if (parsed.kind === "approved") {
    const site: any =
      (visitor && (await TrackingSite.findOne({ _id: visitor.site, organization: org }).lean())) ||
      (integ.project && (await TrackingSite.findOne({ organization: org, project: integ.project }).lean())) ||
      (await TrackingSite.findOne({ organization: org, "capi.enabled": true }).lean());
    if (site) {
      const r = await sendCapi(org, site, {
        eventName: "Purchase", eventId: `purchase.${provider}.${parsed.externalId}`, at: parsed.at, value: parsed.value, currency: parsed.currency, contact: contact?._id ?? null,
        person: { email: parsed.buyer.email || contact?.email, phone: parsed.buyer.phone || contact?.phone, name: parsed.buyer.name || contact?.name, externalId: contact ? String(contact._id) : "", fbc: visitor?.fbc || "", fbp: visitor?.fbp || "" },
        actionSource: "system_generated",
      });
      update.capi = r.status;
    } else update.capi = "sem site";
  }
  await Sale.updateOne({ _id: saleDoc._id, organization: org }, { $set: update });
  return { status: "stored" };
}

export async function receiveSale(provider: string, key: unknown, raw: Buffer, headers: Headers, query: URLSearchParams, now = Date.now()): Promise<{ status: number; body: Record<string, unknown> }> {
  const found = await integrationByKey(provider, key);
  if (!found) return { status: 404, body: { error: "Integração não encontrada." } };
  const { integ, org } = found;
  let body: any;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return { status: 400, body: { error: "JSON inválido." } };
  }
  if (!authenticate(provider, integ, raw, headers, query, body)) return { status: 401, body: { error: "Autenticação inválida." } };
  // chaves desligadas ou integração pausada: responde 200 (o provedor não fica reenviando) e não guarda nada
  if (!(trackingGlobal() && org.trackingEnabled === true) || !integ.active) return { status: 200, body: { ok: true, ignored: "desligado" } };
  const parsed = parseSale(provider, body);
  if (!parsed) return { status: 200, body: { ok: true, ignored: "evento sem transação" } };
  const r = await processSale(provider, integ, parsed, now);
  return { status: 200, body: { ok: true, ...r } };
}

// ---------- integrações (tela) ----------

export function publicIntegration(i: any) {
  return {
    _id: String(i._id), provider: i.provider, name: i.name || "", url: `${appUrl()}/api/vendas/${i.provider}/${i.key}`, hasSecret: Boolean(i.secret), project: i.project ? String(i.project) : "",
    pipeline: i.pipeline ? String(i.pipeline) : "", stageOnApproved: i.stageOnApproved || "", stageOnRefund: i.stageOnRefund || "", active: i.active === true, lastEventAt: i.lastEventAt || null, events: i.events || 0,
  };
}

async function applyIntegration(org: Org, i: any, b: Record<string, any>) {
  if (b.name !== undefined) i.name = String(b.name ?? "").trim().slice(0, 80);
  if (b.secret !== undefined && String(b.secret).trim()) {
    const v = String(b.secret).trim();
    if (v.length < 8 || v.length > 200 || /\s/.test(v)) throw bad(i.provider === "hotmart" ? "Hottok inválido." : "Token inválido.", "secret");
    i.secret = encrypt(v);
  }
  if (b.project !== undefined) {
    const p = b.project ? toObjectId(b.project) : null;
    if (b.project && !p) throw notFound("Projeto");
    if (p) await assertProject(org, p);
    i.project = p;
  }
  if (b.pipeline !== undefined) i.pipeline = b.pipeline ? (await ownPipeline(org, b.pipeline))._id : null;
  const pipe = await ownPipeline(org, i.pipeline || null);
  for (const f of ["stageOnApproved", "stageOnRefund"] as const) {
    if (b[f] === undefined) continue;
    const v = String(b[f] ?? "");
    if (v && v !== "-" && !(pipe.stages || []).some((s: any) => s.key === v)) throw bad("Etapa não existe neste funil.", f);
    i[f] = v;
  }
  if (b.active !== undefined) i.active = b.active === true;
}

export async function createIntegration(org: Org, b: Record<string, any>) {
  const provider = String(b.provider || "");
  if (!["hotmart", "kiwify"].includes(provider)) throw bad("Escolha Hotmart ou Kiwify.", "provider");
  if ((await SalesIntegration.countDocuments({ organization: org })) >= 20) throw bad("No máximo 20 integrações.", "provider");
  const i: any = new SalesIntegration({ organization: org, provider, key: randomBytes(16).toString("hex"), active: true });
  await applyIntegration(org, i, b);
  if (!i.secret) throw bad(provider === "hotmart" ? "Cole o hottok (Hotmart › Webhook › Autenticação)." : "Cole o token do webhook da Kiwify.", "secret");
  await i.save();
  return i;
}

export async function updateIntegration(org: Org, id: unknown, b: Record<string, any>) {
  const oid = toObjectId(id);
  const i: any = oid ? await SalesIntegration.findOne({ _id: oid, organization: org }) : null;
  if (!i) throw notFound("Integração");
  await applyIntegration(org, i, b);
  await i.save();
  return i;
}

export async function deleteIntegration(org: Org, id: unknown) {
  const oid = toObjectId(id);
  const i: any = oid ? await SalesIntegration.findOne({ _id: oid, organization: org }).lean() : null;
  if (!i) throw notFound("Integração");
  await SalesIntegration.deleteOne({ _id: i._id, organization: org });
}

export async function listSales(org: Org, p: URLSearchParams) {
  const q: Record<string, unknown> = { organization: org };
  const kind = p.get("tipo");
  if (kind) q.kind = kind;
  const rows: any[] = await Sale.find(q).sort({ at: -1 }).limit(Math.min(300, Number(p.get("limite")) || 100)).lean();
  const ids = rows.map((r) => r.contact).filter(Boolean);
  const contacts: any[] = ids.length ? await Contact.find({ organization: org, _id: { $in: ids } }).select("name username email phone").lean() : [];
  const names = new Map(contacts.map((c) => [String(c._id), c.name || (c.username ? `@${c.username}` : "") || c.email || c.phone]));
  return rows.map((r) => ({ _id: String(r._id), provider: r.provider, kind: r.kind, value: r.value, currency: r.currency, product: r.product, at: r.at, contact: r.contact ? String(r.contact) : null, contactName: r.contact ? names.get(String(r.contact)) || "" : "", matchedBy: r.matchedBy, campaign: r.touch?.campaign || r.touch?.source || "", capi: r.capi || "" }));
}
