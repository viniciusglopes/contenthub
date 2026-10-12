import type { Types } from "mongoose";
import mongoose from "mongoose";
import AuditLog from "@/models/AuditLog";
import Organization from "@/models/Organization";
import User from "@/models/User";
import Project from "@/models/Project";
import SocialAccount from "@/models/SocialAccount";
import { hashPassword, passwordProblem } from "@/lib/auth";
import { cleanLogo, isHexColor, slugify } from "@/lib/brand";
import { FriendlyError, notFound } from "@/lib/errors";
import { TENANT_MODELS } from "@/lib/tenant";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const DEFAULT_ORG = { name: "Vínculo Digital", slug: "vinculo-digital" };

export async function audit(entry: {
  action: string;
  actor?: any;
  organization?: unknown;
  target?: string;
  ip?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await AuditLog.create({
    action: entry.action,
    actor: entry.actor?._id ?? null,
    actorEmail: entry.actor?.email ?? "",
    organization: entry.organization ?? null,
    target: entry.target ?? "",
    ip: entry.ip ?? "",
    meta: entry.meta ?? null,
  });
}

/** Organização padrão (a do Vinicius). Criar duas vezes não duplica. */
export async function ensureDefaultOrganization(): Promise<any> {
  return Organization.findOneAndUpdate(
    { slug: DEFAULT_ORG.slug },
    { $setOnInsert: { name: DEFAULT_ORG.name, slug: DEFAULT_ORG.slug, active: true } },
    { upsert: true, returnDocument: "after" }
  );
}

export async function uniqueOrgSlug(name: string): Promise<string> {
  const base = slugify(name) || "cliente";
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await Organization.exists({ slug }))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export function cleanEmail(raw: unknown): string {
  const email = String(raw || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 200 ? email : "";
}

let adminChecked = false;
/**
 * Administrador inicial pelas envs ADMIN_EMAIL + ADMIN_PASSWORD. Roda na primeira tentativa
 * de login de cada subida. Se o usuário já existe, NÃO mexe na senha (a não ser que
 * ADMIN_RESET=1, a saída para quem perdeu a senha do administrador).
 */
export async function ensureAdmin(opts: { force?: boolean } = {}): Promise<"criado" | "existente" | "redefinido" | "sem_env"> {
  if (adminChecked && !opts.force) return "existente";
  const email = cleanEmail(process.env.ADMIN_EMAIL);
  const password = process.env.ADMIN_PASSWORD || "";
  if (!email || !password) return "sem_env";
  const problem = passwordProblem(password);
  if (problem) throw new FriendlyError(`ADMIN_PASSWORD fraca: ${problem}`, 503);

  const existing: any = await User.findOne({ email });
  if (existing) {
    adminChecked = true;
    if (process.env.ADMIN_RESET !== "1") return "existente";
    existing.passwordHash = await hashPassword(password);
    existing.passwordSetAt = new Date();
    existing.role = "platform_admin";
    existing.active = true;
    existing.sessionVersion += 1;
    await existing.save();
    await audit({ action: "admin.reset_por_env", actor: existing, organization: existing.organization });
    return "redefinido";
  }
  const org = await ensureDefaultOrganization();
  const user = await User.create({
    name: process.env.ADMIN_NAME || "Administrador",
    email,
    passwordHash: await hashPassword(password),
    passwordSetAt: new Date(),
    role: "platform_admin",
    organization: org._id,
  });
  await audit({ action: "admin.criado_por_env", actor: user, organization: org._id });
  adminChecked = true;
  return "criado";
}

/** Projeto do cliente ou 404: nunca confiar no id que veio do navegador. */
export async function assertProject(org: Types.ObjectId, projectId: Types.ObjectId): Promise<any> {
  const project = await Project.findOne({ _id: projectId, organization: org });
  if (!project) throw notFound("Projeto");
  return project;
}

/** Números por organização para a tela Admin › Clientes. */
export async function organizationStats(): Promise<
  Record<string, { users: number; accounts: number; projects: number; lastSync: Date | null }>
> {
  const out: Record<string, { users: number; accounts: number; projects: number; lastSync: Date | null }> = {};
  const slot = (id: unknown) => (out[String(id)] ??= { users: 0, accounts: 0, projects: 0, lastSync: null });
  for (const u of await User.aggregate([{ $match: { active: true } }, { $group: { _id: "$organization", n: { $sum: 1 } } }]))
    slot(u._id).users = u.n;
  // Contagens que cruzam organizações: só aqui e só para o administrador.
  const accounts = await SocialAccount.aggregate(
    [
      { $match: { "credentials.accessToken": { $exists: true, $ne: "" } } },
      { $group: { _id: "$organization", n: { $sum: 1 }, lastSync: { $max: "$lastSync" } } },
    ],
    { crossOrg: true } as any
  );
  for (const a of accounts) Object.assign(slot(a._id), { accounts: a.n, lastSync: a.lastSync ?? null });
  const projects = await Project.aggregate([{ $match: { active: true } }, { $group: { _id: "$organization", n: { $sum: 1 } } }], {
    crossOrg: true,
  } as any);
  for (const p of projects) slot(p._id).projects = p.n;
  return out;
}

/** Registros sem organização (só existem antes da migração). Ninguém os enxerga pela API. */
export async function countOrphans(): Promise<number> {
  let total = 0;
  for (const name of TENANT_MODELS) {
    const model = mongoose.models[name];
    if (model) total += await model.collection.countDocuments({ organization: { $exists: false } });
  }
  return total;
}

export function publicUser(u: any) {
  return {
    _id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

/** Aplica nome exibido, logo e cor (o que veio) num documento de organização. */
export function applyBrand(organization: any, b: Record<string, any>): void {
  if (b.displayName !== undefined) organization.set("brand.displayName", String(b.displayName).trim().slice(0, 40));
  if (b.color !== undefined) {
    if (b.color !== "" && !isHexColor(b.color)) throw new FriendlyError("Cor inválida. Use o seletor de cor.", 400, "color");
    organization.set("brand.color", b.color);
  }
  if (b.logo !== undefined) {
    const logo = cleanLogo(b.logo);
    if (logo === null)
      throw new FriendlyError("Logo inválido: use um endereço https ou uma imagem PNG, JPG, WEBP ou SVG de até 150 KB.", 400, "logo");
    organization.set("brand.logo", logo);
  }
}
