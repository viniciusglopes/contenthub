import { json, route } from "@/lib/api";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth";
import { brandVars, publicBrand } from "@/lib/brand";
import { FriendlyError } from "@/lib/errors";
import { mockEnabled } from "@/lib/instagram/mock";
import { oauthEnabled } from "@/lib/instagram/oauth";
import { publishSwitch } from "@/lib/workflow";
import { audit } from "@/lib/orgs";
import { clientIp, setSessionCookie } from "@/lib/session";

// Quem sou eu, de qual cliente, com que marca, e o que está ligado.
export const GET = route("org", async ({ session }) => {
  const s = session!;
  const brand = publicBrand(s.organization);
  return json({
    user: { _id: s.userId, name: s.user.name, email: s.user.email, role: s.role },
    organization: { _id: String(s.orgId), name: s.organization.name, slug: s.organization.slug, active: s.organization.active },
    brand,
    vars: brandVars(brand.color),
    isAdmin: s.isAdmin,
    canManage: s.canManage,
    impersonating: s.impersonating,
    features: { igOauth: oauthEnabled(), demo: mockEnabled() },
    publishing: publishSwitch(s.organization),
  });
});

// Minha conta: nome e senha num formulário só. A senha atual só é pedida se a senha mudar.
export const PUT = route("org", async ({ session, body, req }) => {
  const s = session!;
  const b = await body();
  const user = s.user;
  if (b.name !== undefined) {
    const name = String(b.name).trim().slice(0, 120);
    if (name.length < 2) throw new FriendlyError("Diga o seu nome.", 400, "name");
    user.name = name;
  }
  let passwordChanged = false;
  if (b.newPassword) {
    if (!(await verifyPassword(String(b.currentPassword || ""), user.passwordHash)))
      throw new FriendlyError("A senha atual não confere.", 400, "currentPassword");
    const problem = passwordProblem(String(b.newPassword));
    if (problem) throw new FriendlyError(problem, 400, "newPassword");
    user.passwordHash = await hashPassword(String(b.newPassword));
    user.passwordSetAt = new Date();
    user.sessionVersion += 1; // derruba as outras sessões
    passwordChanged = true;
  }
  await user.save();
  const res = json({ ok: true, name: user.name, passwordChanged });
  if (passwordChanged) {
    await audit({ action: "senha.trocada", actor: user, organization: user.organization, ip: clientIp(req) });
    setSessionCookie(res, {
      uid: s.userId,
      sv: user.sessionVersion,
      imp: s.impersonating ? String(s.orgId) : undefined,
    });
  }
  return res;
});
