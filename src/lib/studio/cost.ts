import type { Types } from "mongoose";
import { nowMs } from "@/lib/clock";
import { FriendlyError } from "@/lib/errors";
import AiUsage from "@/models/AiUsage";
import Organization from "@/models/Organization";
import { FxRate, PlatformSettings, STUDIO_DEFAULTS } from "@/models/Platform";
import StudioJob from "@/models/StudioJob";
import { studioFetch } from "./providers";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Org = Types.ObjectId;

// CUSTO E TETO. Cada chamada a provedor grava uma linha de uso com o custo ESTIMADO em dólar
// (tabela do catálogo) e em real (PTAX de venda do dia, guardada na própria linha).
// O teto mensal por organização bloqueia novas gerações; só o administrador altera.

const BRT = -3 * 3_600_000;
export const dayKeyBR = (ms: number) => new Date(ms + BRT).toISOString().slice(0, 10);
/** Primeiro instante do mês corrente no horário de Brasília. */
export function monthStart(ms: number = nowMs()): Date {
  const d = new Date(ms + BRT);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - BRT);
}

export interface Fx { rate: number; date: string; source: string }
const FX_FALLBACK = 5.5;
/** Dólar do dia: PTAX de venda do Banco Central (API pública e gratuita), guardada por dia. */
export async function usdBrl(now: number = nowMs()): Promise<Fx> {
  const today = dayKeyBR(now);
  const have: any = await FxRate.findOne({ date: today }).lean();
  if (have) return { rate: have.rate, date: have.date, source: have.source };
  try {
    const fmt = (ms: number) => { const [y, m, d] = dayKeyBR(ms).split("-"); return `${m}-${d}-${y}`; };
    const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@a,dataFinalCotacao=@b)?@a='${fmt(now - 7 * 86_400_000)}'&@b='${fmt(now)}'&$format=json&$orderby=dataHoraCotacao%20desc&$top=1`;
    const res = await studioFetch(url, { signal: AbortSignal.timeout(6000) });
    const row = ((await res.json()) as any)?.value?.[0];
    const rate = Number(row?.cotacaoVenda);
    if (res.ok && rate > 1 && rate < 20) {
      const source = `PTAX venda de ${String(row.dataHoraCotacao).slice(0, 10)} (Banco Central)`;
      await FxRate.updateOne({ date: today }, { $set: { rate, source, fetchedAt: new Date(now) } }, { upsert: true });
      return { rate, date: today, source };
    }
  } catch { /* sem rede: usa a última cotação guardada */ }
  const last: any = await FxRate.findOne({}).sort({ date: -1 }).lean();
  if (last) return { rate: last.rate, date: last.date, source: `${last.source} (última disponível)` };
  const env = Number(process.env.USD_BRL_FALLBACK);
  return { rate: env > 1 ? env : FX_FALLBACK, date: today, source: "cotação de reserva (o Banco Central não respondeu)" };
}

export async function settings(): Promise<typeof STUDIO_DEFAULTS & { chains: Record<string, string[]> }> {
  const s: any = await PlatformSettings.findOne({ key: "main" }).lean();
  return { ...STUDIO_DEFAULTS, ...Object.fromEntries(Object.keys(STUDIO_DEFAULTS).filter((k) => typeof s?.[k] === "number").map((k) => [k, s[k]])), chains: s?.chains || {} } as any;
}

export interface UsageInput { purpose: string; service: string; model?: string; what?: string; units?: number; unit?: string; costUsd?: number; ok?: boolean; error?: string; ms?: number; house?: boolean; job?: unknown; project?: unknown; by?: string }
export async function recordUsage(org: Org, u: UsageInput, now: number = nowMs()): Promise<void> {
  const fx = await usdBrl(now);
  const costUsd = Math.max(0, u.costUsd || 0);
  await AiUsage.create({ organization: org, at: new Date(now), purpose: u.purpose, service: u.service, model: u.model || "", what: u.what || "", units: u.units || 0, unit: u.unit || "", costUsd, costBrl: costUsd * fx.rate, fxRate: fx.rate, fxDate: fx.date, fxSource: fx.source, ok: u.ok !== false, error: (u.error || "").slice(0, 200), ms: u.ms || 0, house: Boolean(u.house), job: u.job || null, project: u.project || null, by: u.by || "" });
  if (u.job && costUsd) await StudioJob.updateOne({ _id: u.job as any, organization: org }, { $inc: { spentUsd: costUsd } });
}

export async function spentBetween(org: Org, from: Date, to?: Date): Promise<number> {
  const r = await AiUsage.aggregate([{ $match: { organization: org, at: to ? { $gte: from, $lt: to } : { $gte: from } } }, { $group: { _id: null, usd: { $sum: "$costUsd" } } }]);
  return r[0]?.usd ?? 0;
}

export interface Budget { capUsd: number; capIsDefault: boolean; spentUsd: number; reservedUsd: number; leftUsd: number; confirmAboveUsd: number; fx: Fx }
/** Teto, gasto do mês e o que os trabalhos na fila ainda devem gastar (reserva). */
export async function budgetOf(org: Org, now: number = nowMs()): Promise<Budget> {
  const [cfg, o, spentUsd, open, fx] = await Promise.all([
    settings(),
    Organization.findById(org).select("studio").lean() as Promise<any>,
    spentBetween(org, monthStart(now)),
    StudioJob.find({ organization: org, status: { $in: ["queued", "running", "waiting"] } }).select("estimateUsd spentUsd").lean() as Promise<any[]>,
    usdBrl(now),
  ]);
  const own = o?.studio?.capUsd;
  const capUsd = typeof own === "number" && own >= 0 ? own : cfg.capUsd;
  const reservedUsd = open.reduce((n, j) => n + Math.max(0, (j.estimateUsd || 0) - (j.spentUsd || 0)), 0);
  return { capUsd, capIsDefault: !(typeof own === "number" && own >= 0), spentUsd, reservedUsd, leftUsd: Math.max(0, capUsd - spentUsd - reservedUsd), confirmAboveUsd: cfg.confirmAboveUsd, fx };
}

export const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: v < 0.1 ? 4 : 2 })}`;
export const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface BudgetCheck { ok: boolean; needsConfirm: boolean; estimateUsd: number; estimateBrl: number; message: string; budget: Budget }
/**
 * Antes de qualquer geração paga: barra se o teto do mês não comporta e pede confirmação
 * explícita quando a estimativa passa do valor configurado. Custo zero passa direto.
 */
export async function checkBudget(org: Org, estimateUsd: number, confirmed: boolean, now: number = nowMs()): Promise<BudgetCheck> {
  const budget = await budgetOf(org, now);
  const base = { estimateUsd, estimateBrl: estimateUsd * budget.fx.rate, budget };
  if (estimateUsd <= 0) return { ...base, ok: true, needsConfirm: false, message: "" };
  if (estimateUsd > budget.leftUsd + 1e-9)
    throw new FriendlyError(
      `O teto mensal de IA desta conta não comporta esta geração: teto ${usd(budget.capUsd)}, já usado ${usd(budget.spentUsd)}${budget.reservedUsd ? `, reservado para trabalhos na fila ${usd(budget.reservedUsd)}` : ""}, esta geração custaria cerca de ${usd(estimateUsd)}. Só o administrador da plataforma altera o teto.`,
      402, "teto");
  if (estimateUsd > budget.confirmAboveUsd && !confirmed)
    return { ...base, ok: false, needsConfirm: true, message: `Esta geração deve custar cerca de ${usd(estimateUsd)} (${brl(base.estimateBrl)}). Confirme para continuar.` };
  return { ...base, ok: true, needsConfirm: false, message: "" };
}

/** Trava dura, conferida a cada chamada paga: com o teto do mês estourado nada mais sai. */
export async function assertUnderCap(org: Org, now: number = nowMs()): Promise<void> {
  const [cfg, o, spent] = await Promise.all([settings(), Organization.findById(org).select("studio").lean() as Promise<any>, spentBetween(org, monthStart(now))]);
  const own = o?.studio?.capUsd;
  const cap = typeof own === "number" && own >= 0 ? own : cfg.capUsd;
  if (spent >= cap) throw new FriendlyError(`O teto mensal de IA desta conta foi atingido (${usd(spent)} de ${usd(cap)}). Novas gerações com IA ficam bloqueadas até o mês virar ou o administrador aumentar o teto.`, 402, "teto");
}

/** Resumo do período para a tela "Uso e custos". */
export async function usageReport(org: Org, from: Date, to: Date) {
  const match = { organization: org, at: { $gte: from, $lt: to } };
  const [byService, rows] = await Promise.all([
    AiUsage.aggregate([{ $match: match }, { $group: { _id: { purpose: "$purpose", service: "$service", model: "$model", house: "$house" }, calls: { $sum: 1 }, failed: { $sum: { $cond: ["$ok", 0, 1] } }, units: { $sum: "$units" }, unit: { $last: "$unit" }, usd: { $sum: "$costUsd" }, brl: { $sum: "$costBrl" } } }, { $sort: { usd: -1 } }]),
    AiUsage.find(match).sort({ at: -1 }).limit(200).lean(),
  ]);
  return {
    totalUsd: byService.reduce((n: number, r: any) => n + r.usd, 0), totalBrl: byService.reduce((n: number, r: any) => n + r.brl, 0),
    groups: byService.map((r: any) => ({ ...r._id, calls: r.calls, failed: r.failed, units: r.units, unit: r.unit, usd: r.usd, brl: r.brl })),
    rows: (rows as any[]).map((r) => ({ _id: String(r._id), at: r.at, purpose: r.purpose, service: r.service, model: r.model, what: r.what, units: r.units, unit: r.unit, usd: r.costUsd, brl: r.costBrl, fxRate: r.fxRate, ok: r.ok, error: r.error, house: r.house, by: r.by, job: r.job ? String(r.job) : null })),
  };
}
