import { json, route } from "@/lib/api";
import { FriendlyError, notFound } from "@/lib/errors";
import { type InviteKind, createInvite, publicInvite } from "@/lib/invites";
import { audit } from "@/lib/orgs";
import { clientIp } from "@/lib/session";
import Invite from "@/models/Invite";
import Organization from "@/models/Organization";
import User from "@/models/User";

// Admin › Clientes: gera convite (dono, membro ou nova senha) para um cliente, sem precisar "entrar como".
export const POST = route("admin", async ({ params, id, body, session, req }) => {
  const organization = await Organization.findById(id(params.id, "Cliente"));
  if (!organization) throw notFound("Cliente");
  if (!organization.active) throw new FriendlyError("Ative o cliente antes de convidar alguém.", 400);
  const b = await body();
  const kind = String(b.kind || "owner") as InviteKind;
  if (!["owner", "member", "reset"].includes(kind)) throw new FriendlyError("Tipo de convite inválido.", 400);
  let user;
  if (kind === "reset") {
    user = await User.findOne({ _id: id(b.user, "Usuário"), organization: organization._id });
    if (!user) throw notFound("Usuário");
  }
  const { invite, path } = await createInvite({
    kind,
    organization: organization._id,
    email: kind === "reset" ? undefined : b.email || undefined,
    name: user ? user.name : b.name,
    user: user?._id,
    createdBy: session!.user,
    ip: clientIp(req),
  });
  const base = (process.env.APP_URL || req.nextUrl.origin).replace(/\/+$/, "");
  return json({ invite: publicInvite(invite), link: `${base}${path}` }, 201);
});

// Cancela um convite pendente desse cliente: ?invite=<id>
export const DELETE = route("admin", async ({ params, id, session, req }) => {
  const invite = await Invite.findOneAndUpdate(
    { _id: id(req.nextUrl.searchParams.get("invite"), "Convite"), organization: id(params.id, "Cliente"), usedAt: null, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!invite) throw notFound("Convite");
  await audit({ action: "convite.cancelado", actor: session!.user, organization: invite.organization, target: invite.email, ip: clientIp(req) });
  return json({ ok: true });
});
