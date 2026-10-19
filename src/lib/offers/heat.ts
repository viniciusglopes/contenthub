// OFERTAS: números do cartão e selo de temperatura. Arquivo PURO (sem banco): serve à API,
// à tela e aos testes.
import { addDays } from "@/lib/instagram/dates";
import { FriendlyError } from "@/lib/errors";

export interface DailyPoint {
  date: string;
  count: number;
  source: "api" | "manual";
  complete?: boolean;
}

export interface OfferStats {
  /** última contagem (pode não ser de hoje) */
  count: number | null;
  date: string | null;
  source: "api" | "manual" | null;
  complete: boolean;
  /** vs o dia anterior ao da última contagem (só se houver contagem naquele dia) */
  delta1: number | null;
  delta1Pct: number | null;
  /** vs a contagem de 7 dias antes (aceita de 7 a 10 dias antes, a mais próxima de 7) */
  delta7: number | null;
  delta7Pct: number | null;
  base7Date: string | null;
  /** fontes diferentes nos dois lados do delta (API x manual): o delta sai, mas com aviso */
  mixedSources: boolean;
  /** 30 dias terminando na última contagem; dia sem contagem = null */
  spark: (number | null)[];
  sparkFrom: string | null;
}

const pct = (now: number, base: number): number => (base > 0 ? Math.round(((now - base) / base) * 1000) / 10 : now > 0 ? 100 : 0);

export function computeStats(points: DailyPoint[], sparkDays = 30): OfferStats {
  const rows = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const last = rows[rows.length - 1];
  const empty: OfferStats = { count: null, date: null, source: null, complete: true, delta1: null, delta1Pct: null, delta7: null, delta7Pct: null, base7Date: null, mixedSources: false, spark: [], sparkFrom: null };
  if (!last) return empty;
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const prev = byDate.get(addDays(last.date, -1));
  let base7: DailyPoint | undefined;
  for (const back of [7, 8, 9, 10]) {
    base7 = byDate.get(addDays(last.date, -back));
    if (base7) break;
  }
  const sparkFrom = addDays(last.date, -(sparkDays - 1));
  const spark: (number | null)[] = [];
  for (let i = 0; i < sparkDays; i++) spark.push(byDate.get(addDays(sparkFrom, i))?.count ?? null);
  return {
    count: last.count,
    date: last.date,
    source: last.source,
    complete: last.complete !== false,
    delta1: prev ? last.count - prev.count : null,
    delta1Pct: prev ? pct(last.count, prev.count) : null,
    delta7: base7 ? last.count - base7.count : null,
    delta7Pct: base7 ? pct(last.count, base7.count) : null,
    base7Date: base7?.date ?? null,
    mixedSources: Boolean((prev && prev.source !== last.source) || (base7 && base7.source !== last.source)),
    spark,
    sparkFrom,
  };
}

// ---- selo de temperatura
// Regras em ORDEM: a primeira que bate vale. Campos opcionais; ausente = não confere.
// Sem comparação de 7 dias o selo é "sem histórico" (nenhuma regra com delta bate).
export interface HeatRule {
  id: string;
  label: string;
  /** cor do selo: red | orange | green | gray | blue */
  tone: string;
  minCount?: number;
  maxCount?: number;
  minDelta7?: number;
  maxDelta7?: number;
  minDelta7Pct?: number;
  maxDelta7Pct?: number;
}

export const DEFAULT_HEAT_RULES: HeatRule[] = [
  { id: "escalando", label: "Escalando", tone: "red", minCount: 50, minDelta7Pct: 30 },
  { id: "crescendo", label: "Crescendo", tone: "orange", minCount: 5, minDelta7Pct: 10 },
  { id: "caindo", label: "Caindo", tone: "blue", maxDelta7Pct: -15 },
  { id: "estavel", label: "Estável", tone: "gray", minDelta7Pct: -1000 },
];
export const NO_HISTORY = { id: "sem_historico", label: "Sem histórico", tone: "gray" };
export const STOPPED = { id: "parou", label: "Parou", tone: "gray" };
const NUM_KEYS = ["minCount", "maxCount", "minDelta7", "maxDelta7", "minDelta7Pct", "maxDelta7Pct"] as const;
const TONES = ["red", "orange", "green", "gray", "blue"];

export function heatOf(s: Pick<OfferStats, "count" | "delta7" | "delta7Pct">, rules: HeatRule[] = DEFAULT_HEAT_RULES): { id: string; label: string; tone: string } {
  if (s.count == null) return NO_HISTORY;
  if (s.count === 0 && (s.delta7 ?? 0) < 0) return STOPPED;
  for (const r of rules) {
    const needsDelta = r.minDelta7 != null || r.maxDelta7 != null || r.minDelta7Pct != null || r.maxDelta7Pct != null;
    if (needsDelta && s.delta7 == null) continue;
    if (r.minCount != null && s.count < r.minCount) continue;
    if (r.maxCount != null && s.count > r.maxCount) continue;
    if (r.minDelta7 != null && s.delta7! < r.minDelta7) continue;
    if (r.maxDelta7 != null && s.delta7! > r.maxDelta7) continue;
    if (r.minDelta7Pct != null && s.delta7Pct! < r.minDelta7Pct) continue;
    if (r.maxDelta7Pct != null && s.delta7Pct! > r.maxDelta7Pct) continue;
    return { id: r.id, label: r.label, tone: r.tone };
  }
  return NO_HISTORY;
}

/** Valida as regras enviadas pelo administrador. */
export function cleanHeatRules(raw: unknown): HeatRule[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 10) throw new FriendlyError("Envie de 1 a 10 regras.", 400, "heatRules");
  const ids = new Set<string>();
  return raw.map((r: Record<string, unknown>, i) => {
    const id = String(r?.id || "").trim().toLowerCase();
    const label = String(r?.label || "").trim().slice(0, 30);
    if (!/^[a-z0-9_]{2,30}$/.test(id) || ids.has(id)) throw new FriendlyError(`Regra ${i + 1}: identificador inválido ou repetido.`, 400, "heatRules");
    if (label.length < 2) throw new FriendlyError(`Regra ${i + 1}: diga o nome do selo.`, 400, "heatRules");
    ids.add(id);
    const out: HeatRule = { id, label, tone: TONES.includes(String(r.tone)) ? String(r.tone) : "gray" };
    for (const k of NUM_KEYS) {
      const v = r[k];
      if (v === undefined || v === null || v === "") continue;
      const n = Number(v);
      if (!Number.isFinite(n) || Math.abs(n) > 1_000_000) throw new FriendlyError(`Regra ${i + 1}: ${k} precisa ser número.`, 400, "heatRules");
      out[k] = n;
    }
    return out;
  });
}

/** Regra em texto, para a tela "como o selo é calculado". */
export function describeRule(r: HeatRule): string {
  const p: string[] = [];
  if (r.minCount != null) p.push(`pelo menos ${r.minCount} anúncios ativos`);
  if (r.maxCount != null) p.push(`no máximo ${r.maxCount} anúncios ativos`);
  if (r.minDelta7Pct != null && r.minDelta7Pct > -1000) p.push(`alta de ${r.minDelta7Pct}% ou mais em 7 dias`);
  if (r.maxDelta7Pct != null) p.push(`variação de ${r.maxDelta7Pct}% ou menos em 7 dias`);
  if (r.minDelta7 != null) p.push(`pelo menos ${r.minDelta7 >= 0 ? "+" : ""}${r.minDelta7} anúncios em 7 dias`);
  if (r.maxDelta7 != null) p.push(`no máximo ${r.maxDelta7 >= 0 ? "+" : ""}${r.maxDelta7} anúncios em 7 dias`);
  return p.length ? p.join(" e ") : "qualquer oferta com comparação de 7 dias";
}

// ---- relatório do mês: quem mais ganhou anúncios ativos entre a 1ª e a última contagem do mês
export interface MonthlyItem {
  id: string;
  name: string;
  from: number;
  to: number;
  fromDate: string;
  toDate: string;
  growth: number;
  growthPct: number;
  peak: number;
  manual: boolean;
}

export function monthlyTop(pages: { id: string; name: string; points: DailyPoint[] }[], month: string, limit = 20): MonthlyItem[] {
  const items: MonthlyItem[] = [];
  for (const p of pages) {
    const pts = p.points.filter((x) => x.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
    if (pts.length < 2) continue;
    const a = pts[0];
    const b = pts[pts.length - 1];
    items.push({ id: p.id, name: p.name, from: a.count, to: b.count, fromDate: a.date, toDate: b.date, growth: b.count - a.count, growthPct: pct(b.count, a.count), peak: Math.max(...pts.map((x) => x.count)), manual: pts.some((x) => x.source === "manual") });
  }
  return items.filter((i) => i.growth > 0).sort((x, y) => y.growth - x.growth || y.growthPct - x.growthPct).slice(0, limit);
}

export function monthlyText(month: string, items: MonthlyItem[]): string {
  const [y, m] = month.split("-");
  const head = `Mais escaladas do mês ${m}/${y} (lista da casa ContentHub)`;
  if (!items.length) return `${head}\n\nNenhuma oferta com alta de anúncios ativos neste mês (precisa de pelo menos 2 contagens no mês).`;
  const d = (k: string) => k.split("-").reverse().slice(0, 2).join("/");
  const lines = items.map((i, n) => `${n + 1}. ${i.name}: ${i.from} para ${i.to} anúncios ativos (+${i.growth}, +${i.growthPct.toLocaleString("pt-BR")}%) de ${d(i.fromDate)} a ${d(i.toDate)}, pico ${i.peak}${i.manual ? " (inclui contagem manual)" : ""}`);
  return `${head}\n\n${lines.join("\n")}\n\nAlta = última contagem do mês menos a primeira. Contagem pela API oficial da Biblioteca de Anúncios da Meta (anúncios que alcançaram a União Europeia) ou manual, quando marcado.`;
}
