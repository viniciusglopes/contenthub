import { addDays, dayKey, dayStartMs, mondayOf } from "./dates";
import { type MediaKind, type MediaMetrics, savesPlusShares } from "./metrics";
import type { Period } from "./period";

export interface DailyPoint {
  date: string; // AAAA-MM-DD (Brasília)
  followers?: number | null;
  reach?: number | null;
  views?: number | null;
}

export interface MediaItem {
  igId: string;
  kind: MediaKind;
  caption?: string;
  permalink?: string;
  timestamp: string | Date;
  thumbnailUrl?: string;
  metrics: MediaMetrics;
  postTitle?: string;
}

export function pctChange(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Seguidores no dia pedido ou, na falta, no registro anterior mais próximo. */
export function followersAt(daily: DailyPoint[], key: string): { date: string; value: number } | null {
  let best: { date: string; value: number } | null = null;
  for (const d of daily) {
    if (d.followers == null || d.date > key) continue;
    if (!best || d.date > best.date) best = { date: d.date, value: d.followers };
  }
  return best;
}

export interface FollowersDelta {
  start: number;
  end: number;
  delta: number;
  pct: number | null;
  /** Dia de onde saiu o número inicial. */
  since: string;
  /** true quando o histórico é mais curto que o período pedido. */
  partial: boolean;
}

export function followersDelta(daily: DailyPoint[], todayKey: string, days: number): FollowersDelta | null {
  const end = followersAt(daily, todayKey);
  if (!end) return null;
  const targetKey = addDays(todayKey, -days);
  let start = followersAt(daily, targetKey);
  let partial = false;
  if (!start) {
    // Histórico ainda não chega tão longe: usa o registro mais antigo que existir.
    const first = daily
      .filter((d) => d.followers != null && d.date <= todayKey)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!first || first.date === end.date) return null;
    start = { date: first.date, value: first.followers as number };
    partial = true;
  }
  return {
    start: start.value,
    end: end.value,
    delta: end.value - start.value,
    pct: pctChange(end.value, start.value),
    since: start.date,
    partial,
  };
}

export function sumRange(
  daily: DailyPoint[],
  field: "reach" | "views",
  fromKey: string,
  toKey: string
): { total: number; days: number } {
  let total = 0;
  let days = 0;
  for (const d of daily) {
    const v = d[field];
    if (v == null || d.date < fromKey || d.date > toKey) continue;
    total += v;
    days++;
  }
  return { total, days };
}

export function mediaInRange(media: MediaItem[], fromKey: string, toKey: string): MediaItem[] {
  const from = dayStartMs(fromKey);
  const to = dayStartMs(addDays(toKey, 1));
  return media.filter((m) => {
    const t = new Date(m.timestamp).getTime();
    return t >= from && t < to;
  });
}

export function rankBySavesShares(media: MediaItem[]): MediaItem[] {
  return [...media].sort(
    (a, b) =>
      savesPlusShares(b.metrics) - savesPlusShares(a.metrics) ||
      (b.metrics.reach ?? 0) - (a.metrics.reach ?? 0) ||
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export function topBy(media: MediaItem[], field: "saved" | "shares"): MediaItem | null {
  let best: MediaItem | null = null;
  for (const m of media) {
    const v = m.metrics[field] ?? 0;
    if (v > 0 && (!best || v > (best.metrics[field] ?? 0))) best = m;
  }
  return best;
}

export interface PeriodCompare {
  from: string;
  to: string;
  current: number;
  previous: number;
  pct: number | null;
  /** Dias com dado no período atual (para avisar quando o histórico está incompleto). */
  days: number;
}

export function comparePeriods(
  daily: DailyPoint[],
  field: "reach" | "views",
  toKey: string,
  days: number
): PeriodCompare {
  const from = addDays(toKey, -(days - 1));
  const cur = sumRange(daily, field, from, toKey);
  const prev = sumRange(daily, field, addDays(from, -days), addDays(from, -1));
  return {
    from,
    to: toKey,
    current: cur.total,
    previous: prev.total,
    pct: prev.days > 0 ? pctChange(cur.total, prev.total) : null,
    days: cur.days,
  };
}

export interface KindStat {
  kind: MediaKind;
  posts: number;
  avgSavesShares: number;
  avgReach: number;
}

export function statsByKind(media: MediaItem[]): KindStat[] {
  const groups = new Map<MediaKind, MediaItem[]>();
  for (const m of media) groups.set(m.kind, [...(groups.get(m.kind) || []), m]);
  return [...groups.entries()]
    .map(([kind, items]) => ({
      kind,
      posts: items.length,
      avgSavesShares: items.reduce((s, m) => s + savesPlusShares(m.metrics), 0) / items.length,
      avgReach: items.reduce((s, m) => s + (m.metrics.reach ?? 0), 0) / items.length,
    }))
    .sort((a, b) => b.avgSavesShares - a.avgSavesShares);
}

export interface Dashboard {
  today: string;
  followers: number | null;
  followers7: FollowersDelta | null;
  followers30: FollowersDelta | null;
  reach7: PeriodCompare;
  reach30: PeriodCompare;
  views7: PeriodCompare;
  views30: PeriodCompare;
  posts30: MediaItem[]; // já ordenados por salvamentos + compartilhamentos
  top10: MediaItem[];
  series: DailyPoint[]; // últimos 30 dias, em ordem
}

export function buildDashboard(daily: DailyPoint[], media: MediaItem[], now: number = Date.now()): Dashboard {
  const today = dayKey(now);
  // Alcance e views do dia corrente ainda estão incompletos: os períodos fecham em ontem.
  const lastFull = addDays(today, -1);
  const from30 = addDays(today, -29);
  const posts30 = rankBySavesShares(mediaInRange(media, from30, today));
  return {
    today,
    followers: followersAt(daily, today)?.value ?? null,
    followers7: followersDelta(daily, today, 7),
    followers30: followersDelta(daily, today, 30),
    reach7: comparePeriods(daily, "reach", lastFull, 7),
    reach30: comparePeriods(daily, "reach", lastFull, 30),
    views7: comparePeriods(daily, "views", lastFull, 7),
    views30: comparePeriods(daily, "views", lastFull, 30),
    posts30,
    top10: posts30.slice(0, 10),
    series: daily
      .filter((d) => d.date >= from30 && d.date <= today)
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** Última semana fechada (segunda a domingo) antes do dia dado. */
export function lastFullWeek(todayKey: string): { from: string; to: string } {
  const thisMonday = mondayOf(todayKey);
  return { from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) };
}

// ---------------------------------------------------------------------------
// PERÍODO ESCOLHIDO PELO USUÁRIO
// ---------------------------------------------------------------------------

export interface MetricPeriod {
  /** soma dos dias fechados do período */
  current: number;
  previous: number;
  /** null = sem base honesta para comparar (mostrar "sem comparação ainda") */
  pct: number | null;
  /** dias COM dado no trecho comparado do período */
  days: number;
  /** dias que o trecho comparado deveria ter (o dia de hoje, ainda aberto, fica de fora) */
  expectedDays: number;
  prevDays: number;
  /** trecho realmente somado (null quando o período é só o dia de hoje) */
  from: string | null;
  to: string | null;
}

/**
 * Soma de alcance/views da CONTA no período, contra o período anterior de mesmo tamanho.
 * O dia de hoje ainda não fechou na Meta: quando o período inclui hoje, compara-se o mesmo
 * número de dias fechados dos dois lados (os primeiros N-1 dias de cada período).
 * Só há percentual quando o período anterior tem dado em pelo menos tantos dias quanto o atual.
 */
export function metricForPeriod(daily: DailyPoint[], field: "reach" | "views", period: Period, todayKey: string): MetricPeriod {
  const open = period.to >= todayKey ? 1 : 0;
  const expectedDays = period.days - open;
  if (expectedDays <= 0)
    return { current: 0, previous: 0, pct: null, days: 0, expectedDays: 0, prevDays: 0, from: null, to: null };
  const to = addDays(period.to, -open);
  const cur = sumRange(daily, field, period.from, to);
  const prev = sumRange(daily, field, period.prevFrom, addDays(period.prevTo, -open));
  const comparable = cur.days > 0 && prev.days >= cur.days;
  return {
    current: cur.total,
    previous: prev.total,
    pct: comparable ? pctChange(cur.total, prev.total) : null,
    days: cur.days,
    expectedDays,
    prevDays: prev.days,
    from: period.from,
    to,
  };
}

/** Variação de seguidores DENTRO do período (fechamento do dia anterior ao início até o fim). */
export function followersInPeriod(daily: DailyPoint[], period: Period): FollowersDelta | null {
  const end = followersAt(daily, period.to);
  if (!end || end.date < period.from) return null; // nenhum registro dentro do período
  let start = followersAt(daily, addDays(period.from, -1)) || followersAt(daily, period.from);
  let partial = false;
  if (!start) {
    const first = daily
      .filter((d) => d.followers != null && d.date >= period.from && d.date <= period.to)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!first) return null;
    start = { date: first.date, value: first.followers as number };
    partial = true;
  }
  if (start.date === end.date) return null; // um registro só: não há variação a mostrar
  return {
    start: start.value,
    end: end.value,
    delta: end.value - start.value,
    pct: pctChange(end.value, start.value),
    since: start.date,
    partial,
  };
}

export function sumMedia(media: MediaItem[], field: "reach" | "views"): number {
  return media.reduce((s, m) => s + (m.metrics[field] ?? 0), 0);
}

export interface DataCoverage {
  /** primeiro dia com alcance/views da conta gravado */
  accountSince: string | null;
  /** primeiro dia com seguidores gravado */
  followersSince: string | null;
  /** dia até onde os posts foram buscados na Meta (não é o post mais antigo: é o corte da busca) */
  mediaSince: string | null;
}

export interface PeriodDashboard {
  today: string;
  period: Period;
  followers: number | null;
  followersDelta: FollowersDelta | null;
  /** alcance da conta: SOMA dos dias (a mesma pessoa conta de novo a cada dia) */
  reach: MetricPeriod;
  views: MetricPeriod;
  /** posts PUBLICADOS no período, ordenados por salvamentos + compartilhamentos */
  posts: MediaItem[];
  top10: MediaItem[];
  /** soma do alcance dos posts publicados no período */
  postsReach: number;
  postsViews: number;
  /** null quando a busca de posts não cobre o período anterior inteiro */
  prevPosts: number | null;
  prevPostsReach: number | null;
  coverage: DataCoverage;
  /** o período começa antes do que há de posts / de dado da conta */
  postsIncomplete: boolean;
  accountIncomplete: boolean;
  series: DailyPoint[];
}

export function buildPeriodDashboard(
  daily: DailyPoint[],
  media: MediaItem[],
  period: Period,
  opts: { now?: number; mediaSince?: string | null } = {}
): PeriodDashboard {
  const today = dayKey(opts.now ?? Date.now());
  const posts = rankBySavesShares(mediaInRange(media, period.from, period.to));
  const prev = mediaInRange(media, period.prevFrom, period.prevTo);
  const mediaSince = opts.mediaSince ?? null;
  const withReach = daily.filter((d) => d.reach != null || d.views != null).map((d) => d.date).sort();
  const withFollowers = daily.filter((d) => d.followers != null).map((d) => d.date).sort();
  const coverage: DataCoverage = {
    accountSince: withReach[0] ?? null,
    followersSince: withFollowers[0] ?? null,
    mediaSince,
  };
  const prevCovered = mediaSince != null && mediaSince <= period.prevFrom;
  const reach = metricForPeriod(daily, "reach", period, today);
  return {
    today,
    period,
    followers: followersAt(daily, today)?.value ?? null,
    followersDelta: followersInPeriod(daily, period),
    reach,
    views: metricForPeriod(daily, "views", period, today),
    posts,
    top10: posts.slice(0, 10),
    postsReach: sumMedia(posts, "reach"),
    postsViews: sumMedia(posts, "views"),
    prevPosts: prevCovered ? prev.length : null,
    prevPostsReach: prevCovered ? sumMedia(prev, "reach") : null,
    coverage,
    postsIncomplete: mediaSince == null || mediaSince > period.from,
    accountIncomplete: reach.expectedDays > 0 && reach.days < reach.expectedDays,
    series: daily.filter((d) => d.date >= period.from && d.date <= period.to).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
