import type { RawInsightRow } from "./client";

// Contas puras do Tráfego (servem ao servidor e aos testes).

export interface DayRow {
  date: string;
  adId: string;
  adsetId: string;
  campaignId: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  purchases: number;
  purchaseValue: number;
  leads: number;
}

// A Meta devolve o mesmo evento em vários tipos que se sobrepõem (omni_purchase = soma de
// purchase do site, do app e offline). Pega UM, pela ordem, para não contar em dobro.
export const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase"];
export const LEAD_TYPES = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];

export function pickAction(list: { action_type: string; value: string }[] | undefined, types: string[]): number {
  if (!list?.length) return 0;
  for (const t of types) {
    const hit = list.find((a) => a.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);

export function parseInsightRow(r: RawInsightRow): DayRow | null {
  if (!r.ad_id || !r.date_start) return null;
  return {
    date: r.date_start,
    adId: r.ad_id,
    adsetId: r.adset_id || "",
    campaignId: r.campaign_id || "",
    spend: num(r.spend),
    impressions: num(r.impressions),
    reach: num(r.reach),
    clicks: num(r.clicks),
    linkClicks: num(r.inline_link_clicks),
    purchases: pickAction(r.actions, PURCHASE_TYPES),
    purchaseValue: pickAction(r.action_values, PURCHASE_TYPES),
    leads: pickAction(r.actions, LEAD_TYPES),
  };
}

export interface Totals {
  spend: number;
  impressions: number;
  /** soma do alcance diário (a mesma pessoa pode contar mais de uma vez) */
  reachDaily: number;
  clicks: number;
  linkClicks: number;
  purchases: number;
  purchaseValue: number;
  leads: number;
  /** derivados das somas (não média de médias) */
  cpm: number | null;
  cpc: number | null;
  ctr: number | null;
  costPerPurchase: number | null;
  costPerLead: number | null;
  roas: number | null;
}

export function emptyTotals(): Totals {
  return { spend: 0, impressions: 0, reachDaily: 0, clicks: 0, linkClicks: 0, purchases: 0, purchaseValue: 0, leads: 0, cpm: null, cpc: null, ctr: null, costPerPurchase: null, costPerLead: null, roas: null };
}

export function finish(t: Totals): Totals {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  t.spend = r2(t.spend);
  t.purchaseValue = r2(t.purchaseValue);
  t.cpm = t.impressions > 0 ? r2((t.spend / t.impressions) * 1000) : null;
  t.cpc = t.clicks > 0 ? r2(t.spend / t.clicks) : null;
  t.ctr = t.impressions > 0 ? Math.round((t.clicks / t.impressions) * 10000) / 100 : null;
  t.costPerPurchase = t.purchases > 0 ? r2(t.spend / t.purchases) : null;
  t.costPerLead = t.leads > 0 ? r2(t.spend / t.leads) : null;
  t.roas = t.spend > 0 && t.purchaseValue > 0 ? Math.round((t.purchaseValue / t.spend) * 100) / 100 : null;
  return t;
}

export function addRow(t: Totals, r: Pick<DayRow, "spend" | "impressions" | "reach" | "clicks" | "linkClicks" | "purchases" | "purchaseValue" | "leads">): Totals {
  t.spend += r.spend || 0;
  t.impressions += r.impressions || 0;
  t.reachDaily += r.reach || 0;
  t.clicks += r.clicks || 0;
  t.linkClicks += r.linkClicks || 0;
  t.purchases += r.purchases || 0;
  t.purchaseValue += r.purchaseValue || 0;
  t.leads += r.leads || 0;
  return t;
}

export function sumRows(rows: Parameters<typeof addRow>[1][]): Totals {
  return finish(rows.reduce((t, r) => addRow(t, r), emptyTotals()));
}

/** Agrupa as linhas diárias por campanha, conjunto ou anúncio. */
export function groupBy(rows: DayRow[], key: "campaignId" | "adsetId" | "adId"): Map<string, Totals> {
  const out = new Map<string, Totals>();
  for (const r of rows) {
    const id = r[key];
    if (!id) continue;
    out.set(id, addRow(out.get(id) || emptyTotals(), r));
  }
  for (const t of out.values()) finish(t);
  return out;
}

export const STATUS_PT: Record<string, string> = {
  ACTIVE: "Ativo",
  PAUSED: "Pausado",
  CAMPAIGN_PAUSED: "Campanha pausada",
  ADSET_PAUSED: "Conjunto pausado",
  DELETED: "Excluído",
  ARCHIVED: "Arquivado",
  IN_PROCESS: "Em processamento",
  WITH_ISSUES: "Com problema",
  DISAPPROVED: "Reprovado",
  PENDING_REVIEW: "Em análise",
  PREAPPROVED: "Pré-aprovado",
  PENDING_BILLING_INFO: "Falta pagamento",
};

export const ACCOUNT_STATUS_PT: Record<number, string> = {
  1: "Ativa",
  2: "Desativada",
  3: "Pagamento pendente",
  7: "Em análise de risco",
  8: "Pagamento em acerto",
  9: "Em período de carência",
  100: "Fechamento pendente",
  101: "Fechada",
};

// CANDIDATOS A ANÚNCIO: posts orgânicos que mais prenderam quem viu (salvou, compartilhou,
// comentou) em relação ao alcance. Exige um alcance mínimo para não premiar post visto por 10 pessoas.
export interface OrganicLike {
  igId: string;
  reach?: number;
  saved?: number;
  shares?: number;
  comments?: number;
  likes?: number;
}
export function candidateScore(m: OrganicLike): number {
  const reach = m.reach || 0;
  if (reach <= 0) return 0;
  const strong = (m.saved || 0) * 3 + (m.shares || 0) * 3 + (m.comments || 0) * 2 + (m.likes || 0);
  return strong / reach;
}
export function pickCandidates<T extends OrganicLike>(media: T[], n = 6): (T & { score: number })[] {
  const reaches = media.map((m) => m.reach || 0).filter((r) => r > 0).sort((a, b) => a - b);
  if (!reaches.length) return [];
  const median = reaches[Math.floor(reaches.length / 2)];
  const minReach = Math.max(50, Math.round(median * 0.5));
  return media
    .filter((m) => (m.reach || 0) >= minReach)
    .map((m) => ({ ...m, score: Math.round(candidateScore(m) * 10000) / 100 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}
