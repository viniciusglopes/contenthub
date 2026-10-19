/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ARTICLES, SCREENS } from "@/lib/help/content.generated";
import { LINKED_ARTICLES, LINKED_SCREENS, helpFor, screenFor } from "@/lib/help/map";
import { HouseCredential } from "@/models/Platform";
import Project from "@/models/Project";
import SocialAccount from "@/models/SocialAccount";
import VideoTemplate from "@/models/VideoTemplate";
import MediaAsset from "@/models/MediaAsset";
import { SEED_TEMPLATES } from "@/lib/studio/cenas-spec";
import * as ajuda from "@/app/api/ajuda/route";
import * as artigo from "@/app/api/ajuda/[id]/route";
import * as checklist from "@/app/api/ajuda/checklist/route";
import * as telas from "@/app/api/ajuda/telas/route";
import { call, cookieFor, makeOrg, makeUser, setTestEnv } from "./helpers";

// AJUDA: artigos versionados (docs/ajuda/*.md), "?" de cada tela, artigo de administrador
// escondido do cliente e a lista "Primeiros passos" com o andamento lido do banco.

let mongo: MongoMemoryServer;
let A: any, admin: any;

beforeAll(async () => {
  setTestEnv();
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("ajuda"));
  const org = await makeOrg("Cliente Alfa", "cliente-alfa");
  const owner = await makeUser(org._id, "owner", "dona@alfa.test");
  const project = await Project.create({ organization: org._id, name: "Projeto Alfa", slug: "projeto" });
  A = { org, owner, project, cookie: cookieFor(owner) };
  const aOrg = await makeOrg("Vínculo Digital", "vinculo-digital");
  admin = { cookie: cookieFor(await makeUser(aOrg._id, "platform_admin", "admin@plataforma.test")) };
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("conteúdo", () => {
  it("o gerado está em dia com docs/ajuda/*.md", () => {
    const out = execFileSync("node", [path.join(import.meta.dirname, "..", "scripts", "build-help.mjs"), "--check"]).toString();
    expect(out).toMatch(/ajuda em dia/);
  });
  it("todo '?' abre um artigo que existe; sem travessão; links externos só https e oficiais", () => {
    const ids = new Set(ARTICLES.map((a) => a.id));
    for (const id of LINKED_ARTICLES) expect(ids.has(id), id).toBe(true);
    expect(helpFor("estudio", "cenas")).toBe("reel-com-cenas");
    expect(helpFor("instagram", "comentarios")).toBe("comentarios");
    for (const a of ARTICLES) {
      expect(a.body.includes("—"), a.id).toBe(false);
      for (const [, href] of a.body.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (href.startsWith("artigo:")) expect(ids.has(href.slice(7)), `${a.id} -> ${href}`).toBe(true);
        else expect(href, a.id).toMatch(/^https:\/\/(www\.)?(facebook\.com|developers\.facebook\.com|developers\.google\.com|support\.google\.com|console\.cloud\.google\.com|developers\.tiktok\.com|pexels\.com)\//);
      }
    }
  });
});

describe("popup: print de cada tela e passos de fora", () => {
  const pub = path.join(import.meta.dirname, "..", "public");
  it("todo '?' (tela e item do menu) tem guia com print, passos e artigo que existe", () => {
    const ids = new Set(ARTICLES.map((a) => a.id));
    const sids = new Set(SCREENS.map((s) => s.id));
    for (const id of LINKED_SCREENS) expect(sids.has(id), id).toBe(true);
    for (const v of ["calendar", "list", "aprovacoes", "projetos", "instagram", "estudio", "trafego", "concorrentes", "automacoes", "contatos", "crm", "ajuda", "clientes", "conta", "configuracoes"]) expect(sids.has(screenFor(v)), v).toBe(true);
    expect(screenFor("crm", "funis")).toBe("crm-etapas");
    expect(screenFor("concorrentes", "ofertas")).toBe("ofertas");
    expect(screenFor("configuracoes", "apis")).toBe("config-apis");
    for (const s of SCREENS) {
      expect(ids.has(s.article), `${s.id} -> ${s.article}`).toBe(true);
      expect(existsSync(path.join(pub, s.image)), s.image).toBe(true);
      expect(s.steps.length, s.id).toBeGreaterThan(0);
      expect(s.width, s.id).toBe(1280);
      expect(s.steps.join(" ").includes("—"), s.id).toBe(false);
    }
    expect(SCREENS.find((s) => s.id === "clientes")!.admin).toBe(true);
  });
  it("passo fora do ContentHub: link oficial https, desenho existe e tem os mesmos números do caminho", () => {
    let n = 0;
    for (const a of ARTICLES) {
      for (const m of a.body.matchAll(/^:::fora (.+)\n([\s\S]*?)\n:::$/gm)) {
        n++;
        const f = Object.fromEntries(m[2].split("\n").map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]));
        expect(f.link, `${a.id}: ${m[1]}`).toMatch(/^https:\/\/(www\.)?(facebook\.com|developers\.facebook\.com|business\.facebook\.com|instagram\.com|console\.cloud\.google\.com|pexels\.com|app\.hotmart\.com|dashboard\.kiwify\.com\.br)\//);
        const parts = f.caminho.split(/\s+>\s+/);
        expect(parts.length, `${a.id}: ${m[1]}`).toBeGreaterThan(1);
        expect(f.desenho, `${a.id}: ${m[1]} sem desenho`).toBeTruthy();
        const svg = readFileSync(path.join(pub, "ajuda", "externo", `${f.desenho}.svg`), "utf8");
        expect(svg).toMatch(/DESENHO ILUSTRATIVO/);
        expect(Number(/data-passos="(\d+)"/.exec(svg)![1]), `${a.id}: ${f.desenho}`).toBe(parts.length);
      }
    }
    expect(n).toBeGreaterThanOrEqual(15);
  });
});

describe("rotas", () => {
  it("guias de tela: cliente não vê o de administrador; o administrador vê", async () => {
    const mine = await call(telas.GET, { path: "/api/ajuda/telas", cookie: A.cookie });
    expect(mine.status).toBe(200);
    expect(mine.data.some((s: any) => s.id === "calendario")).toBe(true);
    expect(mine.data.some((s: any) => s.admin)).toBe(false);
    const adm = await call(telas.GET, { path: "/api/ajuda/telas", cookie: admin.cookie });
    expect(adm.data.some((s: any) => s.id === "clientes")).toBe(true);
  });

  it("cliente não vê artigo de administrador; o administrador vê", async () => {
    const mine = await call(ajuda.GET, { path: "/api/ajuda", cookie: A.cookie });
    expect(mine.data.some((a: any) => a.admin)).toBe(false);
    expect((await call(artigo.GET, { path: "/api/ajuda/x", cookie: A.cookie, params: { id: "admin-clientes" } })).status).toBe(404);
    const adm = await call(ajuda.GET, { path: "/api/ajuda", cookie: admin.cookie });
    expect(adm.data.some((a: any) => a.id === "admin-clientes")).toBe(true);
    expect((await call(artigo.GET, { path: "/api/ajuda/x", cookie: admin.cookie, params: { id: "admin-clientes" } })).status).toBe(200);
  });

  it("primeiros passos: o andamento muda com o que existe no banco", async () => {
    const get = async () => (await call(checklist.GET, { path: `/api/ajuda/checklist?project=${A.project._id}`, cookie: A.cookie })).data;
    const before = await get();
    const st = (d: any, id: string) => d.steps.find((s: any) => s.id === id).state;
    expect([st(before, "profissional"), st(before, "token-instagram"), st(before, "pexels"), st(before, "padroes"), st(before, "tiktok"), st(before, "publicacao")]).toEqual(["pendente", "pendente", "pendente", "pendente", "indisponivel", "info"]);
    await SocialAccount.create({ organization: A.org._id, project: A.project._id, platform: "instagram", accountName: "@alfa", username: "alfa", accountType: "BUSINESS", credentials: {}, tokenExpiresAt: new Date(Date.now() + 86_400_000 * 30) });
    await HouseCredential.create({ service: "pexels", credentials: { apiKey: "x" } });
    await VideoTemplate.create({ organization: A.org._id, project: A.project._id, name: "P", settings: SEED_TEMPLATES[0].settings });
    await MediaAsset.create({ organization: A.org._id, kind: "cena", keep: true, file: `${"a".repeat(48)}.mp4`, mime: "video/mp4", bytes: 1, scene: { category: "mar", license: "proprio" } });
    const after = await get();
    expect([st(after, "profissional"), st(after, "token-instagram"), st(after, "pexels"), st(after, "padroes")]).toEqual(["feito", "feito", "feito", "feito"]);
    expect(after.done).toBe(before.done + 4);
  });
});
