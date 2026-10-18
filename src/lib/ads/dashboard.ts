/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Types } from "mongoose";
import { addDays, dayKey, dayStartMs } from "@/lib/instagram/dates";
import type { Period } from "@/lib/instagram/period";
import { pctChange } from "@/lib/instagram/stats";
import { AdInsightDaily, AdObject } from "@/models/Ads";
import { InstagramMedia } from "@/models/InstagramMedia";
import { type DayRow, STATUS_PT, type Totals, groupBy, pickCandidates, sumRows } from "./metrics";
import { adsWriteState } from "./write";

type Org = Types.ObjectId;

const COMPARE_KEYS = ["spend", "impressions", "clicks", "purchases", "leads", "cpm", "cpc", "ctr", "costPerPurchase", "costPerLead"] as const;

export interface ObjectRow {
  id: string;
  name: string;
  level: "campaign" | "adset" | "ad";
  status: string;
  statusText: string;
  active: boolean;
  objective: string;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  thumbnailUrl: string;
  igMediaId: string;
  igPermalink: string;
  totals: Totals;
}

const rowsIn = async (org: Org, acc: Types.ObjectId, from: string, to: string): Promise<DayRow[]> =>
  (await AdInsightDaily.find({ organization: org, adAccount: acc, date: { $gte: from, $lte: to } }).lean()) as any;

/** Posts orgânicos do projeto que mais prenderam quem viu: candidatos a virar anúncio. */
export async function organicCandidates(org: Org, project: Types.ObjectId, period: Period, adIgIds: Map<string, number>) {
  const fromMs = dayStartMs(period.from);
  const toMs = dayStartMs(addDays(period.to, 1));
  let media: any[] = await InstagramMedia.find({ organization: org, project, timestamp: { $gte: new Date(fromMs), $lt: new Date(toMs) }, kind: { $ne: "story" } }).lean();
  let widened = false;
  if (media.length < 3) {
    // poucos posts no período: olha os últimos 90 dias para ter com o que comparar
    media = await InstagramMedia.find({ organization: org, project, timestamp: { $gte: new Date(Date.now() - 90 * 86_400_000) }, kind: { $ne: "story" } }).lean();
    widened = true;
  }
  const flat = media.map((m) => ({ igId: m.igId, kind: m.kind, caption: m.caption || "", permalink: m.permalink || "", timestamp: m.timestamp, thumbnailUrl: m.thumbnailUrl || "", reach: m.metrics?.reach, saved: m.metrics?.saved, shares: m.metrics?.shares, comments: m.metrics?.comments, likes: m.metrics?.likes, views: m.metrics?.views }));
  return {
    widened,
    posts: flat.length,
    items: pickCandidates(flat, 6).map((m) => ({ ...m, inAds: adIgIds.has(m.igId), adSpend: adIgIds.get(m.igId) ?? 0 })),
  };
}

export async function buildAdsDashboard(org: Org, acc: any, period: Period, now = Date.now()) {
  const [cur, prev, objects]: [DayRow[], DayRow[], any[]] = await Promise.all([
    rowsIn(org, acc._id, period.from, period.to),
    rowsIn(org, acc._id, period.prevFrom, period.prevTo),
    AdObject.find({ organization: org, adAccount: acc._id }).lean(),
  ]);
  const totals = sumRows(cur);
  const prevTotals = sumRows(prev);
  // Só compara quando os dados chegam até o começo do período anterior (senão "sem comparação").
  const canCompare = Boolean(acc.insightsSince) && acc.insightsSince <= period.prevFrom;
  const compare = Object.fromEntries(COMPARE_KEYS.map((k) => [k, canCompare ? pctChange(totals[k] as number | null, prevTotals[k] as number | null) : null]));

  const exactReach = acc.reachByRange?.[`${period.from}_${period.to}`];
  const reach = exactReach && exactReach.reach != null ? { value: exactReach.reach, exact: true, at: exactReach.at } : { value: totals.reachDaily, exact: false, at: null };

  const byDay = new Map<string, { spend: number; purchases: number; leads: number; clicks: number }>();
  for (let d = period.from; d <= period.to; d = addDays(d, 1)) byDay.set(d, { spend: 0, purchases: 0, leads: 0, clicks: 0 });
  for (const r of cur) {
    const b = byDay.get(r.date);
    if (!b) continue;
    b.spend += r.spend;
    b.purchases += r.purchases;
    b.leads += r.leads;
    b.clicks += r.clicks;
  }

  const name = new Map(objects.map((o) => [`${o.level}:${o.metaId}`, o.name]));
  const groups = { campaign: groupBy(cur, "campaignId"), adset: groupBy(cur, "adsetId"), ad: groupBy(cur, "adId") };
  const keyOf = { campaign: "campaignId", adset: "adsetId", ad: "adId" } as const;
  const rows: Record<"campaign" | "adset" | "ad", ObjectRow[]> = { campaign: [], adset: [], ad: [] };
  const seen = new Set<string>();
  for (const o of objects) {
    const lvl = o.level as "campaign" | "adset" | "ad";
    const t = groups[lvl].get(o.metaId);
    const status = o.effectiveStatus || o.status || "";
    const active = status === "ACTIVE";
    if (!t && !active) continue; // sem gasto no período e parado: fora da lista
    seen.add(`${lvl}:${o.metaId}`);
    rows[lvl].push({
      id: o.metaId, name: o.name || o.metaId, level: lvl, status, statusText: STATUS_PT[status] || status || "–", active, objective: o.objective || "",
      campaignId: o.campaignId || (lvl === "campaign" ? o.metaId : ""), campaignName: name.get(`campaign:${o.campaignId}`) || "",
      adsetId: o.adsetId || (lvl === "adset" ? o.metaId : ""), adsetName: name.get(`adset:${o.adsetId}`) || "",
      dailyBudget: o.dailyBudget ?? null, lifetimeBudget: o.lifetimeBudget ?? null, thumbnailUrl: o.thumbnailUrl || "", igMediaId: o.igMediaId || "", igPermalink: o.igPermalink || "",
      totals: t || sumRows([]),
    });
  }
  // número de algo que não está mais na lista da Meta (excluído): aparece com o id
  for (const lvl of ["campaign", "adset", "ad"] as const)
    for (const [id, t] of groups[lvl])
      if (!seen.has(`${lvl}:${id}`)) {
        const sample = cur.find((r) => r[keyOf[lvl]] === id);
        rows[lvl].push({ id, name: `(removido da Meta) ${id}`, level: lvl, status: "DELETED", statusText: STATUS_PT.DELETED, active: false, objective: "", campaignId: sample?.campaignId || "", campaignName: name.get(`campaign:${sample?.campaignId}`) || "", adsetId: sample?.adsetId || "", adsetName: name.get(`adset:${sample?.adsetId}`) || "", dailyBudget: null, lifetimeBudget: null, thumbnailUrl: "", igMediaId: "", igPermalink: "", totals: t });
      }
  for (const lvl of ["campaign", "adset", "ad"] as const) rows[lvl].sort((a, b) => b.totals.spend - a.totals.spend);

  const adIgIds = new Map<string, number>();
  for (const r of rows.ad) if (r.igMediaId) adIgIds.set(r.igMediaId, (adIgIds.get(r.igMediaId) || 0) + r.totals.spend);

  return {
    today: dayKey(now),
    totals,
    prevTotals: canCompare ? prevTotals : null,
    compare,
    canCompare,
    reach,
    series: [...byDay.entries()].map(([date, v]) => ({ date, spend: Math.round(v.spend * 100) / 100, purchases: v.purchases, leads: v.leads, clicks: v.clicks })),
    rows,
    coverage: { since: acc.insightsSince || null, lastSync: acc.lastSync || null, partial: Boolean(acc.insightsSince) && acc.insightsSince > period.from },
    candidates: await organicCandidates(org, acc.project, period, adIgIds),
    write: await adsWriteState(org),
  };
}
