import { json, route } from "@/lib/api";
import { FriendlyError, notFound } from "@/lib/errors";
import { audit, publicUser } from "@/lib/orgs";
import { clientIp } from "@/lib/session";
import User from "@/models/User";

// Ativar/desativar ou mudar o papel de alguém DA MINHA organização.
export const PUT = route("owner", async ({ org, params, id, body, session, req }) => {
  const s = session!;
  const user = await User.findOne({ _id: id(params.id, "Usuário"), organization: org });
  if (!user) throw notFound("Usuário");
  if (user.role === "platform_admin" && !s.isAdmin) throw notFound("Usuário");
  const b = await body();
  const wasOwner = user.active && user.role !== "member";
  const self = String(user._id) === s.userId;
  if (b.active !== undefined) {
    if (self) throw new FriendlyError("Você não pode desativar o seu próprio acesso.", 400);
    user.active = Boolean(b.active);
    if (!user.active) user.sessionVersion += 1;
  }
  if (b.role !== undefined && user.role !== "platform_admin") {
    if (!["owner", "member"].includes(b.role)) throw new FriendlyError("Papel inválido.", 400, "role");
    if (self && b.role !== user.role) throw new FriendlyError("Peça a outro dono para mudar o seu papel.", 400);
    user.role = b.role;
  }
  // A organização nunca fica sem dono ativo.
  if (
    wasOwner &&
    (!user.active || user.role === "member") &&
    !(await User.exists({ organization: org, role: { $in: ["owner", "platform_admin"] }, active: true, _id: { $ne: user._id } }))
  )
    throw new FriendlyError("A conta precisa de pelo menos um dono ativo.", 400);
  await user.save();
  await audit({ action: "usuario.alterado", actor: s.user, organization: org, target: user.email, ip: clientIp(req), meta: { active: user.active, role: user.role } });
  return json(publicUser(user));
});
