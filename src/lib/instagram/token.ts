import { InstagramApiError, InstagramClient, type FetchLike, getDefaultFetch } from "./client";

// Token do Instagram: o do painel do app já nasce longo (60 dias); o do fluxo de login
// dura 1h e precisa ser trocado (exige o segredo do app). Renovação: só com mais de 24h
// de idade e antes de vencer.

export const DAY_MS = 86_400_000;
export const TOKEN_LIFETIME_MS = 60 * DAY_MS;
export const RENEW_WHEN_LEFT_MS = 15 * DAY_MS;
export const MIN_AGE_TO_RENEW_MS = DAY_MS;

export type TokenAction = "ok" | "renovar" | "aguardar_24h" | "vencido" | "sem_token";

export interface TokenState {
  obtainedAt?: Date | null;
  expiresAt?: Date | null;
  /** true quando a validade foi presumida (60 dias a partir da colagem) e não informada pela Meta. */
  expiryEstimated?: boolean;
}

export function planTokenAction(s: TokenState, now: number = Date.now()): TokenAction {
  if (!s.expiresAt) return "sem_token";
  const exp = new Date(s.expiresAt).getTime();
  if (exp <= now) return "vencido";
  const wantsRenew = Boolean(s.expiryEstimated) || exp - now <= RENEW_WHEN_LEFT_MS;
  if (!wantsRenew) return "ok";
  const age = s.obtainedAt ? now - new Date(s.obtainedAt).getTime() : Infinity;
  return age >= MIN_AGE_TO_RENEW_MS ? "renovar" : "aguardar_24h";
}

export function daysLeft(expiresAt: Date | string | null | undefined, now: number = Date.now()): number | null {
  if (!expiresAt) return null;
  return Math.floor((new Date(expiresAt).getTime() - now) / DAY_MS);
}

export interface EstablishedToken {
  token: string;
  obtainedAt: Date;
  expiresAt: Date;
  expiryEstimated: boolean;
  exchanged: boolean;
}

/**
 * Recebe o token colado (já validado em /me) e devolve o que deve ser guardado.
 * Com o segredo do app, tenta trocar por um de longa duração; se a Meta recusar
 * (o token colado já é longo), fica com ele e presume 60 dias até a primeira renovação.
 */
export async function establishToken(
  pasted: string,
  opts: { appSecret?: string; fetchImpl?: FetchLike; now?: number } = {}
): Promise<EstablishedToken> {
  const now = opts.now ?? Date.now();
  if (opts.appSecret) {
    try {
      const r = await new InstagramClient(pasted, opts.fetchImpl ?? getDefaultFetch()).exchangeForLongLived(
        opts.appSecret
      );
      if (r.accessToken) {
        return {
          token: r.accessToken,
          obtainedAt: new Date(now),
          expiresAt: new Date(now + r.expiresIn * 1000),
          expiryEstimated: false,
          exchanged: true,
        };
      }
    } catch (e) {
      if (!(e instanceof InstagramApiError) || e.kind === "rede" || e.kind === "temporario") throw e;
      // recusado: o token colado já é de longa duração
    }
  }
  return {
    token: pasted,
    obtainedAt: new Date(now),
    expiresAt: new Date(now + TOKEN_LIFETIME_MS),
    expiryEstimated: true,
    exchanged: false,
  };
}

export async function renewToken(
  current: string,
  opts: { fetchImpl?: FetchLike; now?: number } = {}
): Promise<EstablishedToken> {
  const now = opts.now ?? Date.now();
  const r = await new InstagramClient(current, opts.fetchImpl ?? getDefaultFetch()).refreshLongLived();
  return {
    token: r.accessToken,
    obtainedAt: new Date(now),
    expiresAt: new Date(now + r.expiresIn * 1000),
    expiryEstimated: false,
    exchanged: true,
  };
}

const PROFESSIONAL = new Set(["BUSINESS", "MEDIA_CREATOR", "CREATOR"]);

export function isProfessionalAccount(accountType: string | undefined): boolean {
  // Se a Meta não informar o tipo, não bloqueia: os insights acusam depois.
  return !accountType || PROFESSIONAL.has(accountType.toUpperCase());
}
