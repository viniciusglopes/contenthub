import mongoose, { Schema } from "mongoose";
import { tenantPlugin } from "@/lib/tenant";

/* RASTREAMENTO PRÓPRIO (estilo Utmify/Stape, marca nossa), por organização.
 *   TrackingSite   script do site por projeto: chave pública, domínios, consentimento, pixel + token CAPI (criptografado)
 *   TrackVisitor   visitante (cookie primário _chv): primeiro/último toque, fbc/fbp, clique do Google/TikTok, lead ligado
 *   TrackEvent     page_view / lead / initiate_checkout recebidos do script (some em 180 dias)
 *   SalesIntegration  Hotmart / Kiwify: chave da URL do webhook + token (criptografado) + etapa ao aprovar
 *   Sale           evento de venda (aprovada, reembolso, chargeback, abandono...), idempotente
 *   CapiLog        cada envio à API de Conversões da Meta e a resposta (some em 90 dias)
 * Chaves desligadas: env TRACKING_ENABLED + Organization.trackingEnabled (coleta e vendas);
 * env CAPI_ENABLED + Organization.capiEnabled + TrackingSite.capi.enabled (envio à Meta).
 */

const TouchSnap = new Schema(
  {
    at: { type: Date, default: null },
    source: { type: String, default: "" },
    medium: { type: String, default: "" },
    campaign: { type: String, default: "" },
    content: { type: String, default: "" },
    term: { type: String, default: "" },
    /** id de campanha/conjunto/anúncio quando a URL traz (utm_id, campaign_id, ad_id ou utm com {{campaign.id}}) */
    campaignId: { type: String, default: "" },
    adsetId: { type: String, default: "" },
    adId: { type: String, default: "" },
    clickId: { type: String, default: "" },
    clickType: { type: String, default: "" },
    referrer: { type: String, default: "" },
    landing: { type: String, default: "" },
  },
  { _id: false }
);

const TrackingSiteSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    name: { type: String, default: "" },
    /** chave pública que vai no script (sorteada, 64 bits) */
    key: { type: String, required: true },
    /** domínios que podem mandar evento (vazio = qualquer um) */
    domains: { type: [String], default: [] },
    /** sem aceite do visitante, o script não grava cookie nem manda evento */
    requireConsent: { type: Boolean, default: true },
    /** mostrar o aviso de cookies nosso (senão o site chama chTrack.consent(true)) */
    banner: { type: Boolean, default: true },
    bannerText: { type: String, default: "" },
    /** domínios de checkout que recebem src/sck/utm no link */
    checkoutDomains: { type: [String], default: [] },
    pixelId: { type: String, default: "" },
    capi: {
      enabled: { type: Boolean, default: false },
      accessToken: { type: String, default: "" },
      testEventCode: { type: String, default: "" },
      /** mandar também InitiateCheckout (clique no link do checkout) */
      initiateCheckout: { type: Boolean, default: false },
    },
    lastHitAt: { type: Date, default: null },
    hits: { type: Number, default: 0 },
  },
  { timestamps: true }
);
TrackingSiteSchema.plugin(tenantPlugin, { model: "TrackingSite" });
TrackingSiteSchema.index({ organization: 1, project: 1 }, { unique: true });
TrackingSiteSchema.index({ key: 1 });

const TrackVisitorSchema = new Schema(
  {
    site: { type: Schema.Types.ObjectId, ref: "TrackingSite", required: true },
    vid: { type: String, required: true },
    firstTouch: { type: TouchSnap, default: null },
    lastTouch: { type: TouchSnap, default: null },
    fbc: { type: String, default: "" },
    fbp: { type: String, default: "" },
    contact: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
    lastSeenAt: { type: Date, default: () => new Date() },
    pageViews: { type: Number, default: 0 },
    /** some 13 meses depois da última visita */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
TrackVisitorSchema.plugin(tenantPlugin, { model: "TrackVisitor" });
TrackVisitorSchema.index({ organization: 1, site: 1, vid: 1 }, { unique: true });
TrackVisitorSchema.index({ organization: 1, contact: 1 });
TrackVisitorSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const TrackEventSchema = new Schema(
  {
    site: { type: Schema.Types.ObjectId, ref: "TrackingSite", required: true },
    vid: { type: String, required: true },
    type: { type: String, enum: ["page_view", "lead", "initiate_checkout"], required: true },
    eventId: { type: String, default: "" },
    /** endereço sem a parte de consulta (as UTMs vão em touch) */
    path: { type: String, default: "" },
    host: { type: String, default: "" },
    touch: { type: TouchSnap, default: null },
    contact: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
    at: { type: Date, default: () => new Date() },
  },
  { timestamps: false }
);
TrackEventSchema.plugin(tenantPlugin, { model: "TrackEvent" });
TrackEventSchema.index({ organization: 1, site: 1, at: -1 });
TrackEventSchema.index({ organization: 1, contact: 1 });
TrackEventSchema.index({ at: 1 }, { expireAfterSeconds: 180 * 86_400 });

const SalesIntegrationSchema = new Schema(
  {
    provider: { type: String, enum: ["hotmart", "kiwify"], required: true },
    name: { type: String, default: "" },
    /** chave sorteada da URL do webhook (/api/vendas/<provedor>/<chave>) */
    key: { type: String, required: true },
    /** hottok da Hotmart / token do webhook da Kiwify, criptografado */
    secret: { type: String, default: "" },
    project: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    pipeline: { type: Schema.Types.ObjectId, ref: "Pipeline", default: null },
    /** etapa ao aprovar ("" = primeira etapa de ganho; "-" = não mexe) */
    stageOnApproved: { type: String, default: "" },
    /** etapa no reembolso/chargeback ("" = não mexe) */
    stageOnRefund: { type: String, default: "" },
    active: { type: Boolean, default: true },
    lastEventAt: { type: Date, default: null },
    events: { type: Number, default: 0 },
  },
  { timestamps: true }
);
SalesIntegrationSchema.plugin(tenantPlugin, { model: "SalesIntegration" });
SalesIntegrationSchema.index({ key: 1 });

const SaleSchema = new Schema(
  {
    integration: { type: Schema.Types.ObjectId, ref: "SalesIntegration", required: true },
    provider: { type: String, required: true },
    /** transação / pedido no provedor */
    externalId: { type: String, required: true },
    /** approved | refunded | chargeback | abandoned | pending | canceled | other */
    kind: { type: String, required: true },
    providerEvent: { type: String, default: "" },
    value: { type: Number, default: 0 },
    currency: { type: String, default: "BRL" },
    product: { type: String, default: "" },
    productId: { type: String, default: "" },
    contact: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
    /** como achou o lead: src | email | phone | new | none */
    matchedBy: { type: String, default: "none" },
    src: { type: String, default: "" },
    touch: { type: TouchSnap, default: null },
    at: { type: Date, default: () => new Date() },
    capi: { type: String, default: "" },
  },
  { timestamps: true }
);
SaleSchema.plugin(tenantPlugin, { model: "Sale" });
SaleSchema.index({ organization: 1, provider: 1, externalId: 1, kind: 1 }, { unique: true });
SaleSchema.index({ organization: 1, at: -1 });
SaleSchema.index({ organization: 1, contact: 1 });

const CapiLogSchema = new Schema(
  {
    site: { type: Schema.Types.ObjectId, ref: "TrackingSite", default: null },
    eventName: { type: String, required: true },
    eventId: { type: String, default: "" },
    /** sent | test | failed | skipped */
    status: { type: String, required: true },
    reason: { type: String, default: "" },
    /** quais chaves de pessoa foram (em, ph, fbc...), nunca os valores */
    keys: { type: [String], default: [] },
    actionSource: { type: String, default: "" },
    value: { type: Number, default: null },
    testEventCode: { type: String, default: "" },
    response: { type: Schema.Types.Mixed, default: null },
    contact: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
    at: { type: Date, default: () => new Date() },
  },
  { timestamps: false }
);
CapiLogSchema.plugin(tenantPlugin, { model: "CapiLog" });
CapiLogSchema.index({ organization: 1, at: -1 });
CapiLogSchema.index({ at: 1 }, { expireAfterSeconds: 90 * 86_400 });

const m = mongoose.models;
export const TrackingSite = m.TrackingSite || mongoose.model("TrackingSite", TrackingSiteSchema);
export const TrackVisitor = m.TrackVisitor || mongoose.model("TrackVisitor", TrackVisitorSchema);
export const TrackEvent = m.TrackEvent || mongoose.model("TrackEvent", TrackEventSchema);
export const SalesIntegration = m.SalesIntegration || mongoose.model("SalesIntegration", SalesIntegrationSchema);
export const Sale = m.Sale || mongoose.model("Sale", SaleSchema);
export const CapiLog = m.CapiLog || mongoose.model("CapiLog", CapiLogSchema);
