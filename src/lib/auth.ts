import { createHmac, timingSafeEqual, createHash, randomBytes, scrypt } from "node:crypto";

// Acesso: cada pessoa entra com e-mail e senha. O cookie de sessão é assinado (AUTH_SECRET)
// e carrega só o id do usuário; papel e organização são lidos do banco a cada pedido.
// Rotinas automáticas (cron, Billy) usam "Authorization: Bearer <CRON_TOKEN>".

export const SESSION_COOKIE = "ch_session";
export const SESSION_DAYS = 30;

function secret(): string {
  return process.env.AUTH_SECRET || "";
}

export function authConfigured(): boolean {
  return secret().length >= 16;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  // Compara hashes: tamanho fixo, sem vazar o comprimento.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// ---------- senha (scrypt nativo do Node) ----------
// Formato gravado: scrypt$N$r$p$<sal>$<hash> (base64url). Os parâmetros vão junto para
// poder endurecer depois sem invalidar as senhas antigas.
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 };
export const MIN_PASSWORD = 10;

function scryptAsync(password: string, salt: Buffer, N: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, keylen, { N, r, p, maxmem: 256 * N * r }, (err, key) =>
      err ? reject(err) : resolve(key)
    )
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.keylen);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt" || !password) return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0) || N > 1 << 20) return false;
  const expected = Buffer.from(parts[5], "base64url");
  try {
    const key = await scryptAsync(password, Buffer.from(parts[4], "base64url"), N, r, p, expected.length);
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/** Devolve a mensagem do que falta na senha, ou "" quando está boa. */
export function passwordProblem(password: string): string {
  if (password.length < MIN_PASSWORD) return `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
  if (password.length > 200) return "Senha longa demais (máximo 200 caracteres).";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return "Use letras e números na senha.";
  return "";
}

// ---------- cookie de sessão ----------
export interface SessionPayload {
  uid: string;
  /** versão da sessão do usuário (trocar a senha invalida as antigas) */
  sv: number;
  /** organização que o administrador está vendo ("entrar como") */
  imp?: string;
  exp: number;
}

export function createSessionToken(
  data: { uid: string; sv: number; imp?: string },
  now: number = Date.now(),
  key: string = secret()
): string {
  const body: SessionPayload = { uid: data.uid, sv: data.sv, exp: now + SESSION_DAYS * 86_400_000 };
  if (data.imp) body.imp = data.imp;
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

function readSigned<T>(token: string | undefined | null, now: number, key: string): T | null {
  if (!token || key.length < 16) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  if (!safeEqual(sig, sign(payload, key))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data?.exp !== "number" || data.exp <= now) return null;
    return data as T;
  } catch {
    return null;
  }
}

export function readSessionToken(
  token: string | undefined | null,
  now: number = Date.now(),
  key: string = secret()
): SessionPayload | null {
  const p = readSigned<SessionPayload>(token, now, key);
  if (!p || typeof p.uid !== "string" || !/^[0-9a-f]{24}$/.test(p.uid) || typeof p.sv !== "number") return null;
  if (p.imp !== undefined && (typeof p.imp !== "string" || !/^[0-9a-f]{24}$/.test(p.imp))) return null;
  return p;
}

/** Usado pelo proxy: só confere assinatura e validade (sem banco). */
export function verifySessionToken(token: string | undefined | null, now: number = Date.now(), key: string = secret()): boolean {
  return readSessionToken(token, now, key) !== null;
}

// ---------- "state" assinado (OAuth do Instagram) ----------
// Chave derivada: um state nunca serve como cookie de sessão e vice-versa.
export function signState(data: Record<string, unknown>, ttlMs: number, now: number = Date.now(), key: string = secret()): string {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: now + ttlMs })).toString("base64url");
  return `${payload}.${sign(payload, `state:${key}`)}`;
}

export function readState<T>(token: string | undefined | null, now: number = Date.now(), key: string = secret()): T | null {
  if (key.length < 16) return null;
  return readSigned<T>(token, now, `state:${key}`);
}

// ---------- token de rotina ----------
export function checkCronToken(authorization: string | null | undefined): boolean {
  const expected = process.env.CRON_TOKEN || "";
  if (expected.length < 16 || !authorization) return false;
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return m ? safeEqual(m[1], expected) : false;
}

// Rotas que aceitam o token de rotina além do login.
export const CRON_PATHS = ["/api/instagram/sync", "/api/instagram/report", "/api/instagram/publish-due", "/api/estudio/worker"];

// ---------- freio de tentativas (em memória) ----------
// A chave é o IP e também o e-mail: trocar de IP não libera insistir na mesma conta.
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60_000;

export function loginAllowed(key: string, now: number = Date.now()): boolean {
  const a = attempts.get(key);
  if (!a || a.resetAt < now) return true;
  return a.count < MAX_ATTEMPTS;
}

export function registerLoginFailure(key: string, now: number = Date.now()): void {
  const a = attempts.get(key);
  if (!a || a.resetAt < now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else a.count += 1;
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.resetAt < now) attempts.delete(k);
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
