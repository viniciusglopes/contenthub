import type { Types } from "mongoose";
import { FriendlyError } from "@/lib/errors";
import { addDays, dayStartMs } from "@/lib/instagram/dates";
import { type Period, periodFromParams } from "@/lib/instagram/period";
import { AdAccount, AdInsightDaily, AdObject } from "@/models/Ads";
import { Contact } from "@/models/Automation";
import { Pipeline } from "@/models/Crm";
import { InstagramMedia } from "@/models/InstagramMedia";
import { Automation } from "@/models/Automation";
import { Sale } from "@/models/Tracking";
import { SOURCE_PT, toCsv } from "./pure";

/* eslint-disable @typescript-eslint/no-explicit-any */

// RELATÓRIO DE LEADS E VENDAS por campanha, conjunto, anúncio, post ou origem, no período escolhido.
// Coorte: leads que ENTRARAM no período; "vendas" = desses, os que estão numa etapa de ganho.
// Custo (gasto do Tráfego no mesmo período) só aparece quando o id da campanha/conjunto/anúncio do
// lead é o mesmo id do gasto. Por post e por UTM com NOME de campanha o custo é ESTIMATIVA (rotulado).

type Org = Types.ObjectId;
export const GROUPS = ["campanha", "conjunto", "anuncio", "post", "automacao", "origem"] as const;
export type Group = (typeof GROUPS)[number];

export interface ReportRow {
  key: string;
  label: string;
  leads: number;
  won: number;
  wonValue: number;
  spend: number | null;
  metaLeads: number | null;
  costPerLead: number | null;
  costPerSale: number | null;
  /** vendas pagas (webhook Hotmart/Kiwify) no período, receita, reembolsos+chargebacks */
  sales: number;
  revenue: number;
  refunds: number;
  cpa: number | null;
  roas: number | null;
  /** "real" = mesmo id; "estimativa" = ligação indireta; "" = sem custo */
  basis: "real" | "estimativa" | "";
  note: string;
}

const TOUCH_FIELD: Record<Group, string> = { campanha: "campaignId", conjunto: "adsetId", anuncio: "adId", post: "postIgId", automacao: "automation", origem: "kind" };
const LEVEL: Partial<Record<Group, "campaign" | "adset" | "ad">> = { campanha: "campaign", conjunto: "adset", anuncio: "ad" };
const INSIGHT_FIELD: Partial<Record<Group, string>> = { campanha: "campaignId", conjunto: "adsetId", anuncio: "adId" };

export async function buildReport(org: Org, p: URLSearchParams, now = Date.now()) {
  const period: Period = periodFromParams(p, now);
  const group = (p.get("agrupar") || "campanha") as Group;
  if (!GROUPS.includes(group)) throw new FriendlyError("Agrupamento inválido.", 400, "agrupar");
  const touch = p.get("toque") === "ultimo" ? "lastTouch" : "firstTouch";
  const fromD = new Date(dayStartMs(period.from));
  const toD = new Date(dayStartMs(addDays(period.to, 1)));

  const [leads, pipes, accounts]: [any[], any[], any[]] = await Promise.all([
    Contact.find({ organization: org, lead: true, leadAt: { $gte: fromD, $lt: toD } }).select("firstTouch lastTouch origin utm stage pipeline value wonAt").lean(),
    Pipeline.find({ organization: org }).select("stages").lean(),
    AdAccount.find({ organization: org }).select("currency").lean(),
  ]);
  const wonStage = new Set<string>();
  for (const pp of pipes) for (const s of pp.stages || []) if (s.kind === "won") wonStage.add(`${pp._id}:${s.key}`);

  // gasto do período, por id (todas as contas de anúncio da organização)
  const spendBy = new Map<string, { spend: number; leads: number }>();
  const field = INSIGHT_FIELD[group];
  const objects: any[] = await AdObject.find({ organization: org }).select("level metaId name campaignId adsetId igMediaId").lean();
  const names = new Map<string, string>();
  for (const o of objects) names.set(`${o.level}:${o.metaId}`, o.name || o.metaId);
  const campaignByName = new Map<string, string>();
  for (const o of objects) if (o.level === "campaign" && o.name) campaignByName.set(o.name.trim().toLowerCase(), o.metaId);
  const dayFrom = period.from;
  const dayTo = period.to;
  if (field || group === "post") {
    const rows: any[] = await AdInsightDaily.aggregate([
      { $match: { organization: org, date: { $gte: dayFrom, $lte: dayTo } } },
      { $group: { _id: `$${group === "post" ? "adId" : field}`, spend: { $sum: "$spend" }, leads: { $sum: "$leads" } } },
    ]);
    if (group === "post") {
      // anúncio feito a partir de um post: soma o gasto desses anúncios no post (estimativa)
      const postOf = new Map(objects.filter((o) => o.level === "ad" && o.igMediaId).map((o) => [o.metaId, o.igMediaId]));
      for (const r of rows) {
        const post = postOf.get(r._id);
        if (!post) continue;
        const b = spendBy.get(post) || { spend: 0, leads: 0 };
        b.spend += r.spend;
        b.leads += r.leads;
        spendBy.set(post, b);
      }
    } else for (const r of rows) if (r._id) spendBy.set(String(r._id), { spend: r.spend, leads: r.leads });
  }

  type Bucket = { leads: number; won: number; wonValue: number; estimate: boolean; sales: number; revenue: number; refunds: number };
  const agg = new Map<string, Bucket>();
  const bucket = (k: string) => {
    let b = agg.get(k);
    if (!b) agg.set(k, (b = { leads: 0, won: 0, wonValue: 0, estimate: false, sales: 0, revenue: 0, refunds: 0 }));
    return b;
  };
  const keyOf = (t: any, origin: any, utm: any): { key: string; estimate: boolean } => {
    let key = String(t?.[TOUCH_FIELD[group]] || (group === "origem" ? origin?.kind || "" : group === "automacao" ? origin?.automation || "" : "") || "");
    let estimate = false;
    if (!key && group === "campanha") {
      const u = String(t?.utm?.campaign || utm?.campaign || "").trim();
      if (/^\d{5,30}$/.test(u)) key = u;
      else if (u && campaignByName.has(u.toLowerCase())) { key = campaignByName.get(u.toLowerCase())!; estimate = true; }
      else if (u) key = `utm:${u}`;
    }
    return { key, estimate };
  };
  for (const l of leads) {
    const t = l[touch] || l.firstTouch || {};
    const { key, estimate } = keyOf(t, l.origin, l.utm);
    const b = bucket(key);
    b.leads++;
    if (wonStage.has(`${l.pipeline}:${l.stage}`)) { b.won++; b.wonValue += l.value || 0; }
    b.estimate ||= estimate;
  }
  // vendas pagas do período (webhook): atribuídas pelo toque do lead; sem lead, pelos parâmetros da própria venda
  const sales: any[] = await Sale.find({ organization: org, at: { $gte: fromD, $lt: toD }, kind: { $in: ["approved", "refunded", "chargeback"] } }).select("kind value contact touch").lean();
  const saleContacts: any[] = sales.some((x) => x.contact) ? await Contact.find({ organization: org, _id: { $in: sales.map((x) => x.contact).filter(Boolean) } }).select("firstTouch lastTouch origin utm").lean() : [];
  const byId = new Map(saleContacts.map((c) => [String(c._id), c]));
  for (const sale of sales) {
    const c = sale.contact ? byId.get(String(sale.contact)) : null;
    const t = c ? c[touch] || c.firstTouch || {} : sale.touch ? { campaignId: sale.touch.campaignId, adsetId: sale.touch.adsetId, adId: sale.touch.adId, kind: "sale", utm: { campaign: sale.touch.campaign } } : {};
    const { key, estimate } = keyOf(t, c?.origin || { kind: "sale" }, c?.utm || {});
    const b = bucket(key);
    if (sale.kind === "approved") { b.sales++; b.revenue += sale.value || 0; }
    else b.refunds += sale.value || 0;
    b.estimate ||= estimate;
  }
  // campanha/anúncio com gasto e nenhum lead também aparece (gastou e não trouxe ninguém)
  for (const k of spendBy.keys()) if (!agg.has(k)) bucket(k);

  const postNames = new Map<string, string>();
  if (group === "post") {
    const media: any[] = await InstagramMedia.find({ organization: org, igId: { $in: [...agg.keys()].filter(Boolean) } }).select("igId caption").lean();
    for (const m of media) postNames.set(m.igId, String(m.caption || "").split("\n")[0].slice(0, 70) || "(sem legenda)");
  }
  const autoNames = new Map<string, string>();
  if (group === "automacao") {
    const ids = [...agg.keys()].filter((k) => /^[0-9a-f]{24}$/.test(k));
    for (const a of (await Automation.find({ organization: org, _id: { $in: ids } }).select("name").lean()) as any[]) autoNames.set(String(a._id), a.name);
  }
  const labelOf = (k: string) => {
    if (group === "automacao") return k ? autoNames.get(k) || "(automação apagada)" : "(sem automação)";
    if (!k) return group === "origem" ? "(sem origem)" : group === "post" ? "(sem post)" : "(sem campanha/anúncio ligado)";
    if (group === "origem") return SOURCE_PT[k] || k;
    if (group === "post") return postNames.get(k) || `Post ${k}`;
    if (k.startsWith("utm:")) return `utm_campaign: ${k.slice(4)}`;
    return names.get(`${LEVEL[group]}:${k}`) || k;
  };

  const rows: ReportRow[] = [...agg.entries()].map(([key, b]) => {
    const s = spendBy.get(key);
    const has = Boolean(s && key && !key.startsWith("utm:"));
    const basis: ReportRow["basis"] = has ? (group === "post" || b.estimate ? "estimativa" : "real") : "";
    const spend = has ? Math.round(s!.spend * 100) / 100 : null;
    return {
      key, label: labelOf(key), leads: b.leads, won: b.won, wonValue: Math.round(b.wonValue * 100) / 100, spend,
      metaLeads: has ? s!.leads : null,
      costPerLead: has && b.leads ? Math.round((spend! / b.leads) * 100) / 100 : null,
      costPerSale: has && b.won ? Math.round((spend! / b.won) * 100) / 100 : null,
      sales: b.sales,
      revenue: Math.round(b.revenue * 100) / 100,
      refunds: Math.round(b.refunds * 100) / 100,
      cpa: has && b.sales ? Math.round((spend! / b.sales) * 100) / 100 : null,
      roas: has && spend ? Math.round(((b.revenue - b.refunds) / spend!) * 100) / 100 : null,
      basis,
      note: !key ? "" : key.startsWith("utm:") ? "UTM com nome que não bate com nenhuma campanha sincronizada: sem custo." : basis === "estimativa" ? (group === "post" ? "Gasto dos anúncios feitos a partir deste post." : "Ligado pelo nome da campanha na UTM.") : group !== "origem" && group !== "automacao" && !has ? "Sem gasto no período para este id." : "",
    };
  }).sort((a, b) => b.leads - a.leads || b.revenue - a.revenue || (b.spend ?? 0) - (a.spend ?? 0));

  const totalSpend: number = field || group === "post"
    ? (await AdInsightDaily.aggregate([{ $match: { organization: org, date: { $gte: dayFrom, $lte: dayTo } } }, { $group: { _id: null, s: { $sum: "$spend" } } }]))[0]?.s ?? 0
    : 0;
  const currencies = [...new Set(accounts.map((a) => a.currency).filter(Boolean))];
  const totals = rows.reduce((t, r) => ({ leads: t.leads + r.leads, won: t.won + r.won, wonValue: t.wonValue + r.wonValue, matchedSpend: t.matchedSpend + (r.spend ?? 0), matchedLeads: t.matchedLeads + (r.spend != null ? r.leads : 0), sales: t.sales + r.sales, revenue: t.revenue + r.revenue, refunds: t.refunds + r.refunds, matchedRevenue: t.matchedRevenue + (r.spend != null ? r.revenue - r.refunds : 0), matchedSales: t.matchedSales + (r.spend != null ? r.sales : 0) }), { leads: 0, won: 0, wonValue: 0, matchedSpend: 0, matchedLeads: 0, sales: 0, revenue: 0, refunds: 0, matchedRevenue: 0, matchedSales: 0 });
  return {
    period, group, touch: touch === "lastTouch" ? "ultimo" : "primeiro", rows,
    totals: { ...totals, totalSpend: Math.round(totalSpend * 100) / 100, matchedSpend: Math.round(totals.matchedSpend * 100) / 100 },
    currency: currencies.length === 1 ? currencies[0] : currencies.length ? "mista" : "",
    notes: [
      "Leads = quem entrou no CRM no período. Ganhos = desses, quem está numa etapa de ganho. Vendas pagas, receita e reembolsos vêm dos webhooks (Hotmart/Kiwify) com data no período.",
      "ROAS = (receita - reembolsos) / gasto, só nas linhas em que o id bate.",
      "Custo só aparece quando o id da campanha, conjunto ou anúncio do lead é o mesmo do gasto no Tráfego (mesmo período).",
      currencies.length > 1 ? "Há contas de anúncio em moedas diferentes: os gastos foram somados sem conversão." : "",
    ].filter(Boolean),
  };
}

export function reportCsv(r: Awaited<ReturnType<typeof buildReport>>): string {
  return toCsv(
    ["grupo", "id", "nome", "leads", "ganhos_no_funil", "valor_ganhos", "vendas_pagas", "receita", "reembolsos", "gasto", "leads_informados_pela_meta", "custo_por_lead", "custo_por_ganho", "cpa", "roas", "base_do_custo", "observacao"],
    r.rows.map((x) => [r.group, x.key, x.label, x.leads, x.won, x.wonValue, x.sales, x.revenue, x.refunds, x.spend ?? "", x.metaLeads ?? "", x.costPerLead ?? "", x.costPerSale ?? "", x.cpa ?? "", x.roas ?? "", x.basis, x.note])
  );
}
