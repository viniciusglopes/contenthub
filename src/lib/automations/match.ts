// Funções puras das automações: casar palavra, validar e-mail/telefone, rodízio, regras de tempo.
// Sem banco e sem rede (servem à rota, ao motor e aos testes).

export const DAY_MS = 86_400_000;
/** Private reply: a Meta aceita até 7 dias depois do comentário. Folga de 1h para não bater no limite. */
export const PRIVATE_REPLY_MAX_MS = 7 * DAY_MS - 3_600_000;
/** Janela de mensagem: 24h desde a última mensagem RECEBIDA da pessoa. */
export const WINDOW_MS = 24 * 3_600_000;
/** Teto da Meta para private reply em post/reel: 750 por hora por conta. O nosso fica bem abaixo. */
export const META_PRIVATE_REPLY_PER_HOUR = 750;
export const DEFAULT_HOURLY_CAP = 60;
export const MAX_HOURLY_CAP = 200;

export const LIMITS = {
  name: 80,
  keywords: 20,
  keyword: 40,
  publicReplies: 3,
  publicReply: 300,
  dmText: 640, // template de botão: texto até 640
  buttons: 3,
  buttonTitle: 20,
  quickReplies: 13,
  quickTitle: 20,
  replyText: 640,
  tag: 30,
  tags: 10,
  consentText: 600,
  question: 300,
};

export function normalize(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export type MatchMode = "word" | "contains" | "exact";

/** A palavra casa com o texto? Sem acento, sem maiúscula, sem pontuação. */
export function keywordMatches(text: string, keywords: string[], mode: MatchMode = "word"): string | null {
  const t = normalize(text);
  if (!t) return null;
  for (const raw of keywords) {
    const k = normalize(raw);
    if (!k) continue;
    if (mode === "exact" && t === k) return raw;
    if (mode === "contains" && t.includes(k)) return raw;
    if (mode === "word" && ` ${t} `.includes(` ${k} `)) return raw;
  }
  return null;
}

/** Pediu para parar (opt-out): nenhuma mensagem automática sai mais (política 5.2b da Meta). */
const STOP = ["parar", "pare", "sair", "stop", "cancelar", "descadastrar", "nao quero mais mensagens"];
export function isOptOut(text: string): boolean {
  const t = normalize(text);
  return STOP.includes(t);
}

export function validEmail(raw: string): string | null {
  const v = String(raw || "").trim().toLowerCase();
  if (v.length > 254) return null;
  return /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(v) ? v : null;
}

/** Telefone do Brasil: DDD + número (10 ou 11 dígitos), com ou sem +55. Devolve no formato +55DDNNNNNNNNN. */
export function validPhone(raw: string): string | null {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 11 && d[2] !== "9") return null;
  return `+55${d}`;
}

export function hourlyCap(): number {
  const n = Number(process.env.AUTOMACOES_HOURLY_CAP || DEFAULT_HOURLY_CAP);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_HOURLY_CAP;
  return Math.min(Math.floor(n), MAX_HOURLY_CAP);
}

export const hourKey = (now: number) => new Date(now).toISOString().slice(0, 13).replace(/\D/g, "");
export const nextHourMs = (now: number) => Math.floor(now / 3_600_000) * 3_600_000 + 3_600_000;

export function withinPrivateReplyWindow(commentAtMs: number, now: number): boolean {
  return now - commentAtMs <= PRIVATE_REPLY_MAX_MS;
}
export function withinMessagingWindow(lastInboundAt: Date | string | null | undefined, now: number): boolean {
  if (!lastInboundAt) return false;
  return now - new Date(lastInboundAt).getTime() <= WINDOW_MS;
}

/** Versão curta do texto de consentimento (muda quando o texto muda). */
export async function consentVersion(text: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return "v-" + createHash("sha256").update(text.trim()).digest("hex").slice(0, 10);
}

export const excerpt = (s: unknown, n = 200) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
