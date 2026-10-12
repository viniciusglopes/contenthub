/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { GET as dashboardGET } from "@/app/api/instagram/dashboard/route";
import { GET as reportGET } from "@/app/api/instagram/report/route";
import { POST as syncPOST } from "@/app/api/instagram/sync/route";
import { connectInstagram } from "@/lib/instagram/accounts";
import { type FetchLike, setFetchOverride } from "@/lib/instagram/client";
import { mediaSinceOf } from "@/lib/instagram/data";
import { addDays, dayKey } from "@/lib/instagram/dates";
import { mockFetch } from "@/lib/instagram/mock";
import { type Period, resolvePeriod } from "@/lib/instagram/period";
import { buildPeriodReport } from "@/lib/instagram/report";
import { type DailyPoint, type MediaItem, buildPeriodDashboard, followersInPeriod, metricForPeriod } from "@/lib/instagram/stats";
import { syncAccount } from "@/lib/instagram/sync";
import { InstagramAccountDaily, InstagramMedia } from "@/models/InstagramMedia";
import Project from "@/models/Project";
import SocialAccount from "@/models/SocialAccount";
import { call, cookieFor, makeOrg, makeUser, setTestEnv } from "./helpers";

const DAY = 86_400_000;
// segunda, 12/10/2026, 12h de Brasília
const NOW = Date.parse("2026-10-12T15:00:00Z");
const at = (iso: string) => Date.parse(iso);

function series(toKey: string, n: number, f: (i: number, key: string) => Partial<DailyPoint>): DailyPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(toKey, -i);
    return { date, ...f(i, date) };
  });
}
const post = (id: string, iso: string, reach: number, kind: MediaItem["kind"] = "imagem"): MediaItem => ({
  igId: id, kind, caption: `Legenda ${id}`, timestamp: iso, metrics: { reach, views: reach * 2, saved: 2, shares: 1 },
});

describe("cálculo do período", () => {
  it("atalhos de 7, 30 e 90 dias terminam hoje e comparam com o período anterior do mesmo tamanho", () => {
    expect(resolvePeriod({}, NOW)).toMatchObject({ preset: "30d", from: "2026-09-13", to: "2026-10-12", days: 30, prevFrom: "2026-08-14", prevTo: "2026-09-12", compareLabel: "os 30 dias anteriores", includesToday: true });
    expect(resolvePeriod({ periodo: "7d" }, NOW)).toMatchObject({ from: "2026-10-06", to: "2026-10-12", days: 7, prevFrom: "2026-09-29", prevTo: "2026-10-05", compareLabel: "os 7 dias anteriores", label: "06/10 a 12/10" });
    expect(resolvePeriod({ periodo: "90d" }, NOW)).toMatchObject({ from: "2026-07-15", to: "2026-10-12", days: 90, prevFrom: "2026-04-16", prevTo: "2026-07-14" });
    expect(resolvePeriod({ dias: "30" }, NOW)).toMatchObject({ preset: "30d", from: "2026-09-13", days: 30 });
    expect(resolvePeriod({ dias: 14 }, NOW)).toMatchObject({ preset: "datas", from: "2026-09-29", to: "2026-10-12", days: 14, compareLabel: "os 14 dias anteriores" });
  });

  it("este mês e mês passado, com virada de mês e de ano", () => {
    expect(resolvePeriod({ periodo: "mes" }, NOW)).toMatchObject({ from: "2026-10-01", to: "2026-10-12", days: 12, prevFrom: "2026-09-19", prevTo: "2026-09-30", compareLabel: "os 12 dias anteriores" });
    expect(resolvePeriod({ periodo: "mes-passado" }, NOW)).toMatchObject({ from: "2026-09-01", to: "2026-09-30", days: 30, prevFrom: "2026-08-02", prevTo: "2026-08-31", includesToday: false, label: "01/09 a 30/09" });
    // dia 1º: "este mês" tem um dia só e compara com o dia anterior
    expect(resolvePeriod({ periodo: "mes" }, at("2026-11-01T12:00:00Z"))).toMatchObject({ from: "2026-11-01", to: "2026-11-01", days: 1, prevFrom: "2026-10-31", prevTo: "2026-10-31", compareLabel: "o dia anterior" });
    // março: mês passado é fevereiro (28 dias em 2026), e o anterior a ele cai em janeiro
    expect(resolvePeriod({ periodo: "mes-passado" }, at("2026-03-15T12:00:00Z"))).toMatchObject({ from: "2026-02-01", to: "2026-02-28", days: 28, prevFrom: "2026-01-04", prevTo: "2026-01-31" });
    // fevereiro bissexto
    expect(resolvePeriod({ periodo: "mes-passado" }, at("2028-03-10T12:00:00Z"))).toMatchObject({ from: "2028-02-01", to: "2028-02-29", days: 29 });
    // janeiro: mês passado é dezembro do ano anterior, e o rótulo passa a mostrar o ano
    expect(resolvePeriod({ periodo: "mes-passado" }, at("2027-01-05T12:00:00Z"))).toMatchObject({ from: "2026-12-01", to: "2026-12-31", days: 31, label: "01/12/2026 a 31/12/2026" });
    expect(resolvePeriod({ periodo: "7d" }, at("2027-01-03T12:00:00Z"))).toMatchObject({ from: "2026-12-28", to: "2027-01-03", label: "28/12/2026 a 03/01/2027" });
  });

  it("o dia vira no horário de Brasília, não em UTC", () => {
    // 01/11 02:30 UTC ainda é 31/10 23:30 em Brasília
    const late = at("2026-11-01T02:30:00Z");
    expect(resolvePeriod({ periodo: "mes" }, late)).toMatchObject({ from: "2026-10-01", to: "2026-10-31", days: 31 });
    expect(resolvePeriod({ periodo: "mes-passado" }, late)).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(resolvePeriod({ periodo: "7d" }, late).to).toBe("2026-10-31");
    // meia hora depois (03:00 UTC) já é 01/11
    expect(resolvePeriod({ periodo: "mes" }, at("2026-11-01T03:00:00Z"))).toMatchObject({ from: "2026-11-01", to: "2026-11-01" });
    // "hoje" de Brasília vale como data final mesmo quando em UTC já é amanhã; o amanhã de Brasília não
    expect(resolvePeriod({ de: "2026-10-30", ate: "2026-10-31" }, late).days).toBe(2);
    expect(() => resolvePeriod({ de: "2026-10-30", ate: "2026-11-01" }, late)).toThrow(/futuro/);
  });

  it("datas: valida com mensagem amigável e o campo certo", () => {
    expect(resolvePeriod({ de: "2026-09-01", ate: "2026-09-30" }, NOW)).toMatchObject({ preset: "datas", days: 30, prevFrom: "2026-08-02", prevTo: "2026-08-31" });
    expect(resolvePeriod({ de: "2026-10-12", ate: "2026-10-12" }, NOW)).toMatchObject({ days: 1, label: "12/10" });
    expect(resolvePeriod({ de: "2026-10-01" }, NOW).to).toBe("2026-10-12"); // sem "até": vai até hoje
    const fail = (i: any) => {
      try {
        resolvePeriod(i, NOW);
      } catch (e: any) {
        return { status: e.status, field: e.field, message: e.message };
      }
      return null;
    };
    expect(fail({ de: "2026-10-10", ate: "2026-10-01" })).toMatchObject({ status: 400, field: "ate", message: "A data final não pode ser antes da inicial." });
    expect(fail({ de: "2026-10-01", ate: "2026-10-13" })).toMatchObject({ status: 400, field: "ate", message: "A data final não pode ser no futuro." });
    expect(fail({ de: "2026-11-01", ate: "2026-11-02" })).toMatchObject({ field: "de" });
    expect(fail({ ate: "2026-10-01" })).toMatchObject({ field: "de", message: "Escolha a data inicial." });
    expect(fail({ de: "01/10/2026", ate: "2026-10-05" })).toMatchObject({ field: "de" });
    expect(fail({ de: "2026-02-30", ate: "2026-03-05" })).toMatchObject({ field: "de" }); // dia que não existe
    expect(fail({ de: "2024-01-01", ate: "2026-10-01" })).toMatchObject({ field: "ate", message: "Escolha um intervalo de até 12 meses." });
    expect(fail({ dias: "0" })).toMatchObject({ field: "dias" });
    expect(fail({ dias: "abc" })).toMatchObject({ field: "dias" });
    expect(fail({ dias: "9999" })).toMatchObject({ field: "dias" });
    expect(fail({ periodo: "ano" })).toMatchObject({ field: "periodo" });
    expect(fail({ de: { $gt: "" }, ate: "2026-10-01" })).toMatchObject({ status: 400 });
  });
});

describe("números do período", () => {
  const p30 = resolvePeriod({}, NOW);
  const today = dayKey(NOW);

  it("com histórico completo compara o mesmo número de dias fechados dos dois lados", () => {
    // 60 dias fechados até ontem: 100 por dia nos últimos 30, 80 antes
    const d = series("2026-10-11", 60, (i) => ({ reach: i < 30 ? 100 : 80, views: 10 }));
    const m = metricForPeriod(d, "reach", p30, today);
    // hoje ainda não fechou: 29 dias de cada lado
    expect(m).toMatchObject({ current: 2900, previous: 29 * 80, days: 29, expectedDays: 29, prevDays: 29, from: "2026-09-13", to: "2026-10-11" });
    expect(m.pct).toBeCloseTo(25);
    // período fechado (mês passado) usa os 30 dias inteiros
    const sep = metricForPeriod(d, "reach", resolvePeriod({ periodo: "mes-passado" }, NOW), today);
    expect(sep).toMatchObject({ days: 30, expectedDays: 30 });
  });

  it("período anterior incompleto: não inventa percentual", () => {
    // só 30 dias de dado (caso real de conta recém-conectada): o anterior não tem nada
    const d = series("2026-10-11", 30, () => ({ reach: 7000, views: 9000 }));
    const m = metricForPeriod(d, "reach", p30, today);
    expect(m).toMatchObject({ current: 29 * 7000, pct: null, prevDays: 0 });
    // anterior com MENOS dias que o atual também não compara (daria um salto falso)
    const d2 = series("2026-10-11", 35, () => ({ reach: 7000 }));
    expect(metricForPeriod(d2, "reach", p30, today)).toMatchObject({ pct: null, days: 29, prevDays: 5 });
    // em 7 dias o anterior está completo: aí compara
    expect(metricForPeriod(d2, "reach", resolvePeriod({ periodo: "7d" }, NOW), today)).toMatchObject({ pct: 0, days: 6, prevDays: 6 });
  });

  it("período sem dado nenhum e período que é só o dia de hoje", () => {
    const old = resolvePeriod({ de: "2026-01-01", ate: "2026-01-31" }, NOW);
    const d = series("2026-10-11", 30, () => ({ reach: 500, views: 900, followers: 100 }));
    const dash = buildPeriodDashboard(d, [post("a", "2026-10-01T12:00:00Z", 300)], old, { now: NOW, mediaSince: "2026-07-14" });
    expect(dash.reach).toMatchObject({ current: 0, days: 0, pct: null, expectedDays: 31 });
    expect(dash).toMatchObject({ posts: [], top10: [], postsReach: 0, followersDelta: null, postsIncomplete: true, accountIncomplete: true, prevPosts: null });
    expect(dash.coverage).toEqual({ accountSince: "2026-09-12", followersSince: "2026-09-12", mediaSince: "2026-07-14" });
    const onlyToday = metricForPeriod(d, "reach", resolvePeriod({ de: today, ate: today }, NOW), today);
    expect(onlyToday).toMatchObject({ days: 0, expectedDays: 0, pct: null, from: null });
    expect(buildPeriodDashboard([], [], p30, { now: NOW })).toMatchObject({ followers: null, followersDelta: null, posts: [], prevPosts: null });
  });

  it("seguidores: variação dentro do período, parcial quando o histórico começa depois, nada quando só há um registro", () => {
    const full = series(today, 40, (i) => ({ followers: 1000 - i * 2 }));
    expect(followersInPeriod(full, p30)).toMatchObject({ end: 1000, start: 940, delta: 60, partial: false, since: "2026-09-12" });
    const short = series(today, 5, (i) => ({ followers: 1000 - i }));
    expect(followersInPeriod(short, p30)).toMatchObject({ delta: 4, partial: true, since: "2026-10-08" });
    expect(followersInPeriod([{ date: today, followers: 9962 }], p30)).toBeNull();
    // período todo antes da conexão
    expect(followersInPeriod(short, resolvePeriod({ periodo: "mes-passado" }, NOW))).toBeNull();
  });

  it("alcance da conta e alcance dos posts são números diferentes, lado a lado (caso real @drwaldirlopes)", () => {
    // 30 dias de alcance diário somando 231.180 e 4 posts no período somando 3.782
    const reachByDay = [12811, 3090, 16697, 10630, 7382, 6967, 8474, 8825, 8997, 8962, 7223, 8234, 5913, 5978, 7265, 7276, 6169, 5165, 5693, 5791, 7407, 9536, 11046, 7494, 6806, 6517, 5645, 5470, 6455, 7262];
    const d: DailyPoint[] = reachByDay.map((reach, i) => ({ date: addDays("2026-09-12", i), reach, views: reach }));
    d.push({ date: today, followers: 9962 });
    const media = [
      post("p1", "2026-10-04T22:14:18Z", 381),
      post("p2", "2026-10-03T13:22:30Z", 778, "carrossel"),
      post("p3", "2026-09-30T17:44:36Z", 1318, "carrossel"),
      post("p4", "2026-09-23T20:11:49Z", 1305, "reel"),
      post("p0", "2026-09-01T14:57:59Z", 572, "reel"),
    ];
    const closed = resolvePeriod({ de: "2026-09-12", ate: "2026-10-11" }, NOW);
    const dash = buildPeriodDashboard(d, media, closed, { now: NOW, mediaSince: "2026-07-14" });
    expect(dash.reach).toMatchObject({ current: 231180, days: 30, pct: null });
    expect(dash.postsReach).toBe(3782);
    expect(dash.posts).toHaveLength(4);
    // o período anterior de posts está coberto pela busca (desde 14/07): 13/08 a 11/09 tem 1 post
    expect(dash).toMatchObject({ prevPosts: 1, prevPostsReach: 572, postsIncomplete: false });
    const text = buildPeriodReport({ username: "drwaldirlopes", daily: d, media, period: closed, mediaSince: "2026-07-14", now: NOW });
    expect(text).toContain("Período de 12/09/2026 a 11/10/2026 (30 dias)");
    expect(text).toContain("Comparação com os 30 dias anteriores: 13/08/2026 a 11/09/2026");
    expect(text).toContain("Alcance da conta (soma dos dias, a mesma pessoa pode contar mais de uma vez): 231.180 (sem comparação ainda)");
    expect(text).toContain("Alcance dos posts do período (soma do alcance dos 4 posts publicados): 3.782");
    expect(text).toContain("Posts publicados: 4 (1 nos 30 dias anteriores)");
    expect(text).not.toMatch(/[—–*_`]/); // texto plano, sem travessão nem markdown
  });

  it("relatório do período sem dado não quebra e avisa até onde vão os posts", () => {
    const old: Period = resolvePeriod({ de: "2026-01-01", ate: "2026-01-31" }, NOW);
    const text = buildPeriodReport({ username: "x", daily: [], media: [], period: old, mediaSince: "2026-07-14", now: NOW });
    expect(text).toContain("Alcance da conta: sem dado no período");
    expect(text).toContain("Posts publicados: 0");
    expect(text).toContain("os posts só foram buscados desde 14/07/2026");
    expect(text).toContain("Seguidores: ainda sem histórico");
  });
});

// ---------------------------------------------------------------------------
// Meta simulada com paginação de verdade, para o histórico de 12 meses.
// ---------------------------------------------------------------------------
const USER_ID = "17841400000000777";
function fakeMeta(opts: { posts: number; everyDays: number; now: number; limitAtCall?: number; limitOnPage?: number; accountDays?: number }) {
  const log = { calls: 0, pages: 0, insights: 0, account: 0, cursors: [] as string[], writes: 0 };
  const all = Array.from({ length: opts.posts }, (_, i) => ({
    id: `1790000000${String(10000 + i)}`,
    media_type: i % 2 ? "IMAGE" : "VIDEO",
    media_product_type: i % 2 ? "FEED" : "REELS",
    caption: `Post ${i}`,
    permalink: `https://www.instagram.com/p/H${i}/`,
    timestamp: new Date(opts.now - (i * opts.everyDays + 0.5) * DAY).toISOString(),
    like_count: 10,
    comments_count: 1,
  }));
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  const limited = () => ({ ok: false, status: 400, json: async () => ({ error: { code: 4, message: "Application request limit reached", type: "OAuthException" } }) });
  const f: FetchLike = async (url, init) => {
    log.calls++;
    if (init?.method && init.method !== "GET") log.writes++;
    const u = new URL(url);
    const path = u.pathname.replace(/^\/v\d+\.\d+/, "");
    const q = u.searchParams;
    if (opts.limitAtCall && log.calls >= opts.limitAtCall) return limited();
    if (path === "/me") return ok({ user_id: USER_ID, username: "historico", account_type: "BUSINESS", followers_count: 5000, media_count: opts.posts });
    if (path === `/${USER_ID}/media`) {
      log.pages++;
      if (opts.limitOnPage && log.pages >= opts.limitOnPage) return limited();
      const limit = Number(q.get("limit") || 25);
      const start = Number(q.get("after") || 0);
      log.cursors.push(q.get("after") || "");
      const data = all.slice(start, start + limit);
      const more = start + limit < all.length;
      return ok({ data, paging: { cursors: { after: String(start + limit) }, ...(more ? { next: "https://graph.instagram.com/proxima" } : {}) } });
    }
    if (path === `/${USER_ID}/insights`) {
      log.account++;
      // a Meta só guarda as métricas da conta por N dias: antes disso vem vazio
      const ageDays = (opts.now / 1000 - Number(q.get("since"))) / 86_400;
      if (ageDays > (opts.accountDays ?? 90) + 1) return ok({ data: [] });
      return ok({ data: [{ name: "reach", total_value: { value: 1000 } }, { name: "views", total_value: { value: 1500 } }] });
    }
    const m = /^\/(\d+)\/insights$/.exec(path);
    if (m) {
      log.insights++;
      return ok({ data: (q.get("metric") || "").split(",").filter((k) => !k.startsWith("ig_reels")).map((name) => ({ name, values: [{ value: 7 }] })) });
    }
    return { ok: false, status: 400, json: async () => ({ error: { code: 100, message: "Unsupported request" } }) };
  };
  return { f, log, all };
}

let mongo: MongoMemoryServer;
let org: mongoose.Types.ObjectId;
let owner: any;
let n = 0;
async function freshAccount(f: FetchLike, now = NOW) {
  const project = await Project.create({ organization: org, name: `Histórico ${++n}`, slug: `historico-${n}` });
  const acc = await connectInstagram(org, { project: String(project._id), token: `IGAA-token-de-historico-00000${n}` }, { fetchImpl: f, now });
  return { accountId: String(acc._id), projectId: String(project._id) };
}

beforeAll(async () => {
  setTestEnv();
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("periodo"));
  const o = await makeOrg("Cliente do Período", "cliente-periodo");
  org = o._id;
  owner = await makeUser(org, "owner", "dona@periodo.test");
});
afterAll(async () => {
  setFetchOverride(null);
  await mongoose.disconnect();
  await mongo.stop();
});

describe("histórico de 12 meses com a Meta simulada", () => {
  it("primeira sincronização pagina até 12 meses, para na data de corte e só lê", async () => {
    // 130 posts, um a cada 4 dias = 520 dias: só os de até 365 dias entram
    const meta = fakeMeta({ posts: 130, everyDays: 4, now: NOW });
    const { accountId } = await freshAccount(meta.f);
    const before = meta.log.calls;
    const r = await syncAccount(org, accountId, { fetchImpl: meta.f, now: NOW });
    const expected = meta.all.filter((m) => Date.parse(m.timestamp) >= NOW - 365 * DAY).length;
    expect(expected).toBe(92);
    expect(r).toMatchObject({ ok: true, history: true, media: expected, stopped: "", mediaSince: dayKey(NOW - 365 * DAY) });
    expect(r.warnings).toEqual([]);
    expect(dayKey(new Date(r.oldestPost!))).toBe("2025-10-13");
    // 2 páginas de 50 (a 2ª já cruza a data de corte: não pede a 3ª) e o cursor anda
    expect(meta.log.pages).toBe(2);
    expect(meta.log.cursors).toEqual(["", "50"]);
    expect(meta.log.insights).toBe(expected);
    // conta: tenta 90 dias + desiste após 5 vazios seguidos; nunca 365 chamadas
    expect(r.days).toBe(90);
    expect(meta.log.account).toBe(90);
    expect(r.calls).toBe(meta.log.calls - before);
    expect(meta.log.writes).toBe(0); // nenhum POST: só leitura no Instagram
    expect(await InstagramMedia.countDocuments({ organization: org, account: accountId })).toBe(expected);
    const acc = await SocialAccount.findOne({ _id: accountId, organization: org }).lean<any>();
    expect(dayKey(new Date(acc.mediaHistorySince))).toBe("2025-10-12");
    expect(acc.historyFetchedAt).toEqual(new Date(NOW));
    expect(mediaSinceOf(acc)).toBe("2025-10-12");
  });

  it("nas diárias busca só o recente e não encolhe o que o histórico já cobriu", async () => {
    const meta = fakeMeta({ posts: 130, everyDays: 4, now: NOW });
    const { accountId } = await freshAccount(meta.f);
    await syncAccount(org, accountId, { fetchImpl: meta.f, now: NOW });
    const next = NOW + DAY;
    const meta2 = fakeMeta({ posts: 130, everyDays: 4, now: NOW });
    const r = await syncAccount(org, accountId, { fetchImpl: meta2.f, now: next });
    expect(r).toMatchObject({ ok: true, history: false, mediaSince: "2025-10-12" });
    expect(r.media).toBe(meta2.all.filter((m) => Date.parse(m.timestamp) >= next - 90 * DAY).length);
    expect(r.media).toBeLessThan(30);
    expect(meta2.log.pages).toBe(1);
    expect(meta2.log.account).toBeLessThanOrEqual(4);
    expect(await InstagramMedia.countDocuments({ organization: org, account: accountId })).toBe(92);
  });

  it("a Meta só devolve os dias que guarda: para de insistir depois de 5 dias vazios seguidos", async () => {
    const meta = fakeMeta({ posts: 3, everyDays: 4, now: NOW, accountDays: 20 });
    const { accountId } = await freshAccount(meta.f);
    const r = await syncAccount(org, accountId, { fetchImpl: meta.f, now: NOW });
    expect(r.ok).toBe(true);
    expect(r.days).toBe(20);
    expect(meta.log.account).toBe(25);
    expect(await InstagramAccountDaily.countDocuments({ organization: org, account: accountId, reach: { $ne: null } })).toBe(20);
  });

  it("limite de taxa no meio da paginação: guarda o que veio e avisa com clareza", async () => {
    const meta = fakeMeta({ posts: 130, everyDays: 2, now: NOW, limitOnPage: 2 });
    const { accountId } = await freshAccount(meta.f);
    const r = await syncAccount(org, accountId, { fetchImpl: meta.f, now: NOW });
    expect(r).toMatchObject({ ok: true, history: true, media: 50, stopped: "o Instagram limitou as chamadas" });
    expect(r.warnings.join(" ")).toMatch(/parou antes do fim: o Instagram limitou as chamadas\. Vieram 50 posts, o mais antigo de \d\d\/\d\d\/2026\. Espere cerca de 1 hora e busque de novo/);
    // "posts desde" = o mais antigo que veio, não os 12 meses que ainda não buscou
    expect(r.mediaSince).toBe(dayKey(new Date(r.oldestPost!)));
    expect(meta.log.pages).toBe(2); // não insiste depois do limite
    const acc = await SocialAccount.findOne({ _id: accountId, organization: org }).lean<any>();
    expect(acc.historyNote).toMatch(/limitou/);
    expect(acc.lastSyncError).toBe("");
  });

  it("limite de taxa nas métricas dos posts e limite na 1ª página", async () => {
    // chamadas: /me (conectar), /me, 90 dias, 1 página, depois métricas; corta na 100ª chamada
    const meta = fakeMeta({ posts: 30, everyDays: 2, now: NOW, limitAtCall: 100 });
    const { accountId } = await freshAccount(meta.f);
    const r = await syncAccount(org, accountId, { fetchImpl: meta.f, now: NOW });
    expect(r.ok).toBe(true);
    expect(r.media).toBe(6);
    expect(r.stopped).toMatch(/limitou/);
    expect(meta.log.calls).toBe(100); // parou na hora
    // limite já na primeira página: é erro (não há nada para guardar), com mensagem amigável
    const hard = fakeMeta({ posts: 30, everyDays: 2, now: NOW, limitOnPage: 1 });
    const b = await freshAccount(hard.f);
    const r2 = await syncAccount(org, b.accountId, { fetchImpl: hard.f, now: NOW });
    expect(r2.ok).toBe(false);
    expect(r2.error).toMatch(/pediu para esperar/);
  });

  it("teto de segurança: chamadas e quantidade de posts por rodada", async () => {
    const meta = fakeMeta({ posts: 300, everyDays: 1, now: NOW });
    const { accountId } = await freshAccount(meta.f);
    const r = await syncAccount(org, accountId, { fetchImpl: meta.f, now: NOW, maxCalls: 120 });
    expect(r.ok).toBe(true);
    expect(r.calls).toBeLessThanOrEqual(121);
    expect(r.stopped).toBe("teto de segurança de 120 chamadas por rodada");
    expect(r.media).toBeGreaterThan(0);
    expect(r.media).toBeLessThan(60);
    const meta2 = fakeMeta({ posts: 300, everyDays: 1, now: NOW });
    const b = await freshAccount(meta2.f);
    const r2 = await syncAccount(org, b.accountId, { fetchImpl: meta2.f, now: NOW, maxMedia: 100 });
    expect(r2).toMatchObject({ ok: true, media: 100, stopped: "teto de segurança de 100 posts por rodada" });
    expect(meta2.log.pages).toBe(2);
    // buscar de novo com teto maior completa, sem duplicar
    const r3 = await syncAccount(org, b.accountId, { fetchImpl: meta2.f, now: NOW, history: true });
    expect(r3).toMatchObject({ ok: true, history: true, media: 300, stopped: "" });
    expect(await InstagramMedia.countDocuments({ organization: org, account: b.accountId })).toBe(300);
  });

  it("conta sincronizada antes do registro de histórico: considera os 90 dias que já buscava", () => {
    expect(mediaSinceOf({ lastSync: new Date("2026-10-12T21:09:38Z") })).toBe("2026-07-14");
    expect(mediaSinceOf({})).toBeNull();
    expect(mediaSinceOf({ mediaHistorySince: new Date("2025-10-12T15:00:00Z"), lastSync: new Date() })).toBe("2025-10-12");
  });
});

describe("parâmetros de período na API", () => {
  let projectId = "";
  let accountId = "";
  let cookie = "";
  const today = dayKey(Date.now());

  beforeAll(async () => {
    setFetchOverride(mockFetch());
    const p = await Project.create({ organization: org, name: "Projeto da API", slug: "projeto-api" });
    projectId = String(p._id);
    const acc = await connectInstagram(org, { project: projectId, token: "IGAA-conta-apiperiodo-0000001" });
    accountId = String(acc._id);
    await syncAccount(org, accountId);
    cookie = cookieFor(owner);
  });
  const dash = (q: string) => call(dashboardGET, { path: `/api/instagram/dashboard?project=${projectId}${q}`, cookie });
  const report = (q: string) => call(reportGET, { path: `/api/instagram/report?project=${projectId}${q}`, cookie });

  it("painel: padrão 30 dias; dias, periodo e de/ate mudam os números de forma coerente", async () => {
    const d30 = await dash("");
    expect(d30.status).toBe(200);
    expect(d30.data.period).toMatchObject({ preset: "30d", days: 30, to: today });
    const d7 = await dash("&dias=7");
    const d90 = await dash("&periodo=90d");
    expect(d7.data.period).toMatchObject({ preset: "7d", days: 7 });
    expect(d90.data.period).toMatchObject({ preset: "90d", days: 90 });
    const [a, b, c] = [d7, d30, d90].map((r) => r.data.dashboard);
    expect(a.posts.length).toBeLessThan(b.posts.length);
    expect(b.posts.length).toBeLessThanOrEqual(c.posts.length);
    expect(a.reach.current).toBeLessThan(b.reach.current);
    expect(b.reach.current).toBeLessThan(c.reach.current);
    expect(a.reach).toMatchObject({ days: 6, expectedDays: 6 });
    expect(c.reach).toMatchObject({ days: 89, expectedDays: 89, pct: null }); // não há 90 dias antes para comparar
    expect(a.reach.pct).not.toBeNull();
    expect(a.postsReach).toBe(a.posts.reduce((s: number, m: any) => s + (m.metrics.reach ?? 0), 0));
    expect(b.top10.length).toBeLessThanOrEqual(10);
    // todo post devolvido está dentro do período
    for (const m of a.posts) expect(dayKey(new Date(m.timestamp)) >= d7.data.period.from).toBe(true);
    // intervalo de datas
    const from = addDays(today, -20);
    const to = addDays(today, -11);
    const dd = await dash(`&de=${from}&ate=${to}`);
    expect(dd.data.period).toMatchObject({ preset: "datas", from, to, days: 10, compareLabel: "os 10 dias anteriores" });
    expect(dd.data.dashboard.reach).toMatchObject({ days: 10, expectedDays: 10 });
    expect(dd.data.dashboard.reach.pct).not.toBeNull();
    for (const m of dd.data.dashboard.posts) {
      const k = dayKey(new Date(m.timestamp));
      expect(k >= from && k <= to).toBe(true);
    }
    expect(dd.data.dashboard.coverage.mediaSince).toBe(dayKey(Date.now() - 365 * DAY));
    expect(JSON.stringify(dd.data)).not.toContain("IGAA");
  });

  it("painel: período sem dado devolve vazio (não erro); período inválido devolve 400 com o campo", async () => {
    const old = await dash(`&de=${addDays(today, -300)}&ate=${addDays(today, -290)}`);
    expect(old.status).toBe(200);
    expect(old.data.dashboard).toMatchObject({ posts: [], postsReach: 0, followersDelta: null, accountIncomplete: true });
    expect(old.data.dashboard.reach).toMatchObject({ days: 0, pct: null });
    for (const [q, field] of [
      [`&de=${today}&ate=${addDays(today, -1)}`, "ate"],
      [`&de=${today}&ate=${addDays(today, 1)}`, "ate"],
      ["&de=ontem&ate=hoje", "de"],
      ["&dias=0", "dias"],
      ["&dias=1e9", "dias"],
      ["&periodo=tudo", "periodo"],
      ["&ate=2026-01-01", "de"],
    ]) {
      const r = await dash(q);
      expect(r.status, q).toBe(400);
      expect(r.data.field, q).toBe(field);
      expect(r.data.error, q).toBeTruthy();
    }
  });

  it("relatório: mantém tipo=segunda|raiox e aceita de/ate, dias e periodo", async () => {
    const seg = await report("");
    expect(seg.data.tipo).toBe("segunda");
    expect(seg.data.reports[0].text).toContain("RELATÓRIO DA SEGUNDA");
    const raiox = await report("&tipo=raiox");
    expect(raiox.data).toMatchObject({ tipo: "raiox", period: null });
    expect(raiox.data.reports[0].text).toContain("RAIO-X DE 30 DIAS");
    const p7 = await report("&dias=7");
    expect(p7.data.tipo).toBe("periodo");
    expect(p7.data.period).toMatchObject({ days: 7 });
    expect(p7.data.reports[0].text).toContain("RELATÓRIO DO PERÍODO: @apiperiodo");
    expect(p7.data.reports[0].text).toContain("(7 dias)");
    expect(p7.data.reports[0].text).toContain("sobre os 7 dias anteriores");
    const from = addDays(today, -40);
    const to = addDays(today, -11);
    const pd = await report(`&de=${from}&ate=${to}&tipo=raiox`);
    expect(pd.data.tipo).toBe("periodo"); // com período, o tipo é ignorado
    expect(pd.data.reports[0].text).toContain("(30 dias)");
    expect(pd.data.reports[0].text).toContain("Alcance dos posts do período");
    expect((await report("&periodo=mes-passado")).data.period.preset).toBe("mes-passado");
    const bad = await report(`&de=${today}&ate=${addDays(today, 3)}`);
    expect(bad.status).toBe(400);
    expect(bad.data.field).toBe("ate");
    // rotina (cron) também aceita o período
    const cron = await call(reportGET, { path: "/api/instagram/report?dias=30", headers: { authorization: `Bearer ${process.env.CRON_TOKEN}` } });
    expect(cron.status).toBe(200);
    expect(cron.data.tipo).toBe("periodo");
    expect(cron.data.reports.length).toBeGreaterThan(0);
  });

  it("sincronizar: historico exige a conta e nunca roda pelo cron", async () => {
    const semConta = await call(syncPOST, { method: "POST", path: "/api/instagram/sync", body: { historico: true }, cookie });
    expect(semConta.status).toBe(400);
    const ok = await call(syncPOST, { method: "POST", path: "/api/instagram/sync", body: { account: accountId, historico: true }, cookie });
    expect(ok.status).toBe(200);
    expect(ok.data.results[0]).toMatchObject({ ok: true, history: true, mediaSince: dayKey(Date.now() - 365 * DAY) });
    const diaria = await call(syncPOST, { method: "POST", path: "/api/instagram/sync", body: { account: accountId }, cookie });
    expect(diaria.data.results[0]).toMatchObject({ ok: true, history: false });
    const cron = await call(syncPOST, { method: "POST", path: "/api/instagram/sync", body: { historico: true }, headers: { authorization: `Bearer ${process.env.CRON_TOKEN}` } });
    expect(cron.status).toBe(200);
    // contas que já sincronizaram: a rotina faz só a diária
    expect(cron.data.results.filter((r: any) => r.accountId === accountId)[0]).toMatchObject({ history: false });
  });
});
