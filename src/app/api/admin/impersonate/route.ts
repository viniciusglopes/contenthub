import { json, route } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { audit } from "@/lib/orgs";
import { clientIp, setSessionCookie } from "@/lib/session";
import Organization from "@/models/Organization";

// "Entrar como": o administrador passa a ver os dados de um cliente. Fica registrado
// (quem, qual cliente, quando, IP) e a tela mostra a faixa "você está vendo como X".
export const POST = route("admin", async ({ body, id, session, req }) => {
  const s = session!;
  const organization = await Organization.findById(id((await body()).organization, "Cliente"));
  if (!organization) throw notFound("Cliente");
  await audit({ action: "impersonacao.inicio", actor: s.user, organization: organization._id, target: organization.name, ip: clientIp(req) });
  const res = json({ ok: true, organization: { _id: String(organization._id), name: organization.name } });
  setSessionCookie(res, { uid: s.userId, sv: s.user.sessionVersion, imp: String(organization._id) });
  return res;
});

export const DELETE = route("admin", async ({ session, req }) => {
  const s = session!;
  if (s.impersonating)
    await audit({ action: "impersonacao.fim", actor: s.user, organization: s.orgId, target: s.organization.name, ip: clientIp(req) });
  const res = json({ ok: true });
  setSessionCookie(res, { uid: s.userId, sv: s.user.sessionVersion });
  return res;
});
