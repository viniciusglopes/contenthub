import { createHmac, timingSafeEqual, createHash } from "node:crypto";

// Proteção mínima: uma senha (APP_PASSWORD) e um cookie assinado (AUTH_SECRET).
// Rotinas automáticas (cron, Billy) usam "Authorization: Bearer <CRON_TOKEN>".

export const SESSION_COOKIE = "ch_session";
export const SESSION_DAYS = 30;

function secret(): string {
  return process.env.AUTH_SECRET || "";
}

export function authConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD && secret().length >= 16);
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  // Compara hashes: tamanho fixo, sem vazar o comprimento.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(given: string): boolean {
  const expected = process.env.APP_PASSWORD || "";
  if (!expected || !given) return false;
  return safeEqual(given, expected);
}

export function createSessionToken(now: number = Date.now(), key: string = secret()): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: now + SESSION_DAYS * 86_400_000 })
  ).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

export function verifySessionToken(
  token: string | undefined | null,
  now: number = Date.now(),
  key: string = secret()
): boolean {
  if (!token || key.length < 16) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  if (!safeEqual(sig, sign(payload, key))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof exp === "number" && exp > now;
  } catch {
    return false;
  }
}

export function checkCronToken(authorization: string | null | undefined): boolean {
  const expected = process.env.CRON_TOKEN || "";
  if (expected.length < 16 || !authorization) return false;
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return m ? safeEqual(m[1], expected) : false;
}

// Rotas que aceitam o token de rotina além do login.
export const CRON_PATHS = ["/api/instagram/sync", "/api/instagram/report"];

// Freio simples de tentativas de senha (por IP, em memória).
const attempts = new Map<string, { count: number; resetAt: number }>();

export function loginAllowed(ip: string, now: number = Date.now()): boolean {
  const a = attempts.get(ip);
  if (!a || a.resetAt < now) return true;
  return a.count < 8;
}

export function registerLoginFailure(ip: string, now: number = Date.now()): void {
  const a = attempts.get(ip);
  if (!a || a.resetAt < now) attempts.set(ip, { count: 1, resetAt: now + 10 * 60_000 });
  else a.count += 1;
}

export function clearLoginFailures(ip: string): void {
  attempts.delete(ip);
}
