// Dias contados no horário de Brasília (UTC-3, sem horário de verão desde 2019).
const BRT_OFFSET_MS = 3 * 3_600_000;

export function dayKey(d: Date | number): string {
  const t = (typeof d === "number" ? d : d.getTime()) - BRT_OFFSET_MS;
  return new Date(t).toISOString().slice(0, 10);
}

export function dayStartMs(key: string): number {
  return Date.parse(`${key}T00:00:00Z`) + BRT_OFFSET_MS;
}

export function addDays(key: string, n: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Intervalo (unix, segundos) que cobre um dia de Brasília. */
export function dayRangeUnix(key: string): { since: number; until: number } {
  const start = dayStartMs(key) / 1000;
  return { since: start, until: start + 86_400 };
}

export function formatDayBR(key: string, withYear = false): string {
  const [y, m, d] = key.split("-");
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

export function formatDateBR(d: Date | string | number, withYear = false): string {
  return formatDayBR(dayKey(new Date(d)), withYear);
}

export function formatDateTimeBR(d: Date | string | number): string {
  const t = new Date(new Date(d).getTime() - BRT_OFFSET_MS).toISOString();
  return `${formatDayBR(t.slice(0, 10))} às ${t.slice(11, 16)}`;
}

/** Segunda-feira (chave de dia) da semana que contém o dia dado. */
export function mondayOf(key: string): string {
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(key, -((dow + 6) % 7));
}
