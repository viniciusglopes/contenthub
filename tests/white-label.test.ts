/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { SESSION_COOKIE, readSessionToken, verifyPassword } from "@/lib/auth";
import { brandVars, cleanLogo, luminance, publicBrand } from "@/lib/brand";
import { decrypt } from "@/lib/crypto";
import { setFetchOverride } from "@/lib/instagram/client";
import { mockFetch } from "@/lib/instagram/mock";
import { AUTHORIZE_URL, OAUTH_COOKIE } from "@/lib/instagram/oauth";
import { INVITE_DAYS, acceptInvite, createInvite, readInvite } from "@/lib/invites";
import { migrateToWhiteLabel } from "@/lib/migration";
import { ensureAdmin } from "@/lib/orgs";
import AuditLog from "@/models/AuditLog";
import Invite from "@/models/Invite";
import Organization from "@/models/Organization";
import Project from "@/models/Project";
import SocialAccount from "@/models/SocialAccount";
import User from "@/models/User";
import * as login from "@/app/api/auth/login/route";
import * as brandRoute from "@/app/api/auth/brand/route";
import * as inviteRoute from "@/app/api/auth/invite/[token]/route";
import * as invites from "@/app/api/invites/route";
import * as inviteById from "@/app/api/invites/[id]/route";
import * as me from "@/app/api/me/route";
import * as projects from "@/app/api/projects/route";
import * as team from "@/app/api/team/route";
import * as adminOrgs from "@/app/api/admin/organizations/route";
import * as adminOrg from "@/app/api/admin/organizations/[id]/route";
import * as impersonate from "@/app/api/admin/impersonate/route";
import * as oauthStart from "@/app/api/instagram/oauth/start/route";
import * as oauthCallback from "@/app/api/instagram/oauth/callback/route";
import { PASSWORD, call, cookieFor, makeOrg, makeUser, setCookieValue, setTestEnv } from "./helpers";

const DAY = 86_400_000;
let mongo: MongoMemoryServer;
let admin: any, orgA: any, orgB: any, ownerA: any, ownerB: any, memberA: any, projA: any, projB: any;

beforeAll(async () => {
  setTestEnv();
  setFetchOverride(mockFetch());
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("whitelabel"));
  const home = await makeOrg("Vínculo Digital", "vinculo-digital");
  admin = await makeUser(home._id, "platform_admin", "admin@plataforma.test");
  orgA = await makeOrg("Cliente Alfa", "cliente-alfa", { brand: { displayName: "Alfa Estúdio", color: "#22c55e" } });
  orgB = await makeOrg("Cliente Beta", "cliente-beta");
  ownerA = await makeUser(orgA._id, "owner", "dona@alfa.test");
  memberA = await makeUser(orgA._id, "member", "membro@alfa.test");
  ownerB = await makeUser(orgB._id, "owner", "dona@beta.test");
  projA = await Project.create({ organization: orgA._id, name: "Projeto Alfa", slug: "projeto" });
  projB = await Project.create({ organization: orgB._id, name: "Projeto Beta", slug: "projeto" });
});
afterAll(async () => {
  setFetchOverride(null);
  await mongoose.disconnect();
  await mongo.stop();
});

describe("login com e-mail e senha", () => {
  const post = (body: unknown, ip = "10.1.1.1") => call(login.POST, { method: "POST", path: "/api/auth/login", body, headers: { "x-forwarded-for": ip } });

  it("entra com a senha certa: cookie httpOnly assinado, sem papel nem organização dentro", async () => {
    const r = await post({ email: " Dona@Alfa.test ", password: PASSWORD });
    expect(r.status).toBe(200);
    const raw = r.headers.getSetCookie().find((c) => c.startsWith(SESSION_COOKIE))!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=lax/i);
    const payload = readSessionToken(raw.split(";")[0].split("=")[1]);
    expect(Object.keys(payload!).sort()).toEqual(["exp", "sv", "uid"]);
    expect(payload!.uid).toBe(String(ownerA._id));
    expect((await User.findById(ownerA._id))!.lastLoginAt).toBeInstanceOf(Date);
  });

  it("mesma resposta para senha errada, e-mail inexistente, usuário e cliente desativados", async () => {
    const off = await makeUser(orgA._id, "member", "off@alfa.test", { active: false });
    const dead = await makeOrg("Desligado", "desligado", { active: false });
    await makeUser(dead._id, "owner", "dona@desligado.test");
    const answers = [];
    for (const [i, email] of ["dona@alfa.test", "ninguem@alfa.test", off.email, "dona@desligado.test"].entries()) {
      const r = await post({ email, password: i === 0 ? "senha-errada-999" : PASSWORD }, `10.2.0.${i}`);
      answers.push(`${r.status} ${r.text}`);
      expect(r.headers.getSetCookie()).toEqual([]);
    }
    expect(new Set(answers).size).toBe(1);
    expect(answers[0]).toMatch(/^401 .*E-mail ou senha incorretos/);
  });

  it("freio: depois de 8 erros no mesmo e-mail, bloqueia mesmo trocando de IP e mesmo com a senha certa", async () => {
    for (let i = 0; i < 8; i++) expect((await post({ email: "membro@alfa.test", password: "errada-000000" }, `10.3.0.${i}`)).status).toBe(401);
    const blocked = await post({ email: "membro@alfa.test", password: PASSWORD }, "10.3.0.99");
    expect(blocked.status).toBe(429);
    expect(blocked.data.error).toMatch(/10 minutos/);
  });

  it("administrador inicial pelas envs: cria uma vez, não duplica, não sobrescreve a senha", async () => {
    expect(await ensureAdmin({ force: true })).toBe("sem_env");
    process.env.ADMIN_EMAIL = "Vinicius@Exemplo.test";
    process.env.ADMIN_PASSWORD = "curta";
    await expect(ensureAdmin({ force: true })).rejects.toThrow(/ADMIN_PASSWORD fraca/);
    process.env.ADMIN_PASSWORD = "senha-inicial-2026";
    expect(await ensureAdmin({ force: true })).toBe("criado");
    const u = await User.findOne({ email: "vinicius@exemplo.test" });
    expect(u).toMatchObject({ role: "platform_admin", active: true });
    expect(String(u!.organization)).toBe(String((await Organization.findOne({ slug: "vinculo-digital" }))!._id));
    expect(u!.passwordHash).not.toContain("senha-inicial");
    process.env.ADMIN_PASSWORD = "outra-senha-2027";
    expect(await ensureAdmin({ force: true })).toBe("existente");
    expect(await verifyPassword("senha-inicial-2026", (await User.findById(u!._id))!.passwordHash)).toBe(true);
    expect(await User.countDocuments({ email: "vinicius@exemplo.test" })).toBe(1);
    expect(await Organization.countDocuments({ slug: "vinculo-digital" })).toBe(1);
    expect((await post({ email: "vinicius@exemplo.test", password: "senha-inicial-2026" }, "10.4.0.1")).status).toBe(200);
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
  });
});

describe("convites", () => {
  const accept = (token: string, body: unknown, ip: string) =>
    call(inviteRoute.POST, { method: "POST", path: "/api/auth/invite/x", params: { token }, body, headers: { "x-forwarded-for": ip } });

  it("admin cria o cliente e recebe o link do dono; o dono define a senha e entra", async () => {
    const created = await call(adminOrgs.POST, { method: "POST", path: "/api/admin/organizations", cookie: cookieFor(admin), body: { name: "Clínica Dr. Waldir", ownerEmail: "waldir@clinica.test" } });
    expect(created.status).toBe(201);
    expect(created.data.organization.slug).toBe("clinica-dr-waldir");
    const token = created.data.link.split("/convite/")[1];
    expect(token.length).toBeGreaterThanOrEqual(43);
    // no banco só o hash
    const stored = await Invite.findOne({ email: "waldir@clinica.test" }).lean<any>();
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(new Date(stored.expiresAt).getTime() - Date.now()).toBeGreaterThan((INVITE_DAYS - 0.01) * DAY);

    const info = await call(inviteRoute.GET, { path: "/api/auth/invite/x", params: { token }, headers: { "x-forwarded-for": "10.5.0.1" } });
    expect(info.data).toMatchObject({ kind: "owner", organizationName: "Clínica Dr. Waldir", email: "waldir@clinica.test" });

    const weak = await accept(token, { name: "Waldir", password: "123" }, "10.5.0.1");
    expect(weak.status).toBe(400);
    expect(weak.data.field).toBe("password");
    // e-mail do convite é fixo: o que vier no corpo é ignorado
    const ok = await accept(token, { name: "Waldir Lopes", email: "outro@intruso.test", password: "senha-do-waldir-1" }, "10.5.0.1");
    expect(ok.status).toBe(200);
    const user = await User.findOne({ email: "waldir@clinica.test" });
    expect(user).toMatchObject({ role: "owner", name: "Waldir Lopes" });
    expect(String(user!.organization)).toBe(created.data.organization._id);
    expect(await User.exists({ email: "outro@intruso.test" })).toBeNull();
    const session = setCookieValue(ok.headers, SESSION_COOKIE);
    const mine = await call(me.GET, { path: "/api/me", cookie: session });
    expect(mine.data).toMatchObject({ organization: { name: "Clínica Dr. Waldir" }, canManage: true, isAdmin: false });

    // USO ÚNICO: o mesmo link de novo não serve
    const again = await accept(token, { name: "Outro", email: "x@y.test", password: "senha-do-outro-1" }, "10.5.0.2");
    expect(again.status).toBe(410);
    expect((await call(inviteRoute.GET, { path: "/api/auth/invite/x", params: { token }, headers: { "x-forwarded-for": "10.5.0.3" } })).status).toBe(410);
    expect(await User.countDocuments({ organization: user!.organization })).toBe(1);
  });

  it("uso único de verdade: dois aceites ao mesmo tempo, só um cria usuário", async () => {
    const { token } = await createInvite({ kind: "member", organization: orgA._id, createdBy: ownerA });
    const results = await Promise.allSettled([
      acceptInvite(token, { name: "Primeiro", email: "p1@alfa.test", password: "senha-forte-111" }),
      acceptInvite(token, { name: "Segundo", email: "p2@alfa.test", password: "senha-forte-222" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await User.countDocuments({ email: { $in: ["p1@alfa.test", "p2@alfa.test"] } })).toBe(1);
  });

  it("vence em 7 dias; cancelado ou de cliente desativado também não vale", async () => {
    const now = Date.now();
    const { token } = await createInvite({ kind: "member", organization: orgA._id, createdBy: ownerA, now });
    await expect(readInvite(token, now + (INVITE_DAYS * DAY - 60_000))).resolves.toBeTruthy();
    await expect(readInvite(token, now + INVITE_DAYS * DAY + 1)).rejects.toMatchObject({ status: 410 });
    await expect(acceptInvite(token, { name: "Atrasado", email: "atrasado@alfa.test", password: "senha-forte-333" }, { now: now + 8 * DAY })).rejects.toMatchObject({ status: 410 });
    expect(await User.exists({ email: "atrasado@alfa.test" })).toBeNull();
    await expect(readInvite("codigo-que-nao-existe")).rejects.toMatchObject({ status: 410 });

    const made = await call(invites.POST, { method: "POST", path: "/api/invites", cookie: cookieFor(ownerA), body: { email: "novo@alfa.test" } });
    expect(made.status).toBe(201);
    const t2 = made.data.link.split("/convite/")[1];
    expect((await call(inviteById.DELETE, { method: "DELETE", path: "/api/invites/x", params: { id: made.data.invite._id }, cookie: cookieFor(ownerA) })).status).toBe(200);
    await expect(readInvite(t2)).rejects.toMatchObject({ status: 410 });

    const { token: t3 } = await createInvite({ kind: "owner", organization: orgB._id, createdBy: admin });
    await Organization.updateOne({ _id: orgB._id }, { active: false });
    await expect(readInvite(t3)).rejects.toMatchObject({ status: 410 });
    await Organization.updateOne({ _id: orgB._id }, { active: true });
  });

  it("dono convida membro só da própria organização; membro não convida; dono não cria dono", async () => {
    const made = await call(invites.POST, { method: "POST", path: "/api/invites", cookie: cookieFor(ownerA), body: { kind: "member", email: "equipe@alfa.test", organization: String(orgB._id) } });
    expect(made.status).toBe(201);
    const inv = await Invite.findById(made.data.invite._id);
    expect(String(inv!.organization)).toBe(String(orgA._id)); // a organização do corpo é ignorada
    expect((await call(invites.POST, { method: "POST", path: "/api/invites", cookie: cookieFor(memberA), body: { email: "x@alfa.test" } })).status).toBe(403);
    expect((await call(invites.POST, { method: "POST", path: "/api/invites", cookie: cookieFor(ownerA), body: { kind: "owner", email: "x@alfa.test" } })).status).toBe(403);
    // e-mail que já é usuário (de qualquer cliente) não recebe convite
    expect((await call(invites.POST, { method: "POST", path: "/api/invites", cookie: cookieFor(ownerA), body: { email: "dona@beta.test" } })).status).toBe(409);
    const list = await call(team.GET, { path: "/api/team", cookie: cookieFor(ownerA) });
    expect(list.data.users.every((u: any) => u.email.endsWith("@alfa.test"))).toBe(true);
    expect(JSON.stringify(list.data)).not.toMatch(/passwordHash|tokenHash|scrypt/);
  });

  it("link de nova senha: troca a senha e derruba as sessões antigas", async () => {
    const oldCookie = cookieFor(await User.findById(memberA._id));
    const made = await call(invites.POST, { method: "POST", path: "/api/invites", cookie: cookieFor(ownerA), body: { kind: "reset", user: String(memberA._id) } });
    const token = made.data.link.split("/convite/")[1];
    const info = await call(inviteRoute.GET, { path: "/api/auth/invite/x", params: { token }, headers: { "x-forwarded-for": "10.6.0.1" } });
    expect(info.data).toMatchObject({ kind: "reset", email: "membro@alfa.test" });
    expect((await accept(token, { password: "senha-nova-do-membro-9" }, "10.6.0.1")).status).toBe(200);
    const fresh = await User.findById(memberA._id);
    expect(await verifyPassword("senha-nova-do-membro-9", fresh!.passwordHash)).toBe(true);
    expect(fresh!.role).toBe("member");
    expect((await call(me.GET, { path: "/api/me", cookie: oldCookie })).status).toBe(401);
    memberA = fresh;
  });
});

describe("impersonação (entrar como)", () => {
  it("só administrador; fica registrada; a faixa sabe quem é; sair volta para casa", async () => {
    for (const u of [ownerA, memberA]) {
      const r = await call(impersonate.POST, { method: "POST", path: "/api/admin/impersonate", cookie: cookieFor(u), body: { organization: String(orgB._id) } });
      expect(r.status).toBe(404);
      expect(r.headers.getSetCookie()).toEqual([]);
    }
    expect((await call(impersonate.POST, { method: "POST", path: "/api/admin/impersonate", cookie: cookieFor(admin), body: { organization: "000000000000000000000000" } })).status).toBe(404);

    const before = await AuditLog.countDocuments({ action: "impersonacao.inicio" });
    const start = await call(impersonate.POST, { method: "POST", path: "/api/admin/impersonate", cookie: cookieFor(admin), body: { organization: String(orgB._id) } });
    expect(start.status).toBe(200);
    const cookie = setCookieValue(start.headers, SESSION_COOKIE);
    const log = await AuditLog.findOne({ action: "impersonacao.inicio" }).sort({ createdAt: -1 }).lean<any>();
    expect(await AuditLog.countDocuments({ action: "impersonacao.inicio" })).toBe(before + 1);
    expect(log).toMatchObject({ actorEmail: "admin@plataforma.test", target: "Cliente Beta", ip: "10.0.0.1" });
    expect(String(log.organization)).toBe(String(orgB._id));

    const who = await call(me.GET, { path: "/api/me", cookie });
    expect(who.data).toMatchObject({ impersonating: true, isAdmin: true, organization: { name: "Cliente Beta" }, user: { email: "admin@plataforma.test" } });
    const list = await call(projects.GET, { path: "/api/projects", cookie });
    expect(list.data.map((p: any) => p.name)).toEqual(["Projeto Beta"]);
    // o que o admin cria "vendo como" fica no cliente visto
    const made = await call(projects.POST, { method: "POST", path: "/api/projects", cookie, body: { name: "Criado pelo suporte" } });
    expect(String((await Project.findOne({ _id: made.data._id, organization: orgB._id }))!.organization)).toBe(String(orgB._id));
    // o detalhe do cliente mostra o registro
    const detail = await call(adminOrg.GET, { path: "/api/admin/organizations/x", params: { id: String(orgB._id) }, cookie });
    expect(detail.data.impersonations[0]).toMatchObject({ action: "impersonacao.inicio", actorEmail: "admin@plataforma.test" });

    const stop = await call(impersonate.DELETE, { method: "DELETE", path: "/api/admin/impersonate", cookie });
    const home = setCookieValue(stop.headers, SESSION_COOKIE);
    expect((await call(me.GET, { path: "/api/me", cookie: home })).data).toMatchObject({ impersonating: false, organization: { name: "Vínculo Digital" } });
    expect(await AuditLog.countDocuments({ action: "impersonacao.fim" })).toBe(1);
  });

  it("'entrar como' dentro do cookie de quem não é admin é ignorado", async () => {
    const forged = cookieFor(ownerA, String(orgB._id));
    const who = await call(me.GET, { path: "/api/me", cookie: forged });
    expect(who.data).toMatchObject({ impersonating: false, organization: { name: "Cliente Alfa" } });
    expect((await call(projects.GET, { path: "/api/projects", cookie: forged })).data.map((p: any) => p.name)).toEqual(["Projeto Alfa"]);
  });

  it("Admin › Clientes: números por cliente; desativar bloqueia o login do cliente sem apagar nada", async () => {
    await SocialAccount.create({ organization: orgA._id, project: projA._id, platform: "instagram", accountName: "@alfa", credentials: { accessToken: "enc:v1:x" }, lastSync: new Date("2026-10-11T12:00:00Z") });
    const list = await call(adminOrgs.GET, { path: "/api/admin/organizations", cookie: cookieFor(admin) });
    const a = list.data.organizations.find((o: any) => o.slug === "cliente-alfa");
    expect(a).toMatchObject({ accounts: 1, projects: 1, active: true, lastSync: "2026-10-11T12:00:00.000Z" });
    expect(a.users).toBeGreaterThanOrEqual(2);
    expect(list.data.orphans).toBe(0);
    expect(JSON.stringify(list.data)).not.toMatch(/enc:v1|passwordHash/);

    const off = await call(adminOrg.PUT, { method: "PUT", path: "/api/admin/organizations/x", params: { id: String(orgA._id) }, cookie: cookieFor(admin), body: { active: false } });
    expect(off.data.active).toBe(false);
    expect((await call(me.GET, { path: "/api/me", cookie: cookieFor(ownerA) })).status).toBe(401);
    expect(await Project.countDocuments({ organization: orgA._id })).toBe(1);
    await call(adminOrg.PUT, { method: "PUT", path: "/api/admin/organizations/x", params: { id: String(orgA._id) }, cookie: cookieFor(admin), body: { active: true } });
    expect((await call(me.GET, { path: "/api/me", cookie: cookieFor(ownerA) })).status).toBe(200);
    const self = await call(adminOrg.PUT, { method: "PUT", path: "/api/admin/organizations/x", params: { id: String(admin.organization) }, cookie: cookieFor(admin), body: { active: false } });
    expect(self.status).toBe(400);
  });
});

describe("marca por organização", () => {
  it("cores legíveis no tema escuro e texto do botão com contraste", () => {
    expect(brandVars("#eab308")["--brand-ink"]).toBe("#000000");
    const navy = brandVars("#0b1f4d");
    expect(navy["--brand-500"]).toBe("#0b1f4d");
    expect(navy["--brand-ink"]).toBe("#ffffff");
    expect(luminance(navy["--brand-400"])).toBeGreaterThanOrEqual(0.3); // texto clareado
    expect(brandVars("javascript:alert(1)")["--brand-500"]).toBe("#eab308");
    expect(publicBrand(null)).toMatchObject({ displayName: "ContentHub", color: "#eab308" });
  });

  it("logo: só https ou imagem embutida pequena", () => {
    expect(cleanLogo("https://cdn.exemplo.com/logo.png")).toBe("https://cdn.exemplo.com/logo.png");
    expect(cleanLogo("data:image/png;base64,iVBORw0KGgo=")).toMatch(/^data:image\/png/);
    for (const bad of ["javascript:alert(1)", "http://sem-https.com/a.png", "data:text/html;base64,PHNjcmlwdD4=", 'https://x.com/a.png" onerror="x', "data:image/png;base64," + "A".repeat(300_000)])
      expect(cleanLogo(bad)).toBeNull();
    expect(cleanLogo("")).toBe("");
  });

  it("tela de entrada: marca pelo slug; slug desconhecido ou cliente desativado cai na marca padrão", async () => {
    const a = await call(brandRoute.GET, { path: "/api/auth/brand?slug=cliente-alfa" });
    expect(a.data.brand).toMatchObject({ displayName: "Alfa Estúdio", color: "#22c55e" });
    expect(Object.keys(a.data).sort()).toEqual(["brand", "vars"]);
    await Organization.updateOne({ _id: orgB._id }, { active: false, "brand.displayName": "Beta Secreta" });
    for (const slug of ["cliente-beta", "nao-existe", "../../x", ""]) {
      const r = await call(brandRoute.GET, { path: `/api/auth/brand?slug=${encodeURIComponent(slug)}` });
      expect(r.data.brand.displayName).toBe("ContentHub");
    }
    await Organization.updateOne({ _id: orgB._id }, { active: true });
  });
});

describe("login pelo Instagram (OAuth) atrás da chave", () => {
  const startFor = (user: any, project: any) => call(oauthStart.GET, { path: `/api/instagram/oauth/start?project=${project._id}`, cookie: cookieFor(user) });
  const back = (user: any, qs: string, nonceCookie: string) =>
    call(oauthCallback.GET, { path: `/api/instagram/oauth/callback?${qs}`, cookie: `${cookieFor(user)}; ${nonceCookie}` });
  const errOf = (r: { headers: Headers }) => new URL(r.headers.get("location")!).searchParams.get("ig_erro");

  it("desligado por padrão: não redireciona para a Meta e a tela sabe que só há o token", async () => {
    const r = await startFor(ownerA, projA);
    expect(r.status).toBe(403);
    expect((await call(me.GET, { path: "/api/me", cookie: cookieFor(ownerA) })).data.features.igOauth).toBe(false);
    process.env.IG_OAUTH_ENABLED = "true"; // ligado mas sem credenciais: continua indisponível
    expect((await startFor(ownerA, projA)).status).toBe(403);
  });

  it("ligado: monta a autorização oficial com state assinado e conclui só para a mesma sessão/organização", async () => {
    Object.assign(process.env, { IG_OAUTH_ENABLED: "true", IG_APP_ID: "1410000000000000", IG_APP_SECRET: "segredo-do-app-de-teste", APP_URL: "https://contenthub.exemplo.test/" });
    const start = await startFor(ownerA, projA);
    expect(start.status).toBe(307);
    const url = new URL(start.headers.get("location")!);
    expect(url.origin + url.pathname).toBe(AUTHORIZE_URL);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "1410000000000000",
      redirect_uri: "https://contenthub.exemplo.test/api/instagram/oauth/callback",
      response_type: "code",
      scope: "instagram_business_basic,instagram_business_manage_insights",
    });
    expect(url.toString()).not.toContain("segredo-do-app");
    const state = url.searchParams.get("state")!;
    const nonce = setCookieValue(start.headers, OAUTH_COOKIE);
    expect(start.headers.getSetCookie().find((c) => c.startsWith(OAUTH_COOKIE))).toMatch(/HttpOnly/i);
    const qs = `code=${encodeURIComponent("codigo-valido#_")}&state=${encodeURIComponent(state)}`;

    // outro cliente com o state da ALFA; mesma dona sem o cookie do navegador; state adulterado; state vencido
    expect(errOf(await back(ownerB, qs, nonce))).toMatch(/venceu ou não começou/);
    expect(errOf(await back(ownerA, qs, `${OAUTH_COOKIE}=outro-nonce`))).toMatch(/venceu ou não começou/);
    expect(errOf(await back(ownerA, `code=x&state=${encodeURIComponent(state.slice(0, -2) + "xx")}`, nonce))).toMatch(/venceu ou não começou/);
    expect(errOf(await back(memberA, qs, nonce))).toMatch(/venceu ou não começou/);
    // admin "vendo como" ALFA não é a dona que começou
    expect(errOf(await back({ _id: admin._id, sessionVersion: admin.sessionVersion }, qs, nonce))).toMatch(/venceu ou não começou/);
    expect(await SocialAccount.countDocuments({ organization: orgA._id, username: "horademudarojogo" })).toBe(0);
    expect(await SocialAccount.countDocuments({ organization: orgB._id })).toBe(0);

    // a pessoa cancelou no Instagram
    const denied = await back(ownerA, `error=access_denied&error_reason=user_denied&state=${encodeURIComponent(state)}`, nonce);
    expect(errOf(denied)).toMatch(/cancelou/);

    // caminho certo: código -> token curto -> token longo -> conta gravada na ALFA, token criptografado
    const ok = await back(ownerA, qs, nonce);
    const dest = new URL(ok.headers.get("location")!);
    expect(dest.origin).toBe("https://contenthub.exemplo.test");
    expect(Object.fromEntries(dest.searchParams)).toMatchObject({ view: "instagram", project: String(projA._id), ig_ok: "horademudarojogo" });
    const acc = await SocialAccount.findOne({ organization: orgA._id, username: "horademudarojogo" }).lean<any>();
    expect(String(acc.project)).toBe(String(projA._id));
    expect(acc.tokenExpiryEstimated).toBe(false);
    expect(decrypt(acc.credentials.accessToken)).toBe("IGAA-token-longo-do-login-0001");
    expect(dest.toString()).not.toContain("IGAA");
  });

  it("projeto de outro cliente no botão Conectar: 404", async () => {
    expect((await startFor(ownerA, projB)).status).toBe(404);
  });
});

describe("migração dos dados antigos", () => {
  it("ensaio não escreve; aplicar move tudo para a organização padrão; rodar de novo não muda nada", async () => {
    const db = mongoose.connection.db!;
    const pid = new mongoose.Types.ObjectId();
    // dados no formato antigo (sem organização) e índices únicos antigos
    await db.collection("projects").insertOne({ _id: pid, name: "Hora de Mudar o Jogo", slug: "hora-de-mudar-o-jogo", active: true });
    await db.collection("posts").insertMany(Array.from({ length: 90 }, (_, i) => ({ project: pid, title: `Reel ${i + 1}`, format: "reel", scheduledDate: new Date(), scheduledTime: "09:00", status: "draft" })));
    await db.collection("socialaccounts").insertOne({ project: pid, platform: "instagram", accountName: "@horademudarojogo" });
    await db.collection("apicredentials").insertOne({ service: "runway", label: "Runway", credentials: {} });
    await db.collection("apicredentials").createIndex({ service: 1 }, { unique: true }); // índice global antigo

    const orgsBefore = await Organization.countDocuments();
    const dry = await migrateToWhiteLabel({ apply: false });
    expect(dry).toMatchObject({ applied: false, movedTotal: 93, orphansAfter: 93 });
    expect(dry.moved).toMatchObject({ Project: 1, Post: 90, SocialAccount: 1, ApiCredential: 1 });
    expect(await db.collection("posts").countDocuments({ organization: { $exists: false } })).toBe(90);
    expect(await Organization.countDocuments()).toBe(orgsBefore);

    const first = await migrateToWhiteLabel({ apply: true });
    expect(first).toMatchObject({ applied: true, movedTotal: 93, orphansAfter: 0 });
    expect(first.droppedIndexes).toEqual(["apicredentials.service_1"]);
    const home = await Organization.findOne({ slug: "vinculo-digital" });
    expect(first.organization.id).toBe(String(home!._id));
    expect(await Project.countDocuments({ organization: home!._id, name: "Hora de Mudar o Jogo" })).toBe(1);
    expect(await mongoose.models.Post.countDocuments({ organization: home!._id })).toBe(90);

    const second = await migrateToWhiteLabel({ apply: true });
    expect(second).toMatchObject({ movedTotal: 0, orphansAfter: 0, droppedIndexes: [] });
    expect(second.organization).toMatchObject({ id: first.organization.id, created: false });
    expect(await Organization.countDocuments({ slug: "vinculo-digital" })).toBe(1);
    expect(await mongoose.models.Post.countDocuments({ organization: home!._id })).toBe(90);

    // os dados antigos não aparecem para nenhum outro cliente; para o dono da casa, sim
    const seenByA = await call(projects.GET, { path: "/api/projects", cookie: cookieFor(ownerA) });
    expect(seenByA.text).not.toContain("Hora de Mudar o Jogo");
    const seenByAdmin = await call(projects.GET, { path: "/api/projects", cookie: cookieFor(admin) });
    expect(seenByAdmin.data.map((p: any) => p.name)).toContain("Hora de Mudar o Jogo");
    // depois da migração dois clientes podem ter projeto com o mesmo endereço
    const indexes = await mongoose.models.ApiCredential.collection.indexes();
    expect(indexes.some((i) => i.name === "organization_1_service_1" && i.unique)).toBe(true);
    expect(indexes.some((i) => i.name === "service_1")).toBe(false);
    await mongoose.models.ApiCredential.create({ organization: orgA._id, service: "runway", label: "Runway da Alfa" });
    await expect(mongoose.models.ApiCredential.create({ organization: orgA._id, service: "runway", label: "repetida" })).rejects.toThrow(/duplicate|E11000/);
  });

  it("antes da migração, registro sem organização não aparece para NINGUÉM (nem para o admin)", async () => {
    await mongoose.connection.db!.collection("projects").insertOne({ name: "Órfão", slug: "orfao", active: true });
    for (const u of [admin, ownerA, ownerB]) {
      const r = await call(projects.GET, { path: "/api/projects", cookie: cookieFor(u) });
      expect(r.text).not.toContain("Órfão");
    }
    const list = await call(adminOrgs.GET, { path: "/api/admin/organizations", cookie: cookieFor(admin) });
    expect(list.data.orphans).toBe(1); // o admin é avisado de que falta migrar
  });
});
