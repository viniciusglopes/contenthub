import { decrypt, encrypt, publicCredentials } from "@/lib/crypto";
import SocialAccount from "@/models/SocialAccount";
import { InstagramApiError, InstagramClient, type FetchLike, getDefaultFetch } from "./client";
import { daysLeft, establishToken, isProfessionalAccount, planTokenAction, renewToken } from "./token";
import { ensureMock } from "./mock";

/* eslint-disable @typescript-eslint/no-explicit-any */

export class FriendlyError extends Error {
  status: number;
  field?: string;
  constructor(message: string, status = 400, field?: string) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

export function toFriendly(e: unknown): FriendlyError {
  if (e instanceof FriendlyError) return e;
  if (e instanceof InstagramApiError) {
    const status = e.kind === "limite" ? 429 : e.kind === "rede" || e.kind === "temporario" ? 502 : 400;
    return new FriendlyError(e.friendly, status, e.kind === "token_invalido" ? "token" : undefined);
  }
  if (e instanceof Error && e.name === "CryptoConfigError") return new FriendlyError(e.message, 503);
  return new FriendlyError("Algo deu errado no servidor. Tente de novo; se continuar, avise o Billy.", 500);
}

export function accountToken(account: any): string {
  const stored = account?.credentials?.accessToken;
  if (!stored) throw new FriendlyError("Essa conta ainda não tem token. Cole um token para conectar.", 400, "token");
  return decrypt(stored);
}

/** O que a tela recebe de uma conta: nunca o token. */
export function publicAccount(account: any) {
  const a = typeof account.toObject === "function" ? account.toObject() : account;
  const { values, filled } = publicCredentials(a.credentials);
  return {
    _id: String(a._id),
    project: a.project,
    platform: a.platform,
    accountName: a.accountName,
    accountId: a.accountId,
    credentials: values,
    credentialsFilled: filled,
    active: a.active,
    lastSync: a.lastSync,
    lastSyncError: a.lastSyncError || "",
    lastSyncStats: a.lastSyncStats || null,
    tokenExpiresAt: a.tokenExpiresAt,
    tokenExpiryEstimated: Boolean(a.tokenExpiryEstimated),
    tokenDaysLeft: daysLeft(a.tokenExpiresAt),
    tokenAction: a.platform === "instagram" && filled.accessToken ? planTokenAction({
      obtainedAt: a.tokenObtainedAt,
      expiresAt: a.tokenExpiresAt,
      expiryEstimated: a.tokenExpiryEstimated,
    }) : null,
    connected: a.platform === "instagram" && Boolean(filled.accessToken && a.username),
    username: a.username || "",
    accountType: a.accountType || "",
    followersCount: a.followersCount ?? null,
    profilePictureUrl: a.profilePictureUrl || "",
  };
}

function cleanToken(raw: string): string {
  return String(raw || "").replace(/\s+/g, "").replace(/^Bearer/i, "");
}

/** Cola o token -> valida em /me -> guarda criptografado com validade. */
export async function connectInstagram(
  input: { project: string; token: string; accountId?: string },
  opts: { fetchImpl?: FetchLike; now?: number } = {}
) {
  ensureMock();
  const fetchImpl = opts.fetchImpl ?? getDefaultFetch();
  const token = cleanToken(input.token);
  if (!input.project) throw new FriendlyError("Escolha o projeto dessa conta.", 400, "project");
  if (token.length < 20)
    throw new FriendlyError("Cole o token inteiro (ele é longo, costuma começar com IG).", 400, "token");

  const me = await new InstagramClient(token, fetchImpl).getMe();
  if (!me.userId || !me.username)
    throw new FriendlyError("O Instagram não devolveu os dados da conta. Gere um token novo e tente de novo.", 400, "token");
  if (!isProfessionalAccount(me.accountType))
    throw new InstagramApiError("conta_nao_profissional");

  const established = await establishToken(token, {
    appSecret: process.env.IG_APP_SECRET,
    fetchImpl,
    now: opts.now,
  });

  const fields = {
    project: input.project,
    platform: "instagram",
    accountName: `@${me.username}`,
    accountId: me.userId,
    username: me.username,
    accountType: me.accountType || "",
    followersCount: me.followersCount ?? null,
    mediaCount: me.mediaCount ?? null,
    profilePictureUrl: me.profilePictureUrl || "",
    "credentials.accessToken": encrypt(established.token),
    tokenObtainedAt: established.obtainedAt,
    tokenExpiresAt: established.expiresAt,
    tokenExpiryEstimated: established.expiryEstimated,
    lastSyncError: "",
    active: true,
  };

  // Mesma conta do Instagram no mesmo projeto: atualiza em vez de duplicar.
  const existing = input.accountId
    ? await SocialAccount.findById(input.accountId)
    : await SocialAccount.findOne({ project: input.project, platform: "instagram", accountId: me.userId });
  const account = existing
    ? await SocialAccount.findByIdAndUpdate(existing._id, { $set: fields }, { returnDocument: "after" })
    : await SocialAccount.create({
        ...fields,
        credentials: { accessToken: fields["credentials.accessToken"] },
      });
  return account;
}

export async function testInstagram(accountId: string, opts: { fetchImpl?: FetchLike } = {}) {
  ensureMock();
  const account = await SocialAccount.findById(accountId);
  if (!account) throw new FriendlyError("Conta não encontrada.", 404);
  const me = await new InstagramClient(accountToken(account), opts.fetchImpl ?? getDefaultFetch()).getMe();
  account.username = me.username || account.username;
  account.accountName = me.username ? `@${me.username}` : account.accountName;
  account.accountType = me.accountType || account.accountType;
  if (me.followersCount != null) account.followersCount = me.followersCount;
  if (me.profilePictureUrl) account.profilePictureUrl = me.profilePictureUrl;
  await account.save();
  return account;
}

/** Renova agora. Devolve aviso amigável quando a Meta ainda não deixa (menos de 24h). */
export async function renewInstagram(
  accountId: string,
  opts: { fetchImpl?: FetchLike; now?: number } = {}
) {
  ensureMock();
  const account = await SocialAccount.findById(accountId);
  if (!account) throw new FriendlyError("Conta não encontrada.", 404);
  const now = opts.now ?? Date.now();
  const age = account.tokenObtainedAt ? now - new Date(account.tokenObtainedAt).getTime() : Infinity;
  if (age < 86_400_000)
    throw new FriendlyError(
      "A Meta só deixa renovar um token com mais de 24 horas. O sistema renova sozinho na próxima sincronização depois disso.",
      409
    );
  const renewed = await renewToken(accountToken(account), { fetchImpl: opts.fetchImpl, now });
  account.set("credentials.accessToken", encrypt(renewed.token));
  account.tokenObtainedAt = renewed.obtainedAt;
  account.tokenExpiresAt = renewed.expiresAt;
  account.tokenExpiryEstimated = false;
  await account.save();
  return account;
}
