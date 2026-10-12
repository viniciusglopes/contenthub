import { addDays, dayKey, formatDateBR, formatDateTimeBR, formatDayBR } from "./dates";
import { KIND_LABEL, savesPlusShares } from "./metrics";
import {
  type DailyPoint,
  type MediaItem,
  comparePeriods,
  followersAt,
  lastFullWeek,
  mediaInRange,
  pctChange,
  rankBySavesShares,
  statsByKind,
  topBy,
} from "./stats";

// Relatórios em TEXTO PLANO (vão para o Telegram): sem markdown e sem travessão.

export interface ReportInput {
  username: string;
  daily: DailyPoint[];
  media: MediaItem[];
  lastSync?: Date | string | null;
  now?: number;
}

export const AVISO_ATRASO = "Os dados da Meta podem atrasar até 48h.";

export function fmtInt(n: number | null | undefined): string {
  if (n == null) return "sem dado";
  return Math.round(n).toLocaleString("pt-BR");
}

export function fmtPct(p: number | null | undefined): string {
  if (p == null) return "sem base de comparação";
  const v = Math.round(p * 10) / 10;
  return `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function fmtDelta(n: number): string {
  return `${n > 0 ? "+" : ""}${fmtInt(n)}`;
}

export function shortCaption(m: MediaItem, max = 60): string {
  // Título do calendário ou a primeira linha da legenda (sem o bloco de hashtags).
  const firstLine = (m.caption || "").split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#")) || "";
  const raw = (m.postTitle || firstLine).replace(/\s+/g, " ").trim();
  if (!raw) return "(sem legenda)";
  return raw.length > max ? `${raw.slice(0, max - 1).trimEnd()}…` : raw;
}

function describe(m: MediaItem): string {
  return `"${shortCaption(m)}" (${KIND_LABEL[m.kind]} de ${formatDateBR(m.timestamp)})`;
}

function vs(pct: number | null, what: string): string {
  return pct == null ? "sem base de comparação ainda" : `${fmtPct(pct)} sobre ${what}`;
}

function followersLine(daily: DailyPoint[], fromKey: string, toKey: string): string {
  const end = followersAt(daily, toKey);
  // Início = fechamento do dia anterior ao período.
  const start = followersAt(daily, addDays(fromKey, -1)) || followersAt(daily, fromKey);
  if (!end) return "Seguidores: ainda sem histórico (começa a contar na primeira sincronização)";
  if (!start || start.date === end.date)
    return `Seguidores: ${fmtInt(end.value)} hoje (histórico começou em ${formatDayBR(end.date)}, ainda sem comparação)`;
  const delta = end.value - start.value;
  return `Seguidores: ${fmtInt(start.value)} no início, ${fmtInt(end.value)} no fim (${fmtDelta(delta)}, ${fmtPct(
    pctChange(end.value, start.value)
  )})`;
}

export function suggestAction(periodMedia: MediaItem[], reachPct: number | null, minPosts = 3): string {
  if (periodMedia.length === 0)
    return "Nenhum post no período. Publicar pelo menos 3 esta semana para voltar a ter dado comparável.";
  const kinds = statsByKind(periodMedia);
  const best = kinds[0];
  const others = kinds.slice(1).filter((k) => k.posts > 0);
  if (best && others.length > 0 && best.avgSavesShares > 0) {
    const restPosts = others.reduce((s, k) => s + k.posts, 0);
    const restAvg = others.reduce((s, k) => s + k.avgSavesShares * k.posts, 0) / restPosts;
    if (best.avgSavesShares >= restAvg * 1.3) {
      return `Fazer mais ${KIND_LABEL[best.kind].toLowerCase()}: média de ${fmtInt(
        best.avgSavesShares
      )} salvamentos+compartilhamentos por post, contra ${fmtInt(restAvg)} dos outros formatos.`;
    }
  }
  const champion = rankBySavesShares(periodMedia)[0];
  if (champion && savesPlusShares(champion.metrics) > 0) {
    const drop = reachPct != null && reachPct <= -20 ? "O alcance caiu; " : "";
    return `${drop}${drop ? "r" : "R"}epetir o tema do post campeão ${describe(champion)} em uma nova versão ainda esta semana.`;
  }
  if (periodMedia.length < minPosts)
    return `Foram só ${periodMedia.length} post(s) no período. Subir a frequência para pelo menos ${minPosts} por semana.`;
  return "Nenhum post gerou salvamento ou compartilhamento. Testar um conteúdo de utilidade (lista, passo a passo) com chamada para salvar.";
}

function footer(lastSync: ReportInput["lastSync"]): string {
  return `${AVISO_ATRASO} Última sincronização: ${lastSync ? formatDateTimeBR(lastSync) : "ainda não feita"}.`;
}

function bestLines(media: MediaItem[]): string[] {
  const saved = topBy(media, "saved");
  const shared = topBy(media, "shares");
  const lines: string[] = [];
  lines.push(
    saved
      ? `Mais salvo: ${describe(saved)}, ${fmtInt(saved.metrics.saved)} salvamentos${saved.permalink ? `\n${saved.permalink}` : ""}`
      : "Mais salvo: nenhum post com salvamento no período"
  );
  lines.push(
    shared
      ? `Mais compartilhado: ${describe(shared)}, ${fmtInt(shared.metrics.shares)} compartilhamentos${
          shared.permalink ? `\n${shared.permalink}` : ""
        }`
      : "Mais compartilhado: nenhum post com compartilhamento no período"
  );
  return lines;
}

/** Relatório da segunda: última semana fechada (segunda a domingo) contra a anterior. */
export function buildMondayReport(input: ReportInput): string {
  const today = dayKey(input.now ?? Date.now());
  const week = lastFullWeek(today);
  const reach = comparePeriods(input.daily, "reach", week.to, 7);
  const views = comparePeriods(input.daily, "views", week.to, 7);
  const posts = mediaInRange(input.media, week.from, week.to);
  const lines = [
    `RELATÓRIO DA SEGUNDA: @${input.username}`,
    `Semana de ${formatDayBR(week.from)} a ${formatDayBR(week.to)}`,
    "",
    followersLine(input.daily, week.from, week.to),
    reach.days === 0
      ? "Alcance: sem dado na semana"
      : `Alcance: ${fmtInt(reach.current)} (${vs(reach.pct, "a semana anterior")})`,
    views.days === 0
      ? "Views: sem dado na semana"
      : `Views: ${fmtInt(views.current)} (${vs(views.pct, "a semana anterior")})`,
    `Posts publicados na semana: ${posts.length}`,
    "",
    ...bestLines(posts),
    "",
    `Ação sugerida: ${suggestAction(posts, reach.pct)}`,
    "",
    footer(input.lastSync),
  ];
  return lines.join("\n");
}

/** Raio-x de 30 dias: fecha em ontem (o dia corrente ainda está incompleto). */
export function buildXrayReport(input: ReportInput): string {
  const today = dayKey(input.now ?? Date.now());
  const to = addDays(today, -1);
  const from = addDays(to, -29);
  const reach = comparePeriods(input.daily, "reach", to, 30);
  const views = comparePeriods(input.daily, "views", to, 30);
  const posts = mediaInRange(input.media, from, today);
  const kinds = statsByKind(posts);
  const top3 = rankBySavesShares(posts)
    .filter((m) => savesPlusShares(m.metrics) > 0)
    .slice(0, 3);
  const lines = [
    `RAIO-X DE 30 DIAS: @${input.username}`,
    `Período de ${formatDayBR(from)} a ${formatDayBR(to)}`,
    "",
    followersLine(input.daily, from, today),
    reach.days === 0
      ? "Alcance: sem dado no período"
      : `Alcance somado: ${fmtInt(reach.current)} (${vs(reach.pct, "os 30 dias anteriores")})`,
    views.days === 0
      ? "Views: sem dado no período"
      : `Views: ${fmtInt(views.current)} (${vs(views.pct, "os 30 dias anteriores")})`,
    `Posts publicados: ${posts.length}`,
  ];
  if (kinds.length > 0) {
    lines.push("", "Por formato (média de salvamentos+compartilhamentos por post):");
    for (const k of kinds)
      lines.push(`${KIND_LABEL[k.kind]}: ${k.posts} post(s), média ${fmtInt(k.avgSavesShares)}, alcance médio ${fmtInt(k.avgReach)}`);
  }
  if (top3.length > 0) {
    lines.push("", "Top 3 do período:");
    top3.forEach((m, i) =>
      lines.push(
        `${i + 1}. ${describe(m)}: ${fmtInt(m.metrics.saved ?? 0)} salvamentos, ${fmtInt(
          m.metrics.shares ?? 0
        )} compartilhamentos, alcance ${fmtInt(m.metrics.reach)}`
      )
    );
  }
  lines.push("", ...bestLines(posts), "", `Ação sugerida: ${suggestAction(posts, reach.pct, 12)}`, "", footer(input.lastSync));
  return lines.join("\n");
}
