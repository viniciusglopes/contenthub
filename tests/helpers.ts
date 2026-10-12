/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";
import { SESSION_COOKIE, createSessionToken, hashPassword } from "@/lib/auth";
import Organization from "@/models/Organization";
import User from "@/models/User";

export function setTestEnv() {
  process.env.AUTH_SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
  process.env.CONTENTHUB_ENC_KEY = "c".repeat(64);
  process.env.CRON_TOKEN = "token-de-rotina-de-teste-123456";
  delete process.env.IG_APP_SECRET;
  delete process.env.IG_MOCK;
  delete process.env.APP_URL;
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
}

export const PASSWORD = "senha-de-teste-123";
let hashed: string | null = null;

export async function makeUser(organization: unknown, role: string, email: string, extra: Record<string, unknown> = {}) {
  hashed ??= await hashPassword(PASSWORD);
  return User.create({ name: email.split("@")[0], email, passwordHash: hashed, role, organization, ...extra });
}

export async function makeOrg(name: string, slug: string, extra: Record<string, unknown> = {}) {
  return Organization.create({ name, slug, ...extra });
}

export const cookieFor = (user: any, imp?: string) =>
  `${SESSION_COOKIE}=${createSessionToken({ uid: String(user._id), sv: user.sessionVersion, imp })}`;

export interface Call {
  method?: string;
  path: string;
  body?: unknown;
  cookie?: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
}

/** Chama o handler da rota como o Next chamaria, com cookie e parâmetros. */
export async function call(handler: any, c: Call) {
  const headers: Record<string, string> = { "x-forwarded-for": "10.0.0.1", ...(c.headers || {}) };
  if (c.cookie) headers.cookie = c.cookie;
  if (c.body !== undefined) headers["content-type"] = "application/json";
  const req = new NextRequest(`http://localhost${c.path}`, {
    method: c.method || "GET",
    headers,
    body: c.body !== undefined ? JSON.stringify(c.body) : undefined,
  });
  const res: Response = await handler(req, { params: Promise.resolve(c.params || {}) });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* redirecionamento ou corpo vazio */
  }
  return { status: res.status, text, data, headers: res.headers };
}

export function setCookieValue(headers: Headers, name: string): string {
  const all = headers.getSetCookie?.() ?? [];
  const hit = all.find((c) => c.startsWith(`${name}=`));
  return hit ? hit.split(";")[0] : "";
}
