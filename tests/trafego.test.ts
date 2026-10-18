/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connectAdAccount, publicAdAccount, syncAdAccount } from "@/lib/ads/accounts";
import { MetaApiError, normalizeActId, setMetaFetch } from "@/lib/ads/client";
import { buildAdsDashboard } from "@/lib/ads/dashboard";
import { parseInsightRow, pickCandidates, sumRows } from "@/lib/ads/metrics";
import { metaMockFetch, youtubeMockFetch } from "@/lib/ads/mock";
import { performAdAction } from "@/lib/ads/write";
import { AD_LIBRARY_NOTE, IG_DISCOVERY_NOTE, adLibraryUrl, cleanIgHandle, productFields, refreshCompetitor, tryAdLibrary } from "@/lib/competitors/competitors";
import { fetchYoutubeChannel, parseYoutubeRef, setYoutubeFetch } from "@/lib/competitors/youtube";
import { encrypt } from "@/lib/crypto";
import { addDays, dayKey } from "@/lib/instagram/dates";
import { resolvePeriod } from "@/lib/instagram/period";
import type { FetchLike } from "@/lib/instagram/client";
import { AdAccount, AdInsightDaily } from "@/models/Ads";
import { Competitor, CompetitorDaily } from "@/models/Competitor";
import { InstagramMedia } from "@/models/InstagramMedia";
import Organization from "@/models/Organization";
import { HouseCredential } from "@/models/Platform";
import Project from "@/models/Project";
import ApiCredential from "@/models/ApiCredential";
import { call, cookieFor, makeOrg, makeUser, setTestEnv } from "./helpers";

const NOW = Date.parse("2026-10-18T15:00:00Z");
const TOKEN = "EAAtoken-de-teste-do-simulador-trafego-0001";
let mongo: MongoMemoryServer;
let org: any;
let owner: any;
let project: any;
let posts: { url: string; body: string }[] = [];

function recording(base: FetchLike): FetchLike {
  return async (url, init) => {
    if (init?.method === "POST") posts.push({ url, body: init.body || "" });
    return base(url, init);
  };
}

beforeAll(async () => {
  setTestEnv();
  setMetaFetch(recording(metaMockFetch(() => NOW)));
  setYoutubeFetch(youtubeMockFetch(() => NOW));
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("trafego"));
  org = await makeOrg("Cliente Tráfego", "cliente-trafego");
  owner = await makeUser(org._id, "owner", "dona@trafego.test");
  project = await Project.create({ organization: org._id, name: "Projeto Tráfego", slug: "projeto" });
});
afterAll(async () => {
  setMetaFetch(null);
  setYoutubeFetch(null);
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(() => {
  posts = [];
  delete process.env.TRAFEGO_WRITE_ENABLED;
});

describe("contas puras", () => {
  it("compra não é contada em dobro (omni_purchase, purchase e pixel são o mesmo evento)", () => {
    const r = parseInsightRow({
      date_start: "2026-10-01", ad_id: "1", adset_id: "2", campaign_id: "3", spend: "100.50", impressions: "10000", reach: "8000", clicks: "200", inline_link_clicks: "150",
      actions: [{ action_type: "omni_purchase", value: "3" }, { action_type: "purchase", value: "3" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" }, { action_type: "lead", value: "2" }, { action_type: "onsite_conversion.lead_grouped", value: "2" }],
      action_values: [{ action_type: "omni_purchase", value: "291.00" }],
    })!;
    expect(r).toMatchObject({ purchases: 3, leads: 2, purchaseValue: 291, spend: 100.5, linkClicks: 150 });
    expect(parseInsightRow({ date_start: "2026-10-01" })).toBeNull();
  });

  it("CPM, CPC, CTR e custo por resultado saem das SOMAS, não da média das médias", () => {
    const t = sumRows([
      { spend: 10, impressions: 1000, reach: 900, clicks: 10, linkClicks: 8, purchases: 1, purchaseValue: 50, leads: 0 },
      { spend: 90, impressions: 3000, reach: 2000, clicks: 90, linkClicks: 70, purchases: 1, purchaseValue: 50, leads: 4 },
    ]);
    expect(t).toMatchObject({ spend: 100, impressions: 4000, reachDaily: 2900, cpm: 25, cpc: 1, ctr: 2.5, costPerPurchase: 50, costPerLead: 25, roas: 1 });
    const zero = sumRows([]);
    expect([zero.cpm, zero.cpc, zero.ctr, zero.costPerPurchase, zero.roas]).toEqual([null, null, null, null, null]);
  });

  it("candidatos a anúncio: interesse por alcance, com alcance mínimo", () => {
    const list = [
      { igId: "a", reach: 1000, saved: 50, shares: 30, comments: 10, likes: 100 },
      { igId: "b", reach: 20, saved: 10, shares: 10, comments: 5, likes: 10 }, // pouca gente viu: fora
      { igId: "c", reach: 2000, saved: 5, shares: 2, comments: 1, likes: 60 },
      { igId: "d", reach: 900, saved: 0, shares: 0, comments: 0, likes: 0 },
    ];
    const r = pickCandidates(list, 3);
    expect(r.map((x) => x.igId)).toEqual(["a", "c", "d"]);
    expect(r[0].score).toBeGreaterThan(r[1].score);
  });

  it("ID da conta de anúncio aceita com ou sem act_ e recusa lixo", () => {
    expect(normalizeActId("803239545032201")).toBe("act_803239545032201");
    expect(normalizeActId(" act_909798644755420 ")).toBe("act_909798644755420");
    expect(normalizeActId("act_abc")).toBe("");
    expect(normalizeActId("123")).toBe("");
  });
});

describe("conectar e sincronizar (Meta simulada)", () => {
  let acc: any;
  it("token inválido não grava nada; token bom grava criptografado e nunca devolve", async () => {
    await expect(connectAdAccount(org._id, { project: String(project._id), adAccountId: "act_803239545032201", token: "EAA-token-invalido-000000000000000000" })).rejects.toBeInstanceOf(MetaApiError);
    await expect(connectAdAccount(org._id, { project: String(project._id), adAccountId: "act_404", token: TOKEN })).rejects.toThrow(/ID da conta|não enxerga/);
    expect(await AdAccount.countDocuments({ organization: org._id })).toBe(0);
    acc = await connectAdAccount(org._id, { project: String(project._id), adAccountId: "803239545032201", token: TOKEN });
    const raw: any = await AdAccount.collection.findOne({ _id: acc._id });
    expect(raw.credentials.accessToken.startsWith("enc:v1:")).toBe(true);
    expect(JSON.stringify(publicAdAccount(acc))).not.toContain(TOKEN);
    expect(acc.igUserId).toBe("17841400000000001");
    expect(acc.adAccountId).toBe("act_803239545032201");
  });

  it("1ª sincronização traz 90 dias por anúncio e por dia, campanhas, conjuntos e anúncios, e o alcance de verdade dos períodos-padrão", async () => {
    const r = await syncAdAccount(org._id, acc._id, { now: NOW });
    expect(r).toMatchObject({ ok: true, days: 90, campaigns: 3, adsets: 4, ads: 6, complete: true });
    expect(r.rows).toBeGreaterThan(400); // paginação de 200 em 200 percorrida
    const fresh: any = await AdAccount.findOne({ _id: acc._id, organization: org._id }).lean();
    expect(fresh.insightsSince).toBe(addDays(dayKey(NOW), -89));
    const p30 = resolvePeriod({ periodo: "30d" }, NOW);
    expect(fresh.reachByRange[`${p30.from}_${p30.to}`].reach).toBeGreaterThan(0);
    // 2ª vez: 30 dias, sem duplicar linha
    const before = await AdInsightDaily.countDocuments({ organization: org._id });
    const r2 = await syncAdAccount(org._id, acc._id, { now: NOW });
    expect(r2.days).toBe(30);
    expect(await AdInsightDaily.countDocuments({ organization: org._id })).toBe(before);
  });

  it("painel do período: totais = soma das linhas; alcance exato no preset e somado (com aviso) em datas livres; sem comparação quando falta o período anterior", async () => {
    const fresh: any = await AdAccount.findOne({ _id: acc._id, organization: org._id }).lean();
    const p = resolvePeriod({ periodo: "30d" }, NOW);
    const d = await buildAdsDashboard(org._id, fresh, p, NOW);
    const rows: any[] = await AdInsightDaily.find({ organization: org._id, date: { $gte: p.from, $lte: p.to } }).lean();
    expect(d.totals.spend).toBeCloseTo(rows.reduce((s, r) => s + r.spend, 0), 1);
    expect(d.reach.exact).toBe(true);
    expect(d.canCompare).toBe(true); // 90 dias de dados cobrem os 30 anteriores
    expect(d.rows.campaign.map((r) => r.name)).toContain("VENDAS | Curso | Advantage+");
    expect(d.rows.campaign.reduce((s, r) => s + r.totals.spend, 0)).toBeCloseTo(d.totals.spend, 1);
    expect(d.totals.purchases).toBeGreaterThan(0);
    const custom = resolvePeriod({ de: addDays(dayKey(NOW), -10), ate: addDays(dayKey(NOW), -3) }, NOW);
    expect((await buildAdsDashboard(org._id, fresh, custom, NOW)).reach.exact).toBe(false);
    const p90 = resolvePeriod({ periodo: "90d" }, NOW);
    const d90 = await buildAdsDashboard(org._id, fresh, p90, NOW);
    expect(d90.canCompare).toBe(false);
    expect(Object.values(d90.compare).every((v) => v === null)).toBe(true);
    // leitura não faz POST nenhum na Meta
    expect(posts).toEqual([]);
  });

  it("candidatos: posts orgânicos do projeto, marcando os que já viraram anúncio", async () => {
    const base = { organization: org._id, project: project._id, account: new mongoose.Types.ObjectId(), kind: "reel", timestamp: new Date(NOW - 3 * 86_400_000) };
    await InstagramMedia.create([
      { ...base, igId: "1800000000000101", caption: "Depoimento", metrics: { reach: 3000, saved: 120, shares: 80, comments: 30, likes: 400 } },
      { ...base, igId: "1800000000000555", caption: "Bastidores", metrics: { reach: 2500, saved: 90, shares: 40, comments: 10, likes: 300 } },
      { ...base, igId: "1800000000000556", caption: "Frase", metrics: { reach: 2600, saved: 2, shares: 1, comments: 1, likes: 50 } },
    ]);
    const fresh: any = await AdAccount.findOne({ _id: acc._id, organization: org._id }).lean();
    const d = await buildAdsDashboard(org._id, fresh, resolvePeriod({ periodo: "7d" }, NOW), NOW);
    expect(d.candidates.items[0]).toMatchObject({ igId: "1800000000000101", inAds: true });
    expect(d.candidates.items.find((m) => m.igId === "1800000000000555")?.inAds).toBe(false);
  });

  it("AÇÕES: duas chaves desligadas = 403 sem tocar na Meta; só com as duas ligadas sai um POST", async () => {
    const actor = { user: owner, ip: "1.1.1.1" };
    const body = { account: String(acc._id), level: "campaign", id: "120200000000001", action: "pause", confirm: true };
    await expect(performAdAction(org._id, body, actor)).rejects.toMatchObject({ status: 403 });
    process.env.TRAFEGO_WRITE_ENABLED = "true";
    await expect(performAdAction(org._id, body, actor)).rejects.toMatchObject({ status: 403 }); // falta a chave do cliente
    delete process.env.TRAFEGO_WRITE_ENABLED;
    await Organization.updateOne({ _id: org._id }, { $set: { adsWriteEnabled: true } });
    await expect(performAdAction(org._id, body, actor)).rejects.toMatchObject({ status: 403 }); // falta a env
    expect(posts).toEqual([]);

    process.env.TRAFEGO_WRITE_ENABLED = "true";
    await expect(performAdAction(org._id, { ...body, confirm: false }, actor)).rejects.toMatchObject({ field: "confirm" });
    await expect(performAdAction(org._id, { ...body, id: "999" }, actor)).rejects.toMatchObject({ status: 404 });
    expect(await performAdAction(org._id, body, actor)).toMatchObject({ ok: true, status: "PAUSED" });
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toMatch(/\/120200000000001$/);
    expect(posts[0].body).toContain("status=PAUSED");
    // orçamento: reais -> centavos
    await performAdAction(org._id, { account: String(acc._id), level: "campaign", id: "120200000000001", action: "budget", dailyBudget: "75,50", confirm: true }, actor);
    expect(posts[1].body).toContain("daily_budget=7550");
    await expect(performAdAction(org._id, { account: String(acc._id), level: "campaign", id: "120200000000003", action: "budget", dailyBudget: "10", confirm: true }, actor)).rejects.toThrow(/orçamento diário/);
    // anúncio novo a partir de post: sempre PAUSED
    const created = await performAdAction(org._id, { account: String(acc._id), action: "create_ad", adsetId: "120210000000001", igMediaId: "1800000000000555", confirm: true }, actor);
    expect(created.status).toBe("PAUSED");
    expect(posts.at(-1)!.body).toContain("status=PAUSED");
    expect(posts.at(-2)!.url).toMatch(/adcreatives$/);
    await Organization.updateOne({ _id: org._id }, { $set: { adsWriteEnabled: false } });
  });

  it("rota de ações: membro 403, dono com chaves desligadas 403", async () => {
    const { POST } = await import("@/app/api/trafego/acoes/route");
    const member = await makeUser(org._id, "member", "membro@trafego.test");
    const body = { account: String(acc._id), level: "campaign", id: "120200000000001", action: "pause", confirm: true };
    expect((await call(POST, { method: "POST", path: "/api/trafego/acoes", body, cookie: cookieFor(member) })).status).toBe(403);
    const r = await call(POST, { method: "POST", path: "/api/trafego/acoes", body, cookie: cookieFor(owner) });
    expect(r.status).toBe(403);
    expect(r.data.error).toMatch(/só leitura/);
  });

  it("cron da sincronização: percorre as organizações ativas, sem login não entra", async () => {
    const { POST } = await import("@/app/api/trafego/sync/route");
    expect((await call(POST, { method: "POST", path: "/api/trafego/sync" })).status).toBe(401);
    const r = await call(POST, { method: "POST", path: "/api/trafego/sync", headers: { authorization: `Bearer ${process.env.CRON_TOKEN}` } });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ ok: true, accounts: 1 });
  });
});

describe("concorrentes", () => {
  it("Instagram pelo Business Discovery (host do Facebook) e YouTube pela chave da casa", async () => {
    await HouseCredential.create({ service: "youtube", credentials: { apiKey: encrypt("AIzaChaveDeTesteDoSimulador000000000000") }, purposes: [] });
    const c: any = await Competitor.create({ organization: org._id, project: project._id, name: "Concorrente A", instagram: "concorrente_a", youtube: "@concorrentea" });
    const r = await refreshCompetitor(org._id, c, NOW);
    expect(r).toMatchObject({ instagram: "ok", youtube: "ok", ytUnits: 3 });
    expect(c.ig).toMatchObject({ followers: 182_400, mediaCount: 1430, error: "" });
    expect(c.ig.media).toHaveLength(12);
    expect(c.yt).toMatchObject({ subscribers: 412_000, house: true, error: "" });
    expect(c.yt.videos).toHaveLength(10);
    expect(await CompetitorDaily.countDocuments({ organization: org._id, competitor: c._id })).toBe(1);
    // @ que não é conta profissional
    const x: any = await Competitor.create({ organization: org._id, project: project._id, name: "Pessoal", instagram: "perfil_pessoal" });
    expect((await refreshCompetitor(org._id, x, NOW)).instagram).toBe("erro");
    expect(x.ig.error).toMatch(/profissional/);
  });

  it("sem conta de anúncio com Instagram ligado: explica que o login do Instagram não tem o recurso", async () => {
    const other = await makeOrg("Sem Token", "sem-token");
    const p = await Project.create({ organization: other._id, name: "P", slug: "p" });
    const c: any = await Competitor.create({ organization: other._id, project: p._id, name: "X", instagram: "concorrente_a", youtube: "@mentorab" });
    await ApiCredential.create({ organization: other._id, service: "youtube", label: "YouTube", credentials: { apiKey: encrypt("AIzaChavePropriaDoCliente000000000000") } });
    const r = await refreshCompetitor(other._id, c, NOW);
    expect(r.instagram).toBe("sem_token");
    expect(c.ig.error).toBe(IG_DISCOVERY_NOTE);
    expect(IG_DISCOVERY_NOTE).toMatch(/login do Instagram não tem esse recurso/);
    expect(c.yt).toMatchObject({ subscribers: 38_700, house: false });
  });

  it("YouTube: referências aceitas, chave recusada e canal inexistente com mensagem clara", async () => {
    expect(parseYoutubeRef("https://www.youtube.com/@MeuCanal")).toEqual({ handle: "MeuCanal" });
    expect(parseYoutubeRef("UCaaaaaaaaaaaaaaaaaaaaaa")).toEqual({ id: "UCaaaaaaaaaaaaaaaaaaaaaa" });
    expect(parseYoutubeRef("@ab")).toBeNull();
    await expect(fetchYoutubeChannel("@concorrentea", "chave-invalida")).rejects.toThrow(/recusada/);
    await expect(fetchYoutubeChannel("@naoexiste", "AIzaok")).rejects.toThrow(/Não achei/);
  });

  it("Biblioteca de Anúncios: link público filtrado no Brasil; a API vazia vem com a explicação", async () => {
    expect(adLibraryUrl({ name: "Escola X" })).toContain("country=BR");
    expect(adLibraryUrl({ name: "Escola X" })).toContain("q=Escola%20X");
    expect(adLibraryUrl({ facebookPage: "123456789" })).toContain("view_all_page_id=123456789");
    const c: any = await Competitor.findOne({ organization: org._id, instagram: "concorrente_a" });
    const r = await tryAdLibrary(org._id, c, NOW);
    expect(r).toMatchObject({ count: 0, error: "", note: AD_LIBRARY_NOTE });
    expect(AD_LIBRARY_NOTE).toMatch(/União Europeia/);
  });

  it("produtos e @: validação em português", async () => {
    expect(cleanIgHandle("https://www.instagram.com/Marca.X/")).toBe("marca.x");
    expect(() => cleanIgHandle("nome com espaço")).toThrow(/Confira o @/);
    expect(await productFields(org._id, { name: "Curso", price: "1.297,90", link: "https://exemplo.com" }, false)).toMatchObject({ name: "Curso", price: 1297.9 });
    await expect(productFields(org._id, { name: "Curso", price: "abc" }, false)).rejects.toMatchObject({ field: "price" });
    await expect(productFields(org._id, { name: "Curso", link: "javascript:alert(1)" }, false)).rejects.toMatchObject({ field: "link" });
  });
});
