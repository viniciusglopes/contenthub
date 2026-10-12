import type { Types } from "mongoose";
import Invite from "@/models/Invite";
import Organization from "@/models/Organization";
import User from "@/models/User";
import { hashPassword, passwordProblem, randomToken, sha256 } from "@/lib/auth";
import { FriendlyError } from "@/lib/errors";
import { audit, cleanEmail } from "@/lib/orgs";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const INVITE_DAYS = 7;
export type InviteKind = "owner" | "member" | "reset";

const GONE = "Esse link não vale mais (já foi usado, venceu ou foi cancelado). Peça um novo a quem te convidou.";

/** Cria o convite e devolve o código UMA vez (no banco fica só o hash). */
export async function createInvite(input: {
  kind: InviteKind;
  organization: Types.ObjectId;
  email?: string;
  name?: string;
  user?: Types.ObjectId;
  createdBy?: any;
  ip?: string;
  now?: number;
}): Promise<{ invite: any; token: string; path: string }> {
  const now = input.now ?? Date.now();
  const email = input.email ? cleanEmail(input.email) : "";
  if (input.email && !email) throw new FriendlyError("Esse e-mail não parece válido.", 400, "email");
  if (input.kind !== "reset" && email && (await User.exists({ email })))
    throw new FriendlyError("Já existe um usuário com esse e-mail.", 409, "email");
  const token = randomToken(32);
  const invite = await Invite.create({
    tokenHash: sha256(token),
    kind: input.kind,
    organization: input.organization,
    email,
    name: String(input.name || "").trim().slice(0, 120),
    user: input.user ?? null,
    expiresAt: new Date(now + INVITE_DAYS * 86_400_000),
    createdBy: input.createdBy?._id ?? null,
  });
  await audit({
    action: `convite.criado.${input.kind}`,
    actor: input.createdBy,
    organization: input.organization,
    target: email || String(input.user || ""),
    ip: input.ip,
  });
  return { invite, token, path: `/convite/${token}` };
}

export function inviteStatus(invite: any, now: number = Date.now()): "pendente" | "usado" | "cancelado" | "vencido" {
  if (invite.usedAt) return "usado";
  if (invite.revokedAt) return "cancelado";
  if (new Date(invite.expiresAt).getTime() <= now) return "vencido";
  return "pendente";
}

export function publicInvite(invite: any, now: number = Date.now()) {
  return {
    _id: String(invite._id),
    kind: invite.kind as InviteKind,
    email: invite.email || "",
    name: invite.name || "",
    status: inviteStatus(invite, now),
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  };
}

/** O que a tela do convite pode saber antes de aceitar. */
export async function readInvite(token: string, now: number = Date.now()) {
  const invite: any = token ? await Invite.findOne({ tokenHash: sha256(token) }) : null;
  if (!invite || inviteStatus(invite, now) !== "pendente") throw new FriendlyError(GONE, 410);
  const organization: any = await Organization.findById(invite.organization);
  if (!organization || !organization.active) throw new FriendlyError(GONE, 410);
  const user: any = invite.kind === "reset" ? await User.findById(invite.user) : null;
  if (invite.kind === "reset" && (!user || !user.active)) throw new FriendlyError(GONE, 410);
  return { invite, organization, user };
}

/**
 * Aceita o convite: cria o usuário (ou troca a senha, no link de nova senha).
 * Uso único de verdade: o convite é marcado como usado numa operação atômica ANTES de
 * criar o usuário; dois cliques ao mesmo tempo, só um passa.
 */
export async function acceptInvite(
  token: string,
  input: { name?: string; email?: string; password: string },
  opts: { now?: number; ip?: string } = {}
): Promise<any> {
  const now = opts.now ?? Date.now();
  const { invite, user: resetUser } = await readInvite(token, now);
  const problem = passwordProblem(String(input.password || ""));
  if (problem) throw new FriendlyError(problem, 400, "password");

  let name = "";
  let email = "";
  if (invite.kind !== "reset") {
    name = String(input.name || invite.name || "").trim().slice(0, 120);
    if (name.length < 2) throw new FriendlyError("Diga o seu nome.", 400, "name");
    email = invite.email || cleanEmail(input.email);
    if (!email) throw new FriendlyError("Esse e-mail não parece válido.", 400, "email");
    if (await User.exists({ email }))
      throw new FriendlyError("Já existe um usuário com esse e-mail. Entre com ele ou use outro.", 409, "email");
  }
  const passwordHash = await hashPassword(input.password);

  const claimed: any = await Invite.findOneAndUpdate(
    { _id: invite._id, usedAt: null, revokedAt: null, expiresAt: { $gt: new Date(now) } },
    { $set: { usedAt: new Date(now) } },
    { returnDocument: "after" }
  );
  if (!claimed) throw new FriendlyError(GONE, 410);

  let user: any;
  try {
    if (invite.kind === "reset") {
      user = resetUser;
      user.passwordHash = passwordHash;
      user.passwordSetAt = new Date(now);
      user.sessionVersion += 1;
      await user.save();
    } else {
      user = await User.create({
        name,
        email,
        passwordHash,
        passwordSetAt: new Date(now),
        role: invite.kind === "owner" ? "owner" : "member",
        organization: invite.organization,
      });
    }
  } catch (e) {
    // Não deu para criar (ex.: e-mail acabou de ser usado): devolve o convite.
    await Invite.updateOne({ _id: invite._id }, { $set: { usedAt: null } });
    if ((e as any)?.code === 11000) throw new FriendlyError("Já existe um usuário com esse e-mail.", 409, "email");
    throw e;
  }
  await Invite.updateOne({ _id: invite._id }, { $set: { usedBy: user._id } });
  await audit({ action: `convite.aceito.${invite.kind}`, actor: user, organization: invite.organization, ip: opts.ip });
  return user;
}
