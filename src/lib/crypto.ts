import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Criptografia em repouso dos segredos (tokens, chaves de API).
// AES-256-GCM, chave em CONTENTHUB_ENC_KEY (64 hex, base64 de 32 bytes, ou frase que vira SHA-256).
// Formato gravado: enc:v1:<iv>:<tag>:<dados> (base64url).

const PREFIX = "enc:v1:";

export class CryptoConfigError extends Error {}

export function loadKey(raw: string | undefined = process.env.CONTENTHUB_ENC_KEY): Buffer {
  if (!raw || raw.trim().length < 16) {
    throw new CryptoConfigError(
      "CONTENTHUB_ENC_KEY não configurada (ou curta demais). Sem ela o sistema não guarda segredos."
    );
  }
  const v = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, "hex");
  const b64 = Buffer.from(v, "base64");
  if (b64.length === 32 && /^[A-Za-z0-9+/_-]+=*$/.test(v)) return b64;
  return createHash("sha256").update(v, "utf8").digest();
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encrypt(plain: string, key: Buffer = loadKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, data].map((b) => b.toString("base64url")).join(":");
}

export function decrypt(value: string, key: Buffer = loadKey()): string {
  // Valor legado em texto puro (gravado antes da criptografia): devolve como está.
  if (!isEncrypted(value)) return value;
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Segredo gravado em formato inválido.");
  const [iv, tag, data] = parts.map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function encryptIfNeeded(value: string, key: Buffer = loadKey()): string {
  return isEncrypted(value) ? value : encrypt(value, key);
}

// Nomes de campos que nunca saem da API em texto puro.
const SECRET_HINT = /token|secret|apikey|api_key|password|senha|key$/i;

export function isSecretField(name: string): boolean {
  return SECRET_HINT.test(name);
}

/** Criptografa os campos sensíveis de um mapa de credenciais antes de gravar. */
export function sealCredentials(
  creds: Record<string, string | undefined | null>,
  key: Buffer = loadKey()
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = isSecretField(k) ? encryptIfNeeded(String(v), key) : String(v);
  }
  return out;
}

/** O que a API devolve: campos sensíveis viram "preenchido" (true), os demais vão abertos. */
export function publicCredentials(
  creds: Record<string, unknown> | undefined | null
): { values: Record<string, string>; filled: Record<string, boolean> } {
  const values: Record<string, string> = {};
  const filled: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(creds || {})) {
    if (typeof v !== "string" || !v) continue;
    filled[k] = true;
    if (!isSecretField(k) && !isEncrypted(v)) values[k] = v;
  }
  return { values, filled };
}
