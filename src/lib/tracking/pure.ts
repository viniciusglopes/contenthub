import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Peças puras do rastreamento: normalização e hash (API de Conversões), leitura dos webhooks de venda
// e toque a partir de parâmetros. Sem banco, para testar direto.

/* eslint-disable @typescript-eslint/no-explicit-any */

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Dados da pessoa para a API de Conversões. Doc oficial (lida 19/10/2026):
 * developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 *  - em, ph, fn, ln: SHA-256 obrigatório; external_id: hash recomendado;
 *  - em: tirar espaços das pontas e minúsculas; ph: só dígitos, sem zero à esquerda, COM código do país;
 *  - client_ip_address, client_user_agent, fbc, fbp: NÃO fazer hash.
 */
export function normEmailForMeta(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}
export function normPhoneForMeta(v: unknown): string {
  let d = String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`; // telefone do Brasil sem o 55
  return d;
}
export function normNameForMeta(v: unknown): string {
  return String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s-]/g, "").trim();
}

export interface PersonForMeta { email?: string; phone?: string; name?: string; externalId?: string; fbc?: string; fbp?: string; ip?: string; ua?: string }

export function buildUserData(p: PersonForMeta): { userData: Record<string, unknown>; keys: string[] } {
  const ud: Record<string, unknown> = {};
  const em = normEmailForMeta(p.email);
  if (em) ud.em = [sha256(em)];
  const ph = normPhoneForMeta(p.phone);
  if (ph.length >= 8) ud.ph = [sha256(ph)];
  const parts = normNameForMeta(p.name).split(/\s+/).filter(Boolean);
  if (parts[0]) ud.fn = [sha256(parts[0])];
  if (parts.length > 1) ud.ln = [sha256(parts[parts.length - 1])];
  if (p.externalId) ud.external_id = [sha256(String(p.externalId))];
  if (p.fbc && /^fb\.\d\.\d+\..+/.test(p.fbc)) ud.fbc = p.fbc;
  if (p.fbp && /^fb\.\d\.\d+\.\d+/.test(p.fbp)) ud.fbp = p.fbp;
  if (p.ip) ud.client_ip_address = p.ip;
  if (p.ua) ud.client_user_agent = p.ua.slice(0, 400);
  return { userData: ud, keys: Object.keys(ud) };
}

/** fbc a partir do fbclid (formato fb.1.<milissegundos>.<fbclid>). */
export const fbcFrom = (fbclid: string, at: number) => (fbclid ? `fb.1.${at}.${fbclid}` : "");

// ---------- toque a partir de parâmetros (UTM, ids de clique, src/sck) ----------

const s = (v: unknown, n = 160) => String(v ?? "").trim().slice(0, n);
const digits = (v: unknown) => (/^\d{3,30}$/.test(String(v ?? "")) ? String(v) : "");

export interface TouchSnapT { at: Date | null; source: string; medium: string; campaign: string; content: string; term: string; campaignId: string; adsetId: string; adId: string; clickId: string; clickType: string; referrer: string; landing: string }

/** Monta o toque de um objeto com utm_*, fbclid/gclid/ttclid e ids de anúncio (utm_id, campaign_id, adset_id, ad_id). */
export function touchFromParams(p: Record<string, unknown>, at: Date | null = new Date()): TouchSnapT {
  const g = (k: string) => s(p[k] ?? p[k.replace(/^utm_/, "")]);
  const campaign = g("utm_campaign");
  const content = g("utm_content");
  const term = g("utm_term");
  const fb = s(p.fbclid, 500);
  const gc = s(p.gclid, 300);
  const tt = s(p.ttclid, 300);
  return {
    at,
    source: g("utm_source"),
    medium: g("utm_medium"),
    campaign,
    content,
    term,
    // Meta preenche {{campaign.id}} / {{adset.id}} / {{ad.id}} quando o anunciante usa os parâmetros dinâmicos
    campaignId: digits(p.campaign_id) || digits(p.utm_id) || digits(campaign),
    adsetId: digits(p.adset_id) || digits(term),
    adId: digits(p.ad_id) || digits(content),
    clickId: fb || gc || tt,
    clickType: fb ? "fbclid" : gc ? "gclid" : tt ? "ttclid" : "",
    referrer: s(p.referrer ?? p.ref, 200),
    landing: s(p.landing, 300),
  };
}
export const touchHasData = (t: TouchSnapT | null | undefined) => Boolean(t && (t.source || t.campaign || t.campaignId || t.adId || t.clickId));

// ---------- webhooks de venda ----------

export type SaleKind = "approved" | "refunded" | "chargeback" | "abandoned" | "pending" | "canceled" | "other";

export interface ParsedSale {
  externalId: string;
  kind: SaleKind;
  providerEvent: string;
  value: number;
  currency: string;
  product: string;
  productId: string;
  buyer: { email: string; phone: string; name: string };
  src: string;
  params: Record<string, string>;
  at: Date;
}

/**
 * HOTMART (webhook versão 2.0.0). A página oficial (developers.hotmart.com) respondeu 403 em 19/10/2026;
 * formato e nomes conferidos em guias de integração públicos (Webforce, Nemu, RedTrack) e no que a Hotmart
 * mostra no envio de teste: autenticação pelo "hottok" (cabeçalho X-HOTMART-HOTTOK; na versão antiga vinha no corpo),
 * corpo { id, event, creation_date, data: { product, buyer, purchase: { transaction, status, price, origin: { src, sck, xcod } } } }.
 * ⚠ Conferir com o "Enviar teste" do painel da Hotmart antes de ligar.
 */
const HOTMART_KIND: Record<string, SaleKind> = {
  PURCHASE_APPROVED: "approved", PURCHASE_COMPLETE: "approved", PURCHASE_REFUNDED: "refunded", PURCHASE_CHARGEBACK: "chargeback",
  PURCHASE_PROTEST: "chargeback", PURCHASE_CANCELED: "canceled", PURCHASE_EXPIRED: "canceled", PURCHASE_DELAYED: "pending",
  PURCHASE_BILLET_PRINTED: "pending", PURCHASE_OUT_OF_SHOPPING_CART: "abandoned",
};

export function parseHotmart(body: any): ParsedSale | null {
  if (!body || typeof body !== "object") return null;
  const ev = s(body.event, 60).toUpperCase();
  const d = body.data || {};
  const pur = d.purchase || {};
  const kind = HOTMART_KIND[ev] || "other";
  // abandono não tem transação: usa o id do evento
  const externalId = s(pur.transaction, 80) || (kind === "abandoned" ? `abandono:${s(body.id, 80)}` : "");
  if (!externalId) return null;
  const origin = pur.origin || {};
  const buyer = d.buyer || {};
  const params: Record<string, string> = {};
  for (const k of ["src", "sck", "xcod"]) if (origin[k]) params[k] = s(origin[k], 200);
  // a Hotmart guarda a origem em src/sck; quem usa utm no link costuma mandar "utm_source=...|utm_campaign=..." no sck
  for (const part of String(origin.sck || "").split(/[|&]/)) {
    const [k, v] = part.split("=");
    if (k && v && /^utm_|^(campaign|adset|ad)_id$/.test(k)) params[k] = s(decodeURIComponent(v), 160);
  }
  const value = Number(pur.price?.value ?? pur.full_price?.value ?? 0);
  const at = Number(body.creation_date ?? pur.approved_date ?? 0);
  return {
    externalId,
    kind,
    providerEvent: ev,
    value: Number.isFinite(value) ? Math.round(value * 100) / 100 : 0,
    currency: s(pur.price?.currency_value || "BRL", 5) || "BRL",
    product: s(d.product?.name, 160),
    productId: s(d.product?.id ?? d.product?.ucode, 60),
    buyer: { email: s(buyer.email, 254), phone: s(buyer.checkout_phone ?? buyer.phone, 40), name: s(buyer.name, 120) },
    src: s(origin.src, 200),
    params,
    at: at > 0 ? new Date(at < 1e12 ? at * 1000 : at) : new Date(),
  };
}

/**
 * KIWIFY. Gatilhos oficiais (docs.kiwify.com.br/api-reference/webhooks/create, lido 19/10/2026): compra_aprovada,
 * compra_reembolsada, chargeback, carrinho_abandonado, compra_recusada, boleto_gerado, pix_gerado, subscription_*.
 * A doc oficial NÃO descreve o corpo nem a assinatura: usamos o formato público conhecido
 * (order_id, order_status, webhook_event_type, Customer, Product, Commissions.charge_amount em centavos,
 * TrackingParameters { src, sck, utm_* }) e a assinatura `?signature=` = HMAC-SHA1 (hex) do corpo cru com o token.
 * ⚠ Conferir com o envio de teste da Kiwify antes de ligar.
 */
const KIWIFY_KIND: Record<string, SaleKind> = {
  paid: "approved", approved: "approved", order_approved: "approved", compra_aprovada: "approved",
  refunded: "refunded", order_refunded: "refunded", compra_reembolsada: "refunded",
  chargedback: "chargeback", chargeback: "chargeback",
  abandoned: "abandoned", carrinho_abandonado: "abandoned",
  waiting_payment: "pending", boleto_gerado: "pending", pix_gerado: "pending", billet_created: "pending", pix_created: "pending",
  refused: "canceled", compra_recusada: "canceled",
};

export function parseKiwify(body: any): ParsedSale | null {
  if (!body || typeof body !== "object") return null;
  const evt = s(body.webhook_event_type || body.order_status || body.status, 60).toLowerCase();
  const kind = KIWIFY_KIND[evt] || KIWIFY_KIND[s(body.order_status, 40).toLowerCase()] || "other";
  const externalId = s(body.order_id ?? body.id, 80);
  if (!externalId) return null;
  const c = body.Customer || body.customer || {};
  const tp = body.TrackingParameters || body.tracking_parameters || {};
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(tp)) if (v) params[k] = s(v, 200);
  const cents = Number(body.Commissions?.charge_amount ?? body.charge_amount ?? 0);
  const at = Date.parse(String(body.approved_date || body.updated_at || body.created_at || ""));
  return {
    externalId,
    kind,
    providerEvent: evt,
    value: Number.isFinite(cents) ? Math.round(cents) / 100 : 0,
    currency: s(body.Commissions?.currency || body.currency || "BRL", 5) || "BRL",
    product: s(body.Product?.product_name ?? body.product_name, 160),
    productId: s(body.Product?.product_id ?? body.product_id, 60),
    buyer: { email: s(c.email, 254), phone: s(c.mobile ?? c.phone, 40), name: s(c.full_name ?? c.name, 120) },
    src: s(tp.src, 200),
    params,
    at: Number.isFinite(at) ? new Date(at) : new Date(),
  };
}

export function checkHottok(header: string | null, bodyHottok: unknown, secret: string): boolean {
  const got = String(header || bodyHottok || "");
  if (!secret || !got) return false;
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export function checkKiwifySignature(raw: string | Buffer, signature: string | null, secret: string): boolean {
  if (!secret || !signature || !/^[0-9a-f]{40}$/i.test(signature)) return false;
  const expected = createHmac("sha1", secret).update(raw).digest();
  const got = Buffer.from(signature.toLowerCase(), "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Domínios de checkout que recebem src/sck/utm no link (padrão; o site pode acrescentar). */
export const DEFAULT_CHECKOUT_DOMAINS = ["pay.hotmart.com", "hotmart.com", "pay.kiwify.com.br", "kiwify.app", "kiwify.com.br", "sun.eduzz.com", "chk.eduzz.com", "eduzz.com", "app.monetizze.com.br", "monetizze.com.br", "pay.lastlink.com", "lastlink.com", "checkout.perfectpay.com.br", "pay.greenn.com.br", "ticto.app"];
