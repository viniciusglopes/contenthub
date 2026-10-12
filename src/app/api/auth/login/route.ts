import { authConfigured, clearLoginFailures, loginAllowed, registerLoginFailure, verifyPassword } from "@/lib/auth";
import { json, route } from "@/lib/api";
import { FriendlyError } from "@/lib/errors";
import { audit, cleanEmail, ensureAdmin } from "@/lib/orgs";
import { clientIp, setSessionCookie } from "@/lib/session";
import Organization from "@/models/Organization";
import User from "@/models/User";

// Hash de mentira: quando o e-mail não existe, gasta o mesmo tempo de uma senha errada.
const DUMMY = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export const POST = route("public", async ({ req, body }) => {
  if (!authConfigured())
    throw new FriendlyError("Acesso ainda não configurado no servidor (falta AUTH_SECRET).", 503);
  const ip = clientIp(req);
  const b = await body();
  const email = cleanEmail(b.email);
  const password = String(b.password || "");
  const keys = [`ip:${ip}`, `email:${email}`];
  if (!keys.every((k) => loginAllowed(k)))
    throw new FriendlyError("Muitas tentativas. Espere 10 minutos e tente de novo.", 429);

  await ensureAdmin();
  const user = email ? await User.findOne({ email }) : null;
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY);
  const org = user ? await Organization.findById(user.organization) : null;
  // Mesma resposta para e-mail inexistente, senha errada, usuário ou cliente desativado.
  if (!user || !ok || !user.active || !org || (!org.active && user.role !== "platform_admin")) {
    keys.forEach((k) => registerLoginFailure(k));
    throw new FriendlyError("E-mail ou senha incorretos.", 401, "password");
  }
  keys.forEach(clearLoginFailures);
  user.lastLoginAt = new Date();
  await user.save();
  await audit({ action: "login", actor: user, organization: user.organization, ip });
  const res = json({ ok: true });
  setSessionCookie(res, { uid: String(user._id), sv: user.sessionVersion });
  return res;
});
