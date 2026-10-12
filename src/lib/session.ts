import type { NextRequest, NextResponse } from "next/server";
import type { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Organization from "@/models/Organization";
import User, { type Role } from "@/models/User";
import { SESSION_COOKIE, SESSION_DAYS, createSessionToken, readSessionToken } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Session {
  user: any;
  userId: string;
  role: Role;
  isAdmin: boolean;
  /** Organização EFETIVA do pedido: a do usuário, ou a que o administrador está vendo. */
  organization: any;
  orgId: Types.ObjectId;
  /** Organização de origem do usuário. */
  homeOrgId: Types.ObjectId;
  impersonating: boolean;
  /** Dono (ou administrador): pode gerir equipe e marca da organização efetiva. */
  canManage: boolean;
}

/**
 * Lê o cookie e confere TUDO no banco: usuário ativo, versão da sessão, organização ativa.
 * A organização nunca vem do navegador: sai do usuário (ou, só para administrador da
 * plataforma, do "entrar como" gravado no cookie assinado).
 */
export async function getSession(req: NextRequest): Promise<Session | null> {
  const payload = readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  await connectDB();
  const user: any = await User.findById(payload.uid);
  if (!user || !user.active || user.sessionVersion !== payload.sv) return null;
  const isAdmin = user.role === "platform_admin";

  let organization: any = null;
  let impersonating = false;
  if (payload.imp && isAdmin && payload.imp !== String(user.organization)) {
    organization = await Organization.findById(payload.imp);
    impersonating = Boolean(organization);
  }
  if (!organization) organization = await Organization.findById(user.organization);
  if (!organization) return null;
  // Cliente desativado: ninguém dele entra. O administrador ainda consegue ver.
  if (!organization.active && !isAdmin) return null;

  return {
    user,
    userId: String(user._id),
    role: user.role,
    isAdmin,
    organization,
    orgId: organization._id,
    homeOrgId: user.organization,
    impersonating,
    canManage: isAdmin || user.role === "owner",
  };
}

export function setSessionCookie(res: NextResponse, data: { uid: string; sv: number; imp?: string }): void {
  res.cookies.set(SESSION_COOKIE, createSessionToken(data), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
