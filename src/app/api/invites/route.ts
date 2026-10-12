import { json, route } from "@/lib/api";
import { FriendlyError, notFound } from "@/lib/errors";
import { type InviteKind, createInvite, publicInvite } from "@/lib/invites";
import { clientIp } from "@/lib/session";
import User from "@/models/User";

// Gera link de convite (uso único, 7 dias) para a organização DA SESSÃO.
//   kind=member  dono convida alguém da equipe
//   kind=owner   só o administrador (direto ou "vendo como" o cliente)
//   kind=reset   link de nova senha para um usuário da organização ({ user })
// O link aparece só nesta resposta: no banco fica o hash.
export const POST = route("owner", async ({ org, body, session, id, req }) => {
  const s = session!;
  const b = await body();
  const kind = String(b.kind || "member") as InviteKind;
  if (!["member", "owner", "reset"].includes(kind)) throw new FriendlyError("Tipo de convite inválido.", 400);
  if (kind === "owner" && !s.isAdmin) throw new FriendlyError("Só o administrador convida donos.", 403);

  let user;
  if (kind === "reset") {
    user = await User.findOne({ _id: id(b.user, "Usuário"), organization: org });
    if (!user || (user.role === "platform_admin" && !s.isAdmin)) throw notFound("Usuário");
  }
  const { invite, path } = await createInvite({
    kind,
    organization: org,
    email: kind === "reset" ? undefined : b.email || undefined,
    name: user ? user.name : b.name,
    user: user?._id,
    createdBy: s.user,
    ip: clientIp(req),
  });
  const base = (process.env.APP_URL || req.nextUrl.origin).replace(/\/+$/, "");
  return json({ invite: publicInvite(invite), link: `${base}${path}` }, 201);
});
