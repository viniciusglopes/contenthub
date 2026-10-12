/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Access } from "@/lib/api";
import { OAUTH_COOKIE } from "@/lib/instagram/oauth";
import { connectInstagram } from "@/lib/instagram/accounts";
import { setFetchOverride } from "@/lib/instagram/client";
import { mockFetch } from "@/lib/instagram/mock";
import { syncAccount } from "@/lib/instagram/sync";
import { createInvite } from "@/lib/invites";
import { TENANT_MODELS, TenantScopeError } from "@/lib/tenant";
import ApiCredential from "@/models/ApiCredential";
import { InstagramMedia } from "@/models/InstagramMedia";
import Post from "@/models/Post";
import Project from "@/models/Project";
import SocialAccount from "@/models/SocialAccount";
import { type Call, call, cookieFor, makeOrg, makeUser, setCookieValue, setTestEnv } from "./helpers";

// PROVA DE ISOLAMENTO ENTRE CLIENTES.
// Dois clientes (ALFA e BETA) com dados parecidos. Para CADA rota de /api:
//   1) sem login: 401 (menos as públicas);
//   2) papel errado: membro não entra em rota de dono, ninguém de cliente entra em rota de admin;
//   3) ATAQUE: o dono da ALFA usa os ids da BETA (na rota, no link e no corpo).
//      Resposta 404 (ou lista sem nada da BETA), NENHUM dado da BETA na resposta,
//      e o banco da BETA igual, byte a byte, ao de antes;
//   4) CONTROLE: o mesmo pedido com os ids da própria ALFA funciona (prova que o 404 do
//      ataque veio do isolamento, não de um pedido malformado).
// O inventário é lido do disco: rota nova sem linha na tabela CASES faz o teste falhar.

const API_DIR = path.resolve(import.meta.dirname, "../src/app/api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const NOW = Date.now();

interface Side {
  org: any; owner: any; member: any; project: any; post: any; account: any; other: any; cred: any; invite: any; inviteToken: string;
}
interface World { A: Side; B: Side; admin: any; adminOrg: any }
type Req = Omit<Call, "cookie"> & { expect?: number | number[]; cookie?: string };
interface Case {
  access: Access;
  /** pedidos do dono da ALFA mirando a BETA (`t` = BETA) */
  attack?: (t: Side, me: Side, w: World) => Req[];
  /** o mesmo tipo de pedido mirando a própria ALFA (`t` = ALFA): tem de funcionar */
  own?: (t: Side, w: World) => Req;
  /** por que não há ataque/controle (rotas públicas e de admin) */
  why?: string;
}

const oauthState = { cookie: "", state: "" };

const CASES: Record<string, Case> = {
  // ---- públicas: não leem dado de cliente pelo que vem do navegador
  "POST /api/auth/login": { access: "public", why: "cria sessão; testada em white-label.test.ts" },
  "POST /api/auth/logout": { access: "public", why: "só apaga o cookie" },
  "GET /api/auth/brand": { access: "public", why: "devolve só nome exibido, logo e cor" },
  "GET /api/auth/invite/[token]": { access: "public", why: "exige o código de 256 bits do convite" },
  "POST /api/auth/invite/[token]": { access: "public", why: "exige o código de 256 bits do convite" },
  // ---- admin da plataforma: cruzam clientes por definição; cliente nenhum entra
  "GET /api/admin/organizations": { access: "admin", why: "lista todos os clientes" },
  "POST /api/admin/organizations": { access: "admin", why: "cria cliente" },
  "GET /api/admin/organizations/[id]": { access: "admin", why: "detalhe de um cliente" },
  "PUT /api/admin/organizations/[id]": { access: "admin", why: "edita um cliente" },
  "POST /api/admin/organizations/[id]/invites": { access: "admin", why: "convite para um cliente" },
  "DELETE /api/admin/organizations/[id]/invites": { access: "admin", why: "cancela convite de um cliente" },
  "POST /api/admin/impersonate": { access: "admin", why: "entrar como" },
  "DELETE /api/admin/impersonate": { access: "admin", why: "sair do entrar como" },

  // ---- conta e equipe
  "GET /api/me": { access: "org", attack: () => [{ path: "/api/me", expect: 200 }], own: () => ({ path: "/api/me" }) },
  "PUT /api/me": {
    access: "org",
    attack: (t) => [{ method: "PUT", path: "/api/me", body: { name: "Alfa Dona", organization: String(t.org._id), role: "platform_admin" }, expect: 200 }],
    own: () => ({ method: "PUT", path: "/api/me", body: { name: "Alfa Dona" } }),
  },
  "GET /api/organization": { access: "owner", attack: (t) => [{ path: `/api/organization?id=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/organization" }) },
  "PUT /api/organization": {
    access: "owner",
    attack: (t) => [{ method: "PUT", path: "/api/organization", body: { _id: String(t.org._id), organization: String(t.org._id), displayName: "Alfa Estúdio" }, expect: 200 }],
    own: () => ({ method: "PUT", path: "/api/organization", body: { color: "#22c55e" } }),
  },
  "GET /api/team": { access: "owner", attack: (t) => [{ path: `/api/team?organization=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/team" }) },
  "PUT /api/team/[id]": {
    access: "owner",
    attack: (t) => [
      { method: "PUT", path: "/api/team/x", params: { id: String(t.member._id) }, body: { active: false } },
      { method: "PUT", path: "/api/team/x", params: { id: String(t.owner._id) }, body: { role: "member" } },
    ],
    own: (t) => ({ method: "PUT", path: "/api/team/x", params: { id: String(t.member._id) }, body: { role: "member" } }),
  },
  "POST /api/invites": {
    access: "owner",
    attack: (t) => [
      { method: "POST", path: "/api/invites", body: { kind: "reset", user: String(t.owner._id) } },
      { method: "POST", path: "/api/invites", body: { kind: "owner", organization: String(t.org._id), email: "intruso@alfa.test" }, expect: 403 },
    ],
    own: (t) => ({ method: "POST", path: "/api/invites", body: { kind: "reset", user: String(t.member._id) }, expect: 201 }),
  },
  "DELETE /api/invites/[id]": {
    access: "owner",
    attack: (t) => [{ method: "DELETE", path: "/api/invites/x", params: { id: String(t.invite._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/invites/x", params: { id: String(t.invite._id) } }),
  },

  // ---- projetos e posts
  "GET /api/projects": { access: "org", attack: () => [{ path: "/api/projects", expect: 200 }], own: () => ({ path: "/api/projects" }) },
  "POST /api/projects": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/projects", body: { name: "Projeto Alfa Dois", organization: String(t.org._id) }, expect: 201 }],
    own: () => ({ method: "POST", path: "/api/projects", body: { name: "Projeto Alfa Três" }, expect: 201 }),
  },
  "GET /api/projects/[id]": {
    access: "org",
    attack: (t) => [{ path: "/api/projects/x", params: { id: String(t.project._id) } }],
    own: (t) => ({ path: "/api/projects/x", params: { id: String(t.project._id) } }),
  },
  "PUT /api/projects/[id]": {
    access: "org",
    attack: (t) => [{ method: "PUT", path: "/api/projects/x", params: { id: String(t.project._id) }, body: { name: "Invadido", active: false } }],
    own: (t) => ({ method: "PUT", path: "/api/projects/x", params: { id: String(t.project._id) }, body: { description: "ok" } }),
  },
  "GET /api/posts": {
    access: "org",
    attack: (t) => [
      { path: "/api/posts", expect: 200 },
      { path: `/api/posts?project=${t.project._id}`, expect: 200 },
      { path: `/api/posts?organization=${t.org._id}`, expect: 200 },
    ],
    own: (t) => ({ path: `/api/posts?project=${t.project._id}` }),
  },
  "POST /api/posts": {
    access: "org",
    attack: (t, me) => [
      { method: "POST", path: "/api/posts", body: post(String(t.project._id)) },
      // projeto meu, mas tentando gravar na organização do outro: grava na MINHA
      { method: "POST", path: "/api/posts", body: { ...post(String(me.project._id)), organization: String(t.org._id) }, expect: 201 },
    ],
    own: (t) => ({ method: "POST", path: "/api/posts", body: post(String(t.project._id)), expect: 201 }),
  },
  "POST /api/posts/bulk": {
    access: "org",
    attack: (t, me) => [{ method: "POST", path: "/api/posts/bulk", body: { posts: [post(String(me.project._id)), post(String(t.project._id))] } }],
    own: (t) => ({ method: "POST", path: "/api/posts/bulk", body: { posts: [post(String(t.project._id))] }, expect: 201 }),
  },
  "GET /api/posts/[id]": {
    access: "org",
    attack: (t) => [{ path: "/api/posts/x", params: { id: String(t.post._id) } }],
    own: (t) => ({ path: "/api/posts/x", params: { id: String(t.post._id) } }),
  },
  "PUT /api/posts/[id]": {
    access: "org",
    attack: (t, me) => [
      { method: "PUT", path: "/api/posts/x", params: { id: String(t.post._id) }, body: { title: "Invadido" } },
      // mover um post MEU para o projeto do outro
      { method: "PUT", path: "/api/posts/x", params: { id: String(me.post._id) }, body: { project: String(t.project._id) } },
    ],
    own: (t) => ({ method: "PUT", path: "/api/posts/x", params: { id: String(t.post._id) }, body: { status: "approved" } }),
  },
  "DELETE /api/posts/[id]": {
    access: "org",
    attack: (t) => [{ method: "DELETE", path: "/api/posts/x", params: { id: String(t.post._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/posts/x", params: { id: String(t.post._id) } }),
  },

  // ---- contas e chaves
  "GET /api/social-accounts": {
    access: "org",
    attack: (t) => [{ path: "/api/social-accounts", expect: 200 }, { path: `/api/social-accounts?project=${t.project._id}`, expect: 200 }],
    own: () => ({ path: "/api/social-accounts" }),
  },
  "POST /api/social-accounts": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/social-accounts", body: { project: String(t.project._id), platform: "tiktok", accountName: "@intruso" } }],
    own: (t) => ({ method: "POST", path: "/api/social-accounts", body: { project: String(t.project._id), platform: "youtube", accountName: "@alfa-yt" }, expect: 201 }),
  },
  "GET /api/social-accounts/[id]": {
    access: "org",
    attack: (t) => [{ path: "/api/social-accounts/x", params: { id: String(t.account._id) } }],
    own: (t) => ({ path: "/api/social-accounts/x", params: { id: String(t.account._id) } }),
  },
  "PUT /api/social-accounts/[id]": {
    access: "org",
    attack: (t, me) => [
      { method: "PUT", path: "/api/social-accounts/x", params: { id: String(t.account._id) }, body: { active: false, credentials: { accessToken: "roubado" } } },
      { method: "PUT", path: "/api/social-accounts/x", params: { id: String(me.other._id) }, body: { project: String(t.project._id) } },
    ],
    own: (t) => ({ method: "PUT", path: "/api/social-accounts/x", params: { id: String(t.other._id) }, body: { accountName: "@alfa-tt" } }),
  },
  "DELETE /api/social-accounts/[id]": {
    access: "org",
    attack: (t) => [{ method: "DELETE", path: "/api/social-accounts/x", params: { id: String(t.account._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/social-accounts/x", params: { id: String(t.other._id) } }),
  },
  "GET /api/api-credentials": { access: "org", attack: () => [{ path: "/api/api-credentials", expect: 200 }], own: () => ({ path: "/api/api-credentials" }) },
  "POST /api/api-credentials": {
    access: "org",
    // mesmo serviço que a BETA já tem: cria o da ALFA, não mexe no da BETA
    attack: (t) => [{ method: "POST", path: "/api/api-credentials", body: { service: "openai", label: "OpenAI", organization: String(t.org._id), credentials: { apiKey: "chave-da-alfa-2" } }, expect: [200, 201] }],
    own: () => ({ method: "POST", path: "/api/api-credentials", body: { service: "gemini", label: "Gemini", credentials: { apiKey: "chave-alfa-gemini" } }, expect: 201 }),
  },
  "DELETE /api/api-credentials": {
    access: "org",
    // a BETA tem "freepik"; a ALFA não. Apagar pelo nome do serviço não pode atingir a BETA.
    attack: () => [{ method: "DELETE", path: "/api/api-credentials?service=freepik", expect: 200 }],
    own: () => ({ method: "DELETE", path: "/api/api-credentials?service=openai" }),
  },

  // ---- Instagram
  "POST /api/instagram/connect": {
    access: "org",
    attack: (t, me) => [
      { method: "POST", path: "/api/instagram/connect", body: { project: String(t.project._id), token: "IGAA-conta-intrusa-0000000001" } },
      // trocar o token da conta do outro, dizendo que é projeto meu
      { method: "POST", path: "/api/instagram/connect", body: { project: String(me.project._id), accountId: String(t.account._id), token: "IGAA-conta-intrusa-0000000001" } },
    ],
    own: (t) => ({ method: "POST", path: "/api/instagram/connect", body: { project: String(t.project._id), token: "IGAA-conta-alfaoficial-000001" }, expect: 201 }),
  },
  "GET /api/instagram/dashboard": {
    access: "org",
    attack: (t) => [
      { path: `/api/instagram/dashboard?project=${t.project._id}`, expect: 200 },
      { path: `/api/instagram/dashboard?account=${t.account._id}`, expect: 200 },
    ],
    own: (t) => ({ path: `/api/instagram/dashboard?project=${t.project._id}` }),
  },
  "GET /api/instagram/report": {
    access: "org+cron",
    attack: (t) => [{ path: "/api/instagram/report", expect: 200 }, { path: `/api/instagram/report?project=${t.project._id}`, expect: 200 }],
    own: () => ({ path: "/api/instagram/report?tipo=raiox" }),
  },
  "POST /api/instagram/sync": {
    access: "org+cron",
    // pedir a conta/projeto do outro: nenhuma conta é sincronizada
    attack: (t) => [
      { method: "POST", path: "/api/instagram/sync", body: { account: String(t.account._id) }, expect: 200 },
      { method: "POST", path: "/api/instagram/sync", body: { project: String(t.project._id) }, expect: 200 },
    ],
    own: (t) => ({ method: "POST", path: "/api/instagram/sync", body: { account: String(t.account._id) } }),
  },
  "POST /api/instagram/publish": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/instagram/publish", body: { postId: String(t.post._id), dryRun: true } }],
    own: (t) => ({ method: "POST", path: "/api/instagram/publish", body: { postId: String(t.post._id), dryRun: true } }),
  },
  "POST /api/instagram/accounts/[id]/test": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/instagram/accounts/x/test", params: { id: String(t.account._id) } }],
    own: (t) => ({ method: "POST", path: "/api/instagram/accounts/x/test", params: { id: String(t.account._id) } }),
  },
  "POST /api/instagram/accounts/[id]/renew": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/instagram/accounts/x/renew", params: { id: String(t.account._id) } }],
    // conta recém-conectada: a Meta só renova depois de 24h (aviso 409, que prova que a conta foi achada)
    own: (t) => ({ method: "POST", path: "/api/instagram/accounts/x/renew", params: { id: String(t.account._id) }, expect: 409 }),
  },
  "GET /api/instagram/oauth/start": {
    access: "org",
    attack: (t) => [{ path: `/api/instagram/oauth/start?project=${t.project._id}` }],
    own: (t) => ({ path: `/api/instagram/oauth/start?project=${t.project._id}`, expect: 307 }),
  },
  "GET /api/instagram/oauth/callback": {
    access: "org",
    // um `state` assinado para a BETA (dona da BETA), apresentado pela sessão da ALFA: recusado
    attack: () => [{ path: `/api/instagram/oauth/callback?code=codigo-qualquer&state=${encodeURIComponent(oauthState.state)}`, headers: { cookie2: oauthState.cookie }, expect: 307 }],
    own: () => ({ path: "/api/instagram/oauth/callback?error=access_denied&error_reason=user_denied", expect: 307 }),
  },
};

function post(project: string) {
  return { project, title: "Post de ataque", format: "reel", platforms: ["instagram"], scheduledDate: "2026-10-20", scheduledTime: "09:00" };
}

function inventory(): { key: string; file: string }[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/^route\.(ts|tsx|js|mjs)$/.test(name)) files.push(full);
    }
  };
  walk(API_DIR);
  return files.sort().map((file) => ({
    file,
    key: "/api/" + path.relative(API_DIR, path.dirname(file)).split(path.sep).join("/"),
  }));
}

let mongo: MongoMemoryServer;
const w = {} as World;
const handlers: Record<string, any> = {};
let attacks = 0;

async function seedSide(tag: "alfa" | "beta", label: string): Promise<Side> {
  const org = await makeOrg(`Cliente ${label}`, `cliente-${tag}`, { brand: { displayName: `Marca ${label}` } });
  const owner = await makeUser(org._id, "owner", `dona@${tag}.test`);
  const member = await makeUser(org._id, "member", `membro@${tag}.test`);
  const o = org._id;
  const project = await Project.create({ organization: o, name: `Projeto ${label}`, slug: "projeto" });
  const p = await Post.create({
    organization: o, project: project._id, title: `Post secreto da ${label}`, caption: `legenda-${tag}`, format: "reel",
    platforms: ["instagram"], scheduledDate: new Date(NOW), scheduledTime: "09:00", externalIds: { instagram: "1800000000000100" },
  });
  const account = await connectInstagram(o, { project: String(project._id), token: `IGAA-conta-${tag}oficial-000001` }, { now: NOW - 3_600_000 });
  await syncAccount(o, String(account._id), { now: NOW - 1_800_000 });
  const other = await SocialAccount.create({ organization: o, project: project._id, platform: "tiktok", accountName: `@${tag}-tiktok`, credentials: {} });
  const cred = await ApiCredential.create({ organization: o, service: tag === "beta" ? "freepik" : "elevenlabs", label: `Chave ${label}`, credentials: {} });
  if (tag === "beta") await ApiCredential.create({ organization: o, service: "openai", label: "OpenAI Beta", credentials: {} });
  const { invite, token } = await createInvite({ kind: "member", organization: o, email: `convidado@${tag}.test`, createdBy: owner });
  return { org, owner, member, project, post: p, account, other, cred, invite, inviteToken: token };
}

/** Foto do banco inteiro de um cliente (todas as coleções com `organization` + usuários, convites e a própria organização). */
async function snapshot(side: Side): Promise<string> {
  const out: Record<string, unknown> = {};
  for (const name of TENANT_MODELS)
    out[name] = await mongoose.models[name].collection.find({ organization: side.org._id }).sort({ _id: 1 }).toArray();
  for (const name of ["User", "Invite"])
    out[name] = await mongoose.models[name].collection.find({ organization: side.org._id }).sort({ _id: 1 }).toArray();
  out.Organization = await mongoose.models.Organization.collection.find({ _id: side.org._id }).toArray();
  return JSON.stringify(out);
}

/** Tudo que identifica a BETA: ids, nomes, e-mails. Nada disso pode aparecer para a ALFA. */
function markers(side: Side): string[] {
  return [
    String(side.org._id), String(side.owner._id), String(side.member._id), String(side.project._id), String(side.post._id),
    String(side.account._id), String(side.other._id), String(side.cred._id), String(side.invite._id),
    side.org.name, side.org.slug, "Marca Beta", side.project.name, side.post.title, "legenda-beta", "betaoficial", "@beta-tiktok",
    side.owner.email, side.member.email, "convidado@beta.test", "Chave Beta", "OpenAI Beta", side.inviteToken,
  ];
}

beforeAll(async () => {
  setTestEnv();
  Object.assign(process.env, { IG_OAUTH_ENABLED: "true", IG_APP_ID: "1234567890", IG_APP_SECRET: "segredo-do-app-de-teste", APP_URL: "https://contenthub.exemplo.test" });
  setFetchOverride(mockFetch(() => NOW));
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("isolamento"));
  w.adminOrg = await makeOrg("Vínculo Digital", "vinculo-digital");
  w.admin = await makeUser(w.adminOrg._id, "platform_admin", "admin@plataforma.test");
  w.A = await seedSide("alfa", "Alfa");
  w.B = await seedSide("beta", "Beta");

  for (const { key, file } of inventory()) {
    const mod = await import(file);
    for (const m of METHODS) if (mod[m]) handlers[`${m} ${key}`] = mod[m];
    // nada além de métodos HTTP e configuração de rota pode ser exportado
    for (const name of Object.keys(mod)) expect([...METHODS, "maxDuration", "dynamic", "runtime"], `${file} exporta ${name}`).toContain(name);
  }

  // `state` legítimo da dona da BETA (para o ataque ao callback do OAuth)
  const start = await call(handlers["GET /api/instagram/oauth/start"], { path: `/api/instagram/oauth/start?project=${w.B.project._id}`, cookie: cookieFor(w.B.owner) });
  oauthState.state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  oauthState.cookie = setCookieValue(start.headers, OAUTH_COOKIE);
});

afterAll(async () => {
  setFetchOverride(null);
  await mongoose.disconnect();
  await mongo.stop();
});

const send = (key: string, r: Req, cookie: string) => {
  const { cookie2, ...headers } = (r.headers || {}) as Record<string, string>;
  return call(handlers[key], { ...r, headers, cookie: [cookie, cookie2].filter(Boolean).join("; ") });
};

describe("inventário de rotas", () => {
  it("toda rota de /api passou por route() e tem prova de isolamento na tabela", () => {
    const found = Object.keys(handlers).sort();
    expect(found.length).toBeGreaterThan(40);
    const semProva = found.filter((k) => !CASES[k]);
    expect(semProva, "rota nova sem prova de isolamento: acrescente em CASES").toEqual([]);
    expect(Object.keys(CASES).filter((k) => !handlers[k]), "linha de CASES sem rota").toEqual([]);
    for (const key of found) {
      expect(handlers[key].access, `${key} não foi criada com route()`).toBe(CASES[key].access);
      const c = CASES[key];
      // rota que lê dado de cliente TEM de ter ataque e controle
      if (c.access !== "public" && c.access !== "admin") expect(Boolean(c.attack && c.own), `${key} sem ataque/controle`).toBe(true);
      else expect(c.why, `${key} sem justificativa`).toBeTruthy();
    }
  });

  it("o modelo recusa consulta sem organização (e com operador no lugar dela)", async () => {
    for (const name of TENANT_MODELS) {
      const M = mongoose.models[name];
      await expect(M.find({}), name).rejects.toBeInstanceOf(TenantScopeError);
      await expect(M.findById(w.B.project._id), name).rejects.toBeInstanceOf(TenantScopeError);
      await expect(M.countDocuments({ organization: { $ne: w.A.org._id } }), name).rejects.toBeInstanceOf(TenantScopeError);
      await expect(M.updateMany({}, { $set: { active: false } }), name).rejects.toBeInstanceOf(TenantScopeError);
      await expect(M.deleteMany({}), name).rejects.toBeInstanceOf(TenantScopeError);
      await expect(M.aggregate([{ $group: { _id: null, n: { $sum: 1 } } }]), name).rejects.toBeInstanceOf(TenantScopeError);
    }
    expect(TENANT_MODELS.sort()).toEqual(["ApiCredential", "InstagramAccountDaily", "InstagramMedia", "InstagramMediaDaily", "Post", "Project", "SocialAccount"]);
    // mover um registro para outra organização por update: recusado
    await expect(Post.updateOne({ _id: w.A.post._id, organization: w.A.org._id }, { $set: { organization: w.B.org._id } })).rejects.toBeInstanceOf(TenantScopeError);
    // criar sem organização: recusado pela validação
    await expect(Project.create({ name: "Sem dono", slug: "sem-dono" })).rejects.toThrow(/organization/);
  });
});

describe("cada rota, uma por uma", () => {
  it("sem login: 401 em tudo que não é público", async () => {
    for (const [key, c] of Object.entries(CASES)) {
      if (c.access === "public") continue;
      const [method, p] = key.split(" ");
      const r = await call(handlers[key], { method, path: p, body: method === "GET" || method === "DELETE" ? undefined : {}, params: { id: String(w.B.post._id) } });
      expect(r.status, key).toBe(401);
    }
  });

  it("cookie de usuário desativado, de versão antiga ou de cliente desativado: 401", async () => {
    const ghostOrg = await makeOrg("Cliente Desligado", "cliente-desligado", { active: false });
    const ghost = await makeUser(ghostOrg._id, "owner", "dona@desligado.test");
    const off = await makeUser(w.A.org._id, "member", "desativado@alfa.test", { active: false });
    const old = cookieFor({ _id: w.A.member._id, sessionVersion: 0 });
    for (const cookie of [cookieFor(ghost), cookieFor(off), old]) {
      expect((await call(handlers["GET /api/projects"], { path: "/api/projects", cookie })).status).toBe(401);
    }
    await mongoose.models.User.deleteMany({ _id: { $in: [ghost._id, off._id] } });
  });

  it("papel errado: cliente não entra em rota de admin (404) e membro não entra em rota de dono (403)", async () => {
    for (const [key, c] of Object.entries(CASES)) {
      const [method, p] = key.split(" ");
      const base = { method, path: p, body: method === "GET" || method === "DELETE" ? undefined : { organization: String(w.B.org._id) }, params: { id: String(w.B.org._id) } };
      if (c.access === "admin") {
        for (const u of [w.A.owner, w.A.member]) {
          const r = await call(handlers[key], { ...base, cookie: cookieFor(u) });
          expect(r.status, `${key} como ${u.role}`).toBe(404);
          for (const m of markers(w.B)) expect(r.text.includes(m), `${key} vazou ${m}`).toBe(false);
        }
        // nem com "entrar como" forjado dentro de um cookie de dono
        const forged = await call(handlers[key], { ...base, cookie: cookieFor(w.A.owner, String(w.B.org._id)) });
        expect(forged.status, `${key} com imp forjado`).toBe(404);
      }
      if (c.access === "owner") {
        const r = await call(handlers[key], { ...base, cookie: cookieFor(w.A.member) });
        expect(r.status, `${key} como membro`).toBe(403);
      }
    }
  });

  it("ATAQUE: dono da ALFA com os ids da BETA não lê, não lista, não edita e não apaga nada", async () => {
    const before = await snapshot(w.B);
    const secret = markers(w.B);
    const cookie = cookieFor(w.A.owner);
    // inclui cookie de dono com "entrar como BETA" (só vale para administrador)
    const cookies = [cookie, cookieFor(w.A.owner, String(w.B.org._id)), cookieFor(w.A.member, String(w.B.org._id))];
    for (const [key, c] of Object.entries(CASES)) {
      if (!c.attack) continue;
      for (const r of c.attack(w.B, w.A, w)) {
        for (const ck of c.access === "owner" ? cookies.slice(0, 2) : cookies) {
          const res = await send(key, r, ck);
          const expected = r.expect === undefined ? [404] : [r.expect].flat();
          expect(expected, `${key} ${JSON.stringify(r.body ?? r.path)} -> ${res.status} ${res.text.slice(0, 120)}`).toContain(res.status);
          const where = res.text + " " + (res.headers.get("location") || "");
          for (const m of secret) expect(where.includes(m), `${key} devolveu dado da BETA (${m})`).toBe(false);
          attacks++;
        }
      }
      expect(await snapshot(w.B), `${key} alterou o banco da BETA`).toBe(before);
    }
    expect(attacks).toBeGreaterThan(100);
    console.log(`[isolamento] ${Object.keys(handlers).length} rotas x método no inventário · ${Object.values(CASES).filter((c) => c.attack).length} com dado de cliente · ${attacks} pedidos de ataque, todos barrados`);
  });

  it("CONTROLE: os mesmos pedidos com os ids da própria ALFA funcionam", async () => {
    const beforeB = await snapshot(w.B);
    const cookie = cookieFor(w.A.owner);
    // exclusões por último, para os outros controles ainda acharem o registro
    const ordered = Object.entries(CASES).sort(([a], [b]) => Number(a.startsWith("DELETE")) - Number(b.startsWith("DELETE")));
    for (const [key, c] of ordered) {
      if (!c.own) continue;
      const r = c.own(w.A, w);
      const res = await send(key, r, cookie);
      const expected = r.expect === undefined ? [200] : [r.expect].flat();
      expect(expected, `${key} -> ${res.status} ${res.text.slice(0, 160)}`).toContain(res.status);
    }
    expect(await snapshot(w.B)).toBe(beforeB);
    // e as listas da ALFA mostram os dados da ALFA
    const projects = await call(handlers["GET /api/projects"], { path: "/api/projects", cookie });
    expect(projects.data.map((p: any) => p.name)).toEqual(expect.arrayContaining(["Projeto Alfa", "Projeto Alfa Dois", "Projeto Alfa Três"]));
    const dash = await call(handlers["GET /api/instagram/dashboard"], { path: `/api/instagram/dashboard?project=${w.A.project._id}`, cookie });
    expect(dash.data.account.username).toBe("alfaoficial");
    expect(dash.data.dashboard.posts30.length).toBeGreaterThan(5);
  });

  it("os dois clientes guardam a mesma mídia do Instagram sem misturar", async () => {
    for (const side of [w.A, w.B]) {
      const mine = await InstagramMedia.find({ organization: side.org._id }).lean<any[]>();
      expect(mine).toHaveLength(26);
      expect(new Set(mine.map((m) => String(m.account)))).toEqual(new Set([String(side.account._id)]));
    }
    expect(await InstagramMedia.collection.countDocuments({ igId: "1800000000000100" })).toBe(2);
  });
});

describe("rotina (cron) e administrador", () => {
  const bearer = () => ({ authorization: `Bearer ${process.env.CRON_TOKEN}` });

  it("cron percorre TODAS as organizações ativas; token errado não entra", async () => {
    const bad = await call(handlers["POST /api/instagram/sync"], { method: "POST", path: "/api/instagram/sync", headers: { authorization: "Bearer errado" } });
    expect(bad.status).toBe(401);
    const sync = await call(handlers["POST /api/instagram/sync"], { method: "POST", path: "/api/instagram/sync", headers: bearer() });
    expect(sync.status).toBe(200);
    expect(sync.data.organizations).toBe(3);
    expect(new Set(sync.data.results.map((r: any) => r.organizationId))).toEqual(new Set([String(w.A.org._id), String(w.B.org._id)]));
    const report = await call(handlers["GET /api/instagram/report"], { path: "/api/instagram/report", headers: bearer() });
    expect(new Set(report.data.reports.map((r: any) => r.organizationName))).toEqual(new Set(["Cliente Alfa", "Cliente Beta"]));
    // o token de rotina não abre nenhuma outra rota
    const other = await call(handlers["GET /api/projects"], { path: "/api/projects", headers: bearer() });
    expect(other.status).toBe(401);
    // cliente desativado fica fora da rotina
    await mongoose.models.Organization.updateOne({ _id: w.B.org._id }, { $set: { active: false } });
    const sync2 = await call(handlers["POST /api/instagram/sync"], { method: "POST", path: "/api/instagram/sync", headers: bearer() });
    expect(sync2.data.results.every((r: any) => r.organizationId === String(w.A.org._id))).toBe(true);
    await mongoose.models.Organization.updateOne({ _id: w.B.org._id }, { $set: { active: true } });
  });

  it("administrador sem 'entrar como' vê só a própria organização nas rotas de dados", async () => {
    const r = await call(handlers["GET /api/projects"], { path: "/api/projects", cookie: cookieFor(w.admin) });
    expect(r.status).toBe(200);
    expect(r.data).toEqual([]);
    const post = await call(handlers["GET /api/posts/[id]"], { path: "/api/posts/x", params: { id: String(w.B.post._id) }, cookie: cookieFor(w.admin) });
    expect(post.status).toBe(404);
  });
});
