import type { Types } from "mongoose";
import { decrypt, encrypt, publicCredentials } from "@/lib/crypto";
import { FriendlyError, notFound, toFriendly } from "@/lib/errors";
import { assertProject } from "@/lib/orgs";
import { toObjectId } from "@/lib/tenant";
import SocialAccount from "@/models/SocialAccount";
import { InstagramApiError, InstagramClient, type FetchLike, type IgProfile, getDefaultFetch } from "./client";
import { type EstablishedToken, daysLeft, establishToken, isProfessionalAccount, planTokenAction, renewToken } from "./token";
import { ensureMock } from "./mock";

/* eslint-disable @typescript-eslint/no-explicit-any */

export { FriendlyError, toFriendly };
type Org = Types.ObjectId;

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

/**
 * Grava a conexão já validada (perfil + token). Serve ao "colar token" e ao login pelo
 * Instagram (OAuth). O projeto TEM de ser da organização; a conta também.
 */
export async function saveConnection(
  org: Org,
  input: { project: string; accountId?: string },
  me: IgProfile,
  established: EstablishedToken
) {
  const projectId = toObjectId(input.project);
  if (!projectId) throw new FriendlyError("Escolha o projeto dessa conta.", 400, "project");
  await assertProject(org, projectId);
  if (!me.userId || !me.username)
    throw new FriendlyError("O Instagram não devolveu os dados da conta. Gere um token novo e tente de novo.", 400, "token");
  if (!isProfessionalAccount(me.accountType)) throw new InstagramApiError("conta_nao_profissional");

  const fields = {
    project: projectId,
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
  let existing: any = null;
  if (input.accountId) {
    const id = toObjectId(input.accountId);
    existing = id ? await SocialAccount.findOne({ _id: id, organization: org }) : null;
    if (!existing) throw notFound("Conta");
  } else {
    existing = await SocialAccount.findOne({ organization: org, project: projectId, platform: "instagram", accountId: me.userId });
  }
  return existing
    ? SocialAccount.findOneAndUpdate({ _id: existing._id, organization: org }, { $set: fields }, { returnDocument: "after" })
    : SocialAccount.create({ ...fields, organization: org, credentials: { accessToken: fields["credentials.accessToken"] } });
}

/** Cola o token -> valida em /me -> guarda criptografado com validade. */
export async function connectInstagram(
  org: Org,
  input: { project: string; token: string; accountId?: string },
  opts: { fetchImpl?: FetchLike; now?: number } = {}
) {
  ensureMock();
  const fetchImpl = opts.fetchImpl ?? getDefaultFetch();
  const token = cleanToken(input.token);
  const projectId = toObjectId(input.project);
  if (!projectId) throw new FriendlyError("Escolha o projeto dessa conta.", 400, "project");
  await assertProject(org, projectId);
  if (token.length < 20)
    throw new FriendlyError("Cole o token inteiro (ele é longo, costuma começar com IG).", 400, "token");

  const me = await new InstagramClient(token, fetchImpl).getMe();
  if (!me.userId || !me.username)
    throw new FriendlyError("O Instagram não devolveu os dados da conta. Gere um token novo e tente de novo.", 400, "token");
  if (!isProfessionalAccount(me.accountType)) throw new InstagramApiError("conta_nao_profissional");
  const established = await establishToken(token, { appSecret: process.env.IG_APP_SECRET, fetchImpl, now: opts.now });
  return saveConnection(org, input, me, established);
}

async function ownAccount(org: Org, accountId: string): Promise<any> {
  const id = toObjectId(accountId);
  const account = id ? await SocialAccount.findOne({ _id: id, organization: org }) : null;
  if (!account) throw notFound("Conta");
  return account;
}

export async function testInstagram(org: Org, accountId: string, opts: { fetchImpl?: FetchLike } = {}) {
  ensureMock();
  const account = await ownAccount(org, accountId);
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
  org: Org,
  accountId: string,
  opts: { fetchImpl?: FetchLike; now?: number } = {}
) {
  ensureMock();
  const account = await ownAccount(org, accountId);
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
