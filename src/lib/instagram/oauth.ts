import type { Types } from "mongoose";
import { randomToken, readState, signState } from "@/lib/auth";
import { FriendlyError } from "@/lib/errors";
import { saveConnection } from "./accounts";
import { InstagramApiError, InstagramClient, type FetchLike, getDefaultFetch } from "./client";
import { ensureMock, mockEnabled } from "./mock";

// "Login da empresa no Instagram" (Business Login for Instagram), conferido na documentação
// oficial da Meta em 12/10/2026:
//   1) GET  https://www.instagram.com/oauth/authorize
//        client_id, redirect_uri, response_type=code, scope (vírgulas), state
//   2) volta em redirect_uri?code=...#_   (o "#_" não faz parte do código; o código vale 1h, uso único)
//      se a pessoa cancelar: ?error=access_denied&error_reason=user_denied&error_description=...
//   3) POST https://api.instagram.com/oauth/access_token   (formulário)
//        client_id, client_secret, grant_type=authorization_code, redirect_uri, code
//        resposta: {"data":[{"access_token","user_id","permissions"}]}  (token curto, 1h)
//   4) GET  https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=...
//        resposta: {"access_token","token_type","expires_in"}  (token longo, 60 dias)
// client_id/client_secret são o "ID do app do Instagram" e o "Chave secreta do app do Instagram"
// (Painel > Instagram > Configuração da API com login do Instagram), NÃO os do app da Meta.
//
// Fica atrás de IG_OAUTH_ENABLED porque só funciona para contas de fora depois da análise
// do app pela Meta (acesso avançado). Ver docs/meta-analise-do-app.md.

export const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
export const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
export const OAUTH_COOKIE = "ch_ig_oauth";
export const STATE_TTL_MS = 10 * 60_000;

export function oauthRedirectUri(): string {
  if (process.env.IG_OAUTH_REDIRECT_URI) return process.env.IG_OAUTH_REDIRECT_URI;
  const base = (process.env.APP_URL || "").replace(/\/+$/, "");
  return base ? `${base}/api/instagram/oauth/callback` : "";
}

/** Motivo de o login pelo Instagram não estar disponível ("" = disponível). */
export function oauthUnavailableReason(): string {
  if (process.env.IG_OAUTH_ENABLED !== "true") return "desligado";
  if (!process.env.IG_APP_ID || !process.env.IG_APP_SECRET) return "faltam IG_APP_ID e IG_APP_SECRET";
  if (!oauthRedirectUri()) return "falta APP_URL";
  return "";
}

export const oauthEnabled = () => oauthUnavailableReason() === "";

export function oauthScopes(): string[] {
  if (process.env.IG_OAUTH_SCOPES) return process.env.IG_OAUTH_SCOPES.split(/[\s,]+/).filter(Boolean);
  const scopes = ["instagram_business_basic", "instagram_business_manage_insights"];
  if (process.env.IG_PUBLISH_ENABLED === "true") scopes.push("instagram_business_content_publish");
  return scopes;
}

export interface OAuthState {
  org: string;
  uid: string;
  project: string;
  nonce: string;
  exp: number;
}

/** Monta o endereço de autorização com um `state` assinado, amarrado a usuário e organização. */
export function startOAuth(input: { org: Types.ObjectId; userId: string; project: string }, now: number = Date.now()) {
  if (!oauthEnabled()) throw new FriendlyError("O login pelo Instagram ainda não está liberado. Use o token.", 403);
  const nonce = randomToken(16);
  const state = signState({ org: String(input.org), uid: input.userId, project: input.project, nonce }, STATE_TTL_MS, now);
  const redirectUri = oauthRedirectUri();
  // Modo demonstração: não sai para a Meta; volta direto como se a pessoa tivesse autorizado.
  if (mockEnabled()) {
    const back = new URL(redirectUri);
    back.searchParams.set("code", "codigo-de-demonstracao#_");
    back.searchParams.set("state", state);
    return { url: back.toString(), state, nonce };
  }
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", process.env.IG_APP_ID || "");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", oauthScopes().join(","));
  url.searchParams.set("state", state);
  return { url: url.toString(), state, nonce };
}

/**
 * Confere o `state`: assinatura, validade, mesmo usuário, mesma organização e o mesmo
 * navegador que começou (nonce no cookie). Qualquer diferença: recusa.
 */
export function checkState(
  raw: string | null | undefined,
  expected: { org: Types.ObjectId; userId: string; nonce: string | undefined },
  now: number = Date.now()
): OAuthState {
  const state = readState<OAuthState>(raw, now);
  const ok =
    state &&
    state.uid === expected.userId &&
    state.org === String(expected.org) &&
    typeof state.nonce === "string" &&
    Boolean(expected.nonce) &&
    state.nonce === expected.nonce;
  if (!ok || !state)
    throw new FriendlyError("A autorização do Instagram venceu ou não começou neste navegador. Clique em Conectar de novo.", 400);
  return state;
}

/** Passo 3: código -> token curto. Aceita a resposta embrulhada em `data` e a plana. */
export async function exchangeCode(rawCode: string, fetchImpl: FetchLike = getDefaultFetch()): Promise<{ token: string; userId: string }> {
  const code = String(rawCode || "").replace(/#_$/, "").trim();
  if (!code) throw new FriendlyError("O Instagram não devolveu o código de autorização. Tente conectar de novo.", 400);
  const body = new URLSearchParams({
    client_id: process.env.IG_APP_ID || "",
    client_secret: process.env.IG_APP_SECRET || "",
    grant_type: "authorization_code",
    redirect_uri: oauthRedirectUri(),
    code,
  }).toString();
  let res;
  try {
    res = await fetchImpl(TOKEN_URL, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  } catch {
    throw new InstagramApiError("rede");
  }
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const data: any = await res.json().catch(() => null);
  const item = data?.data?.[0] ?? data;
  if (!res.ok || !item?.access_token) {
    // Nunca devolver o corpo cru: pode trazer dado do app. Só a mensagem da Meta.
    const detail = typeof data?.error_message === "string" ? ` Detalhe: ${data.error_message}` : "";
    throw new FriendlyError(`O Instagram não aceitou a autorização. Clique em Conectar de novo.${detail}`, 400);
  }
  return { token: String(item.access_token), userId: String(item.user_id ?? "") };
}

/** Passos 3 e 4 + gravação: termina a conexão começada no botão "Conectar Instagram". */
export async function finishOAuth(
  org: Types.ObjectId,
  input: { code: string; project: string },
  opts: { fetchImpl?: FetchLike; now?: number } = {}
) {
  ensureMock();
  const fetchImpl = opts.fetchImpl ?? getDefaultFetch();
  const now = opts.now ?? Date.now();
  const short = await exchangeCode(input.code, fetchImpl);
  const long = await new InstagramClient(short.token, fetchImpl).exchangeForLongLived(process.env.IG_APP_SECRET || "");
  if (!long.accessToken) throw new FriendlyError("O Instagram não devolveu o token de longa duração. Tente de novo.", 502);
  const me = await new InstagramClient(long.accessToken, fetchImpl).getMe();
  return saveConnection(org, { project: input.project }, me, {
    token: long.accessToken,
    obtainedAt: new Date(now),
    expiresAt: new Date(now + long.expiresIn * 1000),
    expiryEstimated: false,
    exchanged: true,
  });
}
