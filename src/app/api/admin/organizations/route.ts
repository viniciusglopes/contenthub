import { json, route } from "@/lib/api";
import { publicBrand } from "@/lib/brand";
import { FriendlyError } from "@/lib/errors";
import { publishEnabled } from "@/lib/instagram/publish";
import { createInvite } from "@/lib/invites";
import { audit, countOrphans, organizationStats, uniqueOrgSlug } from "@/lib/orgs";
import { clientIp } from "@/lib/session";
import Invite from "@/models/Invite";
import Organization from "@/models/Organization";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Admin › Clientes: todas as organizações com usuários, contas conectadas e última sincronização.
export const GET = route("admin", async () => {
  const [orgs, stats, pending, orphans] = await Promise.all([
    Organization.find().sort({ active: -1, name: 1 }).lean(),
    organizationStats(),
    Invite.aggregate([
      { $match: { usedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } } },
      { $group: { _id: "$organization", n: { $sum: 1 } } },
    ]),
    countOrphans(),
  ]);
  const pendingBy = Object.fromEntries(pending.map((p: any) => [String(p._id), p.n]));
  return json({
    orphans,
    publishGlobal: publishEnabled(),
    organizations: (orgs as any[]).map((o) => ({
      _id: String(o._id),
      name: o.name,
      slug: o.slug,
      active: o.active,
      publishEnabled: o.publishEnabled === true,
      brand: publicBrand(o),
      createdAt: o.createdAt,
      users: stats[String(o._id)]?.users ?? 0,
      accounts: stats[String(o._id)]?.accounts ?? 0,
      projects: stats[String(o._id)]?.projects ?? 0,
      lastSync: stats[String(o._id)]?.lastSync ?? null,
      pendingInvites: pendingBy[String(o._id)] ?? 0,
    })),
  });
});

// Cria o cliente e já devolve o link de convite do dono (um passo só).
export const POST = route("admin", async ({ body, session, req }) => {
  const s = session!;
  const b = await body();
  const name = String(b.name || "").trim().slice(0, 80);
  if (name.length < 2) throw new FriendlyError("Diga o nome do cliente.", 400, "name");
  const organization = await Organization.create({ name, slug: await uniqueOrgSlug(name) });
  const ip = clientIp(req);
  await audit({ action: "cliente.criado", actor: s.user, organization: organization._id, target: name, ip });
  let link = "";
  try {
    const { path } = await createInvite({
      kind: "owner",
      organization: organization._id,
      email: b.ownerEmail || undefined,
      name: b.ownerName,
      createdBy: s.user,
      ip,
    });
    link = `${(process.env.APP_URL || req.nextUrl.origin).replace(/\/+$/, "")}${path}`;
  } catch (e) {
    // E-mail do dono recusado: o cliente não fica criado pela metade.
    await Organization.deleteOne({ _id: organization._id });
    throw e;
  }
  return json({ organization: { _id: String(organization._id), name, slug: organization.slug }, link }, 201);
});
