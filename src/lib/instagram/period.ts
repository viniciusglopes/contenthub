import { FriendlyError } from "@/lib/errors";
import { addDays, dayKey, formatDayBR } from "./dates";

// PERÍODO escolhido pelo usuário. Tudo em dias de Brasília (AAAA-MM-DD), inclusivo nas duas pontas.
// A comparação é SEMPRE contra o período imediatamente anterior, do MESMO tamanho.

export type PeriodPreset = "7d" | "30d" | "90d" | "mes" | "mes-passado" | "datas";

export const PERIOD_PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "mes", label: "Este mês" },
  { key: "mes-passado", label: "Mês passado" },
  { key: "datas", label: "Datas" },
];

export const DEFAULT_PRESET: PeriodPreset = "30d";
export const MAX_PERIOD_DAYS = 366;

export interface Period {
  preset: PeriodPreset;
  from: string;
  to: string;
  /** quantidade de dias do período (as duas pontas contam) */
  days: number;
  prevFrom: string;
  prevTo: string;
  /** "13/09 a 12/10" (com o ano quando não é o ano corrente ou cruza anos) */
  label: string;
  prevLabel: string;
  /** "os 30 dias anteriores" */
  compareLabel: string;
  /** nome curto: "30 dias", "Este mês", "Datas" */
  name: string;
  /** o período inclui hoje (dia ainda aberto para alcance e views da conta) */
  includesToday: boolean;
}

export interface PeriodInput {
  periodo?: string | null;
  dias?: string | number | null;
  de?: string | null;
  ate?: string | null;
}

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(v: unknown): v is string {
  if (typeof v !== "string" || !KEY_RE.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export function rangeLabel(from: string, to: string, today: string): string {
  const year = today.slice(0, 4);
  const withYear = from.slice(0, 4) !== year || to.slice(0, 4) !== year;
  if (from === to) return formatDayBR(from, withYear);
  return `${formatDayBR(from, withYear)} a ${formatDayBR(to, withYear)}`;
}

export function compareLabelFor(days: number): string {
  return days === 1 ? "o dia anterior" : `os ${days} dias anteriores`;
}

function build(preset: PeriodPreset, from: string, to: string, today: string, name: string): Period {
  const days = daysBetween(from, to);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(from, -days);
  return {
    preset,
    from,
    to,
    days,
    prevFrom,
    prevTo,
    label: rangeLabel(from, to, today),
    prevLabel: rangeLabel(prevFrom, prevTo, today),
    compareLabel: compareLabelFor(days),
    name,
    includesToday: to >= today,
  };
}

const presetName = (k: PeriodPreset) => PERIOD_PRESETS.find((p) => p.key === k)?.label ?? k;

/**
 * Resolve o período pedido. Precedência: `de`/`ate` > `dias` > `periodo` > padrão (30 dias).
 * Entrada inválida vira FriendlyError 400 com o campo ("de" ou "ate"), nunca um período "consertado".
 */
export function resolvePeriod(input: PeriodInput = {}, now: number = Date.now()): Period {
  const today = dayKey(now);
  const de = (input.de ?? "").toString().trim();
  const ate = (input.ate ?? "").toString().trim();
  const dias = input.dias == null ? "" : String(input.dias).trim();
  const periodo = (input.periodo ?? "").toString().trim();

  if (de || ate) {
    if (!de) throw new FriendlyError("Escolha a data inicial.", 400, "de");
    if (!isDayKey(de)) throw new FriendlyError("Data inicial inválida. Use o calendário.", 400, "de");
    const end = ate || today;
    if (!isDayKey(end)) throw new FriendlyError("Data final inválida. Use o calendário.", 400, "ate");
    if (de > today) throw new FriendlyError("A data inicial não pode ser no futuro.", 400, "de");
    if (end > today) throw new FriendlyError("A data final não pode ser no futuro.", 400, "ate");
    if (end < de) throw new FriendlyError("A data final não pode ser antes da inicial.", 400, "ate");
    if (daysBetween(de, end) > MAX_PERIOD_DAYS)
      throw new FriendlyError("Escolha um intervalo de até 12 meses.", 400, "ate");
    return build("datas", de, end, today, "Datas");
  }

  if (dias) {
    const n = Number(dias);
    if (!Number.isInteger(n) || n < 1 || n > MAX_PERIOD_DAYS)
      throw new FriendlyError(`Quantidade de dias inválida. Use de 1 a ${MAX_PERIOD_DAYS}.`, 400, "dias");
    const preset: PeriodPreset = n === 7 ? "7d" : n === 30 ? "30d" : n === 90 ? "90d" : "datas";
    return build(preset, addDays(today, -(n - 1)), today, today, `${n} ${n === 1 ? "dia" : "dias"}`);
  }

  const preset = (periodo || DEFAULT_PRESET) as PeriodPreset;
  switch (preset) {
    case "7d":
    case "30d":
    case "90d": {
      const n = Number(preset.slice(0, -1));
      return build(preset, addDays(today, -(n - 1)), today, today, presetName(preset));
    }
    case "mes":
      return build("mes", `${today.slice(0, 7)}-01`, today, today, presetName("mes"));
    case "mes-passado": {
      const lastOfPrev = addDays(`${today.slice(0, 7)}-01`, -1);
      return build("mes-passado", `${lastOfPrev.slice(0, 7)}-01`, lastOfPrev, today, presetName("mes-passado"));
    }
    default:
      throw new FriendlyError("Período desconhecido. Use 7d, 30d, 90d, mes, mes-passado ou as datas de e até.", 400, "periodo");
  }
}

/** Lê o período dos parâmetros de um link (`periodo`, `dias`, `de`, `ate`). */
export function periodFromParams(p: URLSearchParams, now: number = Date.now()): Period {
  return resolvePeriod({ periodo: p.get("periodo"), dias: p.get("dias"), de: p.get("de"), ate: p.get("ate") }, now);
}

export function hasPeriodParams(p: URLSearchParams): boolean {
  return ["periodo", "dias", "de", "ate"].some((k) => (p.get(k) ?? "") !== "");
}
