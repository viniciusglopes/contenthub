/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MetaGraphClient, setMetaFetch } from "@/lib/ads/client";
import { metaMockFetch, mockActiveAds } from "@/lib/ads/mock";
import { connectAdAccount } from "@/lib/ads/accounts";
import { addDays, dayKey } from "@/lib/instagram/dates";
import type { FetchLike } from "@/lib/instagram/client";
import { EU_COUNTRIES, countActiveAds, publicLibraryUrl } from "@/lib/offers/adlibrary";
import { DEFAULT_HEAT_RULES, cleanHeatRules, computeStats, describeRule, heatOf, monthlyText, monthlyTop } from "@/lib/offers/heat";
import { cleanPageId, recordManual, runHouseCount, runOrgCount, saveHouseLibraryToken } from "@/lib/offers/offers";
import { HouseOffer, HouseOfferDaily, OfferDaily, OfferPage } from "@/models/Offer";
import Organization from "@/models/Organization";
import Project from "@/models/Project";
import { call, cookieFor, makeOrg, makeUser, setTestEnv } from "./helpers";
import * as ofertas from "@/app/api/ofertas/route";
import * as oferta from "@/app/api/ofertas/[id]/route";
import * as historico from "@/app/api/ofertas/[id]/historico/route";
import * as contagem from "@/app/api/ofertas/[id]/contagem/route";
import * as atualizar from "@/app/api/ofertas/atualizar/route";
import * as favoritos from "@/app/api/ofertas/favoritos/route";
import * as casa from "@/app/api/ofertas/casa/route";
import * as relatorio from "@/app/api/ofertas/casa/relatorio/route";
import * as adminOfertas from "@/app/api/admin/ofertas/route";
import * as adminOferta from "@/app/api/admin/ofertas/[id]/route";
import * as adminConfig from "@/app/api/admin/ofertas/config/route";

const NOW = Date.now();
const TODAY = dayKey(NOW);
const TOKEN = "EAAtoken-de-teste-do-simulador-ofertas-00001";
let mongo: MongoMemoryServer;
let org: any;
let owner: any;
let member: any;
let admin: any;
let calls: string[] = [];
let project: any;

const pts = (rows: [string, number, ("api" | "manual")?][]) => rows.map(([date, count, source]) => ({ date, count, source: source || ("api" as const) }));

beforeAll(async () => {
  setTestEnv();
  const base = metaMockFetch(() => NOW);
  setMetaFetch(async (url, init) => {
    calls.push(url);
    return base(url, init);
  });
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("ofertas"));
  const home = await makeOrg("Vínculo Digital", "vinculo-digital");
  admin = await makeUser(home._id, "platform_admin", "admin@ofertas.test");
  org = await makeOrg("Cliente Ofertas", "cliente-ofertas");
  owner = await makeUser(org._id, "owner", "dona@ofertas.test");
  member = await makeUser(org._id, "member", "membro@ofertas.test");
  project = await Project.create({ organization: org._id, name: "Projeto Ofertas", slug: "projeto" });
});
afterAll(async () => {
  setMetaFetch(null);
  await mongoose.disconnect();
  await mongo.stop();
});

describe("números do cartão (puros)", () => {
  it("delta de ontem, de 7 dias e curva de 30 dias", () => {
    const s = computeStats(pts([["2026-10-01", 100], ["2026-10-08", 140], ["2026-10-09", 150]]));
    expect(s).toMatchObject({ count: 150, date: "2026-10-09", delta1: 10, delta1Pct: 7.1, delta7: 50, delta7Pct: 50, base7Date: "2026-10-01", mixedSources: false });
    expect(s.spark).toHaveLength(30);
    expect(s.spark[29]).toBe(150);
    expect(s.spark[28]).toBe(140);
    expect(s.spark[0]).toBeNull();
    // sem o dia anterior e sem base entre 7 e 10 dias: sem delta (não inventa)
    const t = computeStats(pts([["2026-10-01", 10], ["2026-10-05", 20]]));
    expect([t.delta1, t.delta7]).toEqual([null, null]);
    // base de 9 dias atrás vale para o "7 dias"; base de 11 não
    expect(computeStats(pts([["2026-10-01", 10], ["2026-10-10", 20]])).base7Date).toBe("2026-10-01");
    expect(computeStats(pts([["2026-10-01", 10], ["2026-10-12", 20]])).delta7).toBeNull();
    expect(computeStats([]).count).toBeNull();
  });

  it("fonte misturada (API x manual) aparece marcada", () => {
    expect(computeStats(pts([["2026-10-08", 5, "manual"], ["2026-10-09", 9]])).mixedSources).toBe(true);
  });

  it("selo de temperatura pelas regras padrão, em ordem", () => {
    const h = (count: number, delta7: number | null, delta7Pct: number | null) => heatOf({ count, delta7, delta7Pct }).id;
    expect(h(300, 120, 66.7)).toBe("escalando");
    expect(h(30, 12, 66.7)).toBe("crescendo"); // poucos anúncios para "escalando"
    expect(h(300, 20, 7.1)).toBe("estavel");
    expect(h(300, -80, -21)).toBe("caindo");
    expect(h(300, null, null)).toBe("sem_historico");
    expect(h(0, -40, -100)).toBe("parou");
    expect(describeRule(DEFAULT_HEAT_RULES[0])).toBe("pelo menos 50 anúncios ativos e alta de 30% ou mais em 7 dias");
  });

  it("regras configuráveis: validação em português", () => {
    const r = cleanHeatRules([{ id: "foguete", label: "Foguete", tone: "red", minCount: "1000" }]);
    expect(r).toEqual([{ id: "foguete", label: "Foguete", tone: "red", minCount: 1000 }]);
    expect(heatOf({ count: 1500, delta7: null, delta7Pct: null }, r).label).toBe("Foguete");
    expect(() => cleanHeatRules([])).toThrow(/1 a 10/);
    expect(() => cleanHeatRules([{ id: "a b", label: "x" }])).toThrow(/identificador/);
    expect(() => cleanHeatRules([{ id: "ok", label: "Ok", minCount: "muitos" }])).toThrow(/número/);
  });

  it("mais escaladas do mês: alta entre a 1ª e a última contagem do mês", () => {
    const items = monthlyTop([
      { id: "a", name: "Página A", points: pts([["2026-09-30", 1], ["2026-10-01", 100], ["2026-10-20", 400]]) },
      { id: "b", name: "Página B", points: pts([["2026-10-02", 10], ["2026-10-15", 90, "manual"], ["2026-10-18", 60]]) },
      { id: "c", name: "Página C", points: pts([["2026-10-02", 50], ["2026-10-18", 20]]) },
      { id: "d", name: "Página D", points: pts([["2026-10-02", 50]]) },
    ], "2026-10");
    expect(items.map((i) => [i.name, i.growth, i.peak, i.manual])).toEqual([["Página A", 300, 400, false], ["Página B", 50, 90, true]]);
    const text = monthlyText("2026-10", items);
    expect(text).toContain("1. Página A: 100 para 400 anúncios ativos (+300, +300%)");
    expect(text).toContain("(inclui contagem manual)");
    expect(text).not.toMatch(/—/);
  });

  it("id da página e link público da Biblioteca (só para a pessoa abrir)", () => {
    expect(cleanPageId("https://www.facebook.com/ads/library/?view_all_page_id=102938475610293&country=BR")).toBe("102938475610293");
    expect(cleanPageId("https://www.facebook.com/profile.php?id=61550000000001")).toBe("61550000000001");
    expect(cleanPageId(" 7710001 ")).toBe("7710001");
    expect(() => cleanPageId("minhapagina")).toThrow(/id numérico/);
    expect(publicLibraryUrl({ pageId: "7710001", tags: { countries: ["BR"] } })).toBe("https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&media_type=all&search_type=page&view_all_page_id=7710001");
    expect(publicLibraryUrl({ name: "Chá X" })).toContain("country=ALL&media_type=all&search_type=keyword_unordered&q=Ch%C3%A1%20X");
  });
});

describe("contagem pela API oficial (simulada)", () => {
  it("pagina até o fim, conta ids únicos e grava os países pedidos", async () => {
    calls = [];
    const r = await countActiveAds(new MetaGraphClient(TOKEN), "7710001", EU_COUNTRIES);
    const expected = mockActiveAds("7710001", TODAY);
    expect(expected).toBeGreaterThan(0);
    expect(r).toMatchObject({ count: expected, complete: true, calls: Math.max(1, Math.ceil(expected / 250)) });
    const u = new URL(calls[0]);
    expect(u.pathname).toBe("/v25.0/ads_archive");
    expect(u.searchParams.get("ad_active_status")).toBe("ACTIVE");
    expect(u.searchParams.get("search_page_ids")).toBe("7710001");
    expect(JSON.parse(u.searchParams.get("ad_reached_countries")!)).toHaveLength(27);
    expect(u.searchParams.get("fields")).toBe("id");
  });

  it("paginação sem fim para no teto e marca 'pelo menos N'", async () => {
    const endless: FetchLike = async (url) => {
      const after = Number(new URL(url).searchParams.get("after") || 0);
      const next = new URL(url);
      next.searchParams.set("after", String(after + 1));
      return { ok: true, status: 200, json: async () => ({ data: [{ id: `ad${after}` }], paging: { next: next.toString() } }) };
    };
    const r = await countActiveAds(new MetaGraphClient(TOKEN, endless), "7710001", ["PT"]);
    expect(r).toMatchObject({ count: 40, complete: false, calls: 40 });
  });

  it("sem token, recusa de identidade e contagem manual do dia valendo mais", async () => {
    const p = await OfferPage.create({ organization: org._id, name: "Página API", pageId: "7710001", counting: "api" });
    // 1) sem conta de anúncio e sem módulo: nada é chamado, a tela explica
    calls = [];
    const r1 = await runOrgCount(org._id, { now: NOW });
    expect(r1).toEqual([expect.objectContaining({ status: "sem_token" })]);
    expect(calls).toHaveLength(0);
    // 2) token da conta de anúncio sem identidade confirmada: erro guardado, nenhuma linha no histórico
    const acc = await connectAdAccount(org._id, { project: String(project._id), adAccountId: "act_5555555555", token: "EAAtoken-sem-identidade-confirmada-0000000001" });
    const r2 = await runOrgCount(org._id, { now: NOW });
    expect(r2[0]).toMatchObject({ status: "erro" });
    expect(r2[0].message).toMatch(/confirmar identidade/);
    expect(await OfferDaily.countDocuments({ organization: org._id, page: p._id })).toBe(0);
    expect(((await OfferPage.findOne({ organization: org._id, _id: p._id }).lean()) as any).last.error).toMatch(/facebook\.com\/ID/);
    // 3) token bom: conta e grava
    await mongoose.models.AdAccount.deleteOne({ organization: org._id, _id: acc._id });
    await connectAdAccount(org._id, { project: String(project._id), adAccountId: "act_5555555556", token: TOKEN });
    const r3 = await runOrgCount(org._id, { now: NOW });
    expect(r3[0]).toMatchObject({ status: "ok", count: mockActiveAds("7710001", TODAY), complete: true });
    const row: any = await OfferDaily.findOne({ organization: org._id, page: p._id, date: TODAY }).lean();
    expect(row).toMatchObject({ source: "api", countries: EU_COUNTRIES });
    // 4) contagem manual do dia: a rotina não sobrescreve
    await recordManual({ kind: "org", org: org._id, page: p }, { count: 7, note: "Biblioteca, Brasil, 10h" }, { id: String(owner._id), name: "Dona" }, NOW);
    const r4 = await runOrgCount(org._id, { now: NOW });
    expect(r4[0].status).toBe("manual_hoje");
    expect(((await OfferDaily.findOne({ organization: org._id, page: p._id, date: TODAY }).lean()) as any)).toMatchObject({ count: 7, source: "manual", byName: "Dona", note: "Biblioteca, Brasil, 10h" });
    await OfferPage.deleteOne({ organization: org._id, _id: p._id });
    await OfferDaily.deleteMany({ organization: org._id, page: p._id });
  });
});

describe("rotas", () => {
  const ck = () => cookieFor(owner);

  it("cadastro com validação, edição, contagem manual e histórico com quem registrou", async () => {
    const bad = await call(ofertas.POST, { method: "POST", path: "/api/ofertas", cookie: ck(), body: { name: "Sem página", counting: "api" } });
    expect(bad).toMatchObject({ status: 400, data: { field: "pageId" } });
    const badUrl = await call(ofertas.POST, { method: "POST", path: "/api/ofertas", cookie: ck(), body: { name: "Xis", counting: "manual", offerUrl: "javascript:alert(1)" } });
    expect(badUrl.data.field).toBe("offerUrl");
    const r = await call(ofertas.POST, { method: "POST", path: "/api/ofertas", cookie: ck(), body: { name: "Oferta só Brasil", counting: "manual", offerUrl: "https://exemplo.com/vsl", tags: { structure: "vsl", niche: "nutra", language: "pt", product: "Chá", countries: "br, pt" } } });
    expect(r.status).toBe(201);
    expect(r.data).toMatchObject({ counting: "manual", tags: { structure: "vsl", countries: ["BR", "PT"] }, heat: { id: "sem_historico" } });
    const id = r.data._id;
    const dup = await call(ofertas.POST, { method: "POST", path: "/api/ofertas", cookie: ck(), body: { name: "Repetida", pageId: "7710009" } });
    expect(dup.status).toBe(201);
    expect((await call(ofertas.POST, { method: "POST", path: "/api/ofertas", cookie: ck(), body: { name: "Repetida 2", pageId: "7710009" } })).status).toBe(409);

    // contagem manual: exige observação, data de até 7 dias e não futura
    const c = (body: any) => call(contagem.POST, { method: "POST", path: "/api/ofertas/x/contagem", params: { id }, cookie: cookieFor(member), body });
    expect((await c({ count: 10 })).data.field).toBe("note");
    expect((await c({ count: -1, note: "teste" })).data.field).toBe("count");
    expect((await c({ count: 10, note: "teste", date: addDays(TODAY, -8) })).data.field).toBe("date");
    expect((await c({ count: 10, note: "teste", date: addDays(TODAY, 1) })).data.field).toBe("date");
    expect((await c({ count: 80, note: "Biblioteca pública, país Brasil", date: addDays(TODAY, -7) })).status).toBe(201);
    expect((await c({ count: 140, note: "Biblioteca pública, país Brasil" })).status).toBe(201);
    const h = await call(historico.GET, { path: "/api/ofertas/x/historico", params: { id }, cookie: ck() });
    expect(h.data.rows[0]).toMatchObject({ count: 140, source: "manual", byName: "membro", note: "Biblioteca pública, país Brasil" });
    expect(h.data.stats).toMatchObject({ count: 140, delta7: 60, delta7Pct: 75 });
    const list = await call(ofertas.GET, { path: "/api/ofertas", cookie: ck() });
    const card = list.data.offers.find((o: any) => o._id === id);
    expect(card.heat.id).toBe("escalando");
    expect(list.data).toMatchObject({ module: false, token: "conta", countries: EU_COUNTRIES });
    expect(list.data.note).toMatch(/União Europeia/);

    const put = await call(oferta.PUT, { method: "PUT", path: "/api/ofertas/x", params: { id }, cookie: ck(), body: { counting: "api" } });
    expect(put.data.field).toBe("pageId");
    expect((await call(oferta.PUT, { method: "PUT", path: "/api/ofertas/x", params: { id }, cookie: ck(), body: { tags: { structure: "quiz" } } })).data.tags.structure).toBe("quiz");
  });

  it("favorito é de cada usuário", async () => {
    const list = await call(ofertas.GET, { path: "/api/ofertas", cookie: ck() });
    const id = list.data.offers[0]._id;
    expect((await call(favoritos.POST, { method: "POST", path: "/api/ofertas/favoritos", cookie: ck(), body: { kind: "org", id, on: true } })).data.favorite).toBe(true);
    const mine = await call(ofertas.GET, { path: "/api/ofertas", cookie: ck() });
    const theirs = await call(ofertas.GET, { path: "/api/ofertas", cookie: cookieFor(member) });
    expect(mine.data.offers.find((o: any) => o._id === id).favorite).toBe(true);
    expect(theirs.data.offers.find((o: any) => o._id === id).favorite).toBe(false);
    await call(favoritos.POST, { method: "POST", path: "/api/ofertas/favoritos", cookie: ck(), body: { kind: "org", id, on: false } });
    expect((await call(ofertas.GET, { path: "/api/ofertas", cookie: ck() })).data.offers.find((o: any) => o._id === id).favorite).toBe(false);
  });

  it("lista da casa: só com o módulo ligado; arquivada some; novas hoje; relatório do mês", async () => {
    const adm = cookieFor(admin);
    const add = await call(adminOfertas.POST, { method: "POST", path: "/api/admin/ofertas", cookie: adm, body: { name: "Casa Nutra 1", pageId: "7740004", offerUrl: "https://exemplo.com/quiz", tags: { structure: "quiz", niche: "nutra", language: "es", countries: ["MX"] } } });
    expect(add.status).toBe(201);
    const add2 = await call(adminOfertas.POST, { method: "POST", path: "/api/admin/ofertas", cookie: adm, body: { name: "Casa Info 2", counting: "manual" } });
    // módulo desligado: 403 com explicação; favorito da casa também não
    const off = await call(casa.GET, { path: "/api/ofertas/casa", cookie: ck() });
    expect(off.status).toBe(403);
    expect(off.data.error).toMatch(/módulo Ofertas/);
    expect((await call(favoritos.POST, { method: "POST", path: "/api/ofertas/favoritos", cookie: ck(), body: { kind: "casa", id: add.data._id } })).status).toBe(404);
    expect((await call(relatorio.GET, { path: "/api/ofertas/casa/relatorio", cookie: ck() })).status).toBe(403);

    await Organization.updateOne({ _id: org._id }, { $set: { offersEnabled: true } });
    const on = await call(casa.GET, { path: "/api/ofertas/casa", cookie: ck() });
    expect(on.status).toBe(200);
    expect(on.data.offers.map((o: any) => o.name).sort()).toEqual(["Casa Info 2", "Casa Nutra 1"]);
    expect(on.data.newToday).toBe(2);
    expect(on.data.canAdmin).toBe(false);
    // arquivar: some para o cliente, fica para o administrador
    await call(adminOferta.DELETE, { method: "DELETE", path: "/api/admin/ofertas/x", params: { id: add2.data._id }, cookie: adm });
    expect((await call(casa.GET, { path: "/api/ofertas/casa", cookie: ck() })).data.offers.map((o: any) => o.name)).toEqual(["Casa Nutra 1"]);
    expect((await call(adminOfertas.GET, { path: "/api/admin/ofertas", cookie: adm })).data.offers).toHaveLength(2);
    expect(await HouseOffer.countDocuments({})).toBe(2);
    // cliente não entra nas rotas de administrador
    expect((await call(adminOfertas.POST, { method: "POST", path: "/api/admin/ofertas", cookie: ck(), body: { name: "Intrusa", counting: "manual" } })).status).toBe(404);

    // relatório do mês
    const month = TODAY.slice(0, 7);
    await HouseOfferDaily.create([
      { page: add.data._id, date: `${month}-01`, count: 20, source: "api" },
      { page: add.data._id, date: `${month}-02`, count: 95, source: "api" },
    ]);
    const rep = await call(relatorio.GET, { path: `/api/ofertas/casa/relatorio?mes=${month}`, cookie: ck() });
    expect(rep.data.items[0]).toMatchObject({ name: "Casa Nutra 1", growth: 75 });
    expect(rep.data.text).toContain("Mais escaladas do mês");
    expect((await call(relatorio.GET, { path: "/api/ofertas/casa/relatorio?mes=2099-01", cookie: ck() })).status).toBe(400);
  });

  it("rotina (cron): conta todas as organizações e a lista da casa; token errado não entra", async () => {
    expect((await call(atualizar.POST, { method: "POST", path: "/api/ofertas/atualizar", headers: { authorization: "Bearer errado" } })).status).toBe(401);
    await saveHouseLibraryToken("EAAtoken-da-casa-do-simulador-ofertas-0000000001");
    const r = await call(atualizar.POST, { method: "POST", path: "/api/ofertas/atualizar", headers: { authorization: `Bearer ${process.env.CRON_TOKEN}` } });
    expect(r.status).toBe(200);
    const house = r.data.results.filter((x: any) => x.kind === "casa");
    expect(house).toEqual([expect.objectContaining({ name: "Casa Nutra 1", status: "ok" })]);
    expect(r.data.results.some((x: any) => x.kind === "org" && x.name === "Repetida" && x.status === "ok")).toBe(true);
    // uma foto por dia: rodar de novo atualiza, não duplica
    await runHouseCount();
    expect(await HouseOfferDaily.countDocuments({ date: dayKey(Date.now()) })).toBe(1);
  });

  it("administrador muda as regras do selo e os países; o cartão segue a regra nova", async () => {
    const adm = cookieFor(admin);
    const bad = await call(adminConfig.PUT, { method: "PUT", path: "/api/admin/ofertas/config", cookie: adm, body: { acao: "regras", heatRules: [{ id: "x y" }] } });
    expect(bad.status).toBe(400);
    await call(adminConfig.PUT, { method: "PUT", path: "/api/admin/ofertas/config", cookie: adm, body: { acao: "regras", heatRules: [{ id: "grande", label: "Grande", tone: "green", minCount: 1 }] } });
    const list = await call(ofertas.GET, { path: "/api/ofertas", cookie: ck() });
    expect(list.data.offers.find((o: any) => o.name === "Oferta só Brasil").heat).toEqual({ id: "grande", label: "Grande", tone: "green" });
    const p = await call(adminConfig.PUT, { method: "PUT", path: "/api/admin/ofertas/config", cookie: adm, body: { acao: "paises", countries: "pt es" } });
    expect(p.data.countries).toEqual(["PT", "ES"]);
    const t = await call(adminConfig.PUT, { method: "PUT", path: "/api/admin/ofertas/config", cookie: adm, body: { acao: "testar_token" } });
    expect(t.data.token).toMatchObject({ has: true, lastTest: { ok: true } });
    expect(JSON.stringify(t.data)).not.toContain("EAAtoken");
    const back = await call(adminConfig.PUT, { method: "PUT", path: "/api/admin/ofertas/config", cookie: adm, body: { acao: "regras_padrao" } });
    expect(back.data.rules.map((r: any) => r.id)).toEqual(DEFAULT_HEAT_RULES.map((r) => r.id));
  });
});
