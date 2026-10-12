import { json, route } from "@/lib/api";
import { clearLoginFailures, loginAllowed, registerLoginFailure } from "@/lib/auth";
import { brandVars, publicBrand } from "@/lib/brand";
import { FriendlyError } from "@/lib/errors";
import { acceptInvite, readInvite } from "@/lib/invites";
import { clientIp, setSessionCookie } from "@/lib/session";

// Tela do convite: público, mas só responde a quem tem o código (256 bits) e com freio por IP.
function brake(ip: string) {
  if (!loginAllowed(`convite:${ip}`)) throw new FriendlyError("Muitas tentativas. Espere 10 minutos e tente de novo.", 429);
}

export const GET = route("public", async ({ req, params }) => {
  const ip = clientIp(req);
  brake(ip);
  try {
    const { invite, organization, user } = await readInvite(params.token);
    const brand = publicBrand(organization);
    return json({
      kind: invite.kind,
      organizationName: organization.name,
      email: invite.kind === "reset" ? user.email : invite.email,
      name: invite.kind === "reset" ? user.name : invite.name,
      expiresAt: invite.expiresAt,
      brand,
      vars: brandVars(brand.color),
    });
  } catch (e) {
    registerLoginFailure(`convite:${ip}`);
    throw e;
  }
});

export const POST = route("public", async ({ req, params, body }) => {
  const ip = clientIp(req);
  brake(ip);
  const b = await body();
  let user;
  try {
    user = await acceptInvite(
      params.token,
      { name: b.name, email: b.email, password: String(b.password || "") },
      { ip }
    );
  } catch (e) {
    if (e instanceof FriendlyError && e.status === 410) registerLoginFailure(`convite:${ip}`);
    throw e;
  }
  clearLoginFailures(`convite:${ip}`);
  user.lastLoginAt = new Date();
  await user.save();
  const res = json({ ok: true });
  setSessionCookie(res, { uid: String(user._id), sv: user.sessionVersion });
  return res;
});
