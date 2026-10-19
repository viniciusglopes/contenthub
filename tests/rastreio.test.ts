/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { setCapiFetch } from "@/lib/tracking/capi";
import { buildUserData, checkKiwifySignature, normPhoneForMeta, parseHotmart, parseKiwify, sha256, touchFromParams } from "@/lib/tracking/pure";
import { dayKey } from "@/lib/instagram/dates";
import { Contact } from "@/models/Automation";
import { AdInsightDaily, AdObject } from "@/models/Ads";
import { ConsentLog, LeadEvent } from "@/models/Crm";
import { CapiLog, Sale, SalesIntegration, TrackEvent, TrackVisitor, TrackingSite } from "@/models/Tracking";
import Organization from "@/models/Organization";
import Project from "@/models/Project";
import * as sites from "@/app/api/rastreio/sites/route";
import * as site from "@/app/api/rastreio/sites/[id]/route";
import * as testar from "@/app/api/rastreio/sites/[id]/testar/route";
import * as integracoes from "@/app/api/rastreio/integracoes/route";
import * as overview from "@/app/api/rastreio/route";
import * as script from "@/app/api/t/[key]/script/route";
import * as evento from "@/app/api/t/[key]/evento/route";
import * as vendas from "@/app/api/vendas/[provider]/[key]/route";
import * as relatorios from "@/app/api/crm/relatorios/route";
import * as leadRoute from "@/app/api/crm/leads/[id]/route";
import * as exportar from "@/app/api/crm/leads/[id]/exportar/route";
import { call, cookieFor, makeOrg, makeUser, setTestEnv } from "./helpers";

// RASTREAMENTO PRÓPRIO: script do site (consentimento, toques, fbc/fbp, lead), webhooks de venda
// (Hotmart hottok, Kiwify HMAC, idempotência, ligação com o lead, etapa), API de Conversões
// (hash, event_id, chaves, registro) e o painel de atribuição com receita e ROAS. Meta simulada.

let mongo: MongoMemoryServer;
const A: any = {};
const B: any = {};
const capiCalls: { url: string; body: URLSearchParams }[] = [];
const HOTTOK = "hottok-de-teste-da-hotmart-123";
const KIWI = "token-de-teste-kiwify";
const VID = "a1b2c3d4e5f6a1b2c3d4e5f6";
const UA = "Mozilla/5.0 (teste)";

function beacon(key: string, body: unknown, ip = "10.1.1.1") {
  const raw = JSON.stringify(body);
  return evento.POST(new NextRequest(`http://localhost/api/t/${key}/evento`, { method: "POST", body: raw, headers: { "content-type": "text/plain", "x-forwarded-for": ip, "user-agent": UA, origin: "https://loja.exemplo.com.br" } }), { params: Promise.resolve({ key }) });
}
function webhook(provider: string, key: string, body: unknown, opts: { hottok?: string; sign?: string; query?: string } = {}) {
  const raw = JSON.stringify(body);
  const sig = opts.sign !== undefined ? opts.sign : createHmac("sha1", KIWI).update(raw).digest("hex");
  const qs = provider === "kiwify" ? `?signature=${sig}` : "";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (provider === "hotmart" && opts.hottok !== "") headers["x-hotmart-hottok"] = opts.hottok ?? HOTTOK;
  return vendas.POST(new NextRequest(`http://localhost/api/vendas/${provider}/${key}${qs}`, { method: "POST", body: raw, headers }), { params: Promise.resolve({ provider, key }) }).then(async (r) => ({ status: r.status, data: await r.json() }));
}
const hotmartBody = (ev: string, tx: string, extra: Record<string, any> = {}) => ({
  id: `evt-${tx}-${ev}`, event: ev, version: "2.0.0", creation_date: Date.now(),
  data: { product: { id: 123, name: "Mentoria 90 dias" }, buyer: { email: "comprador@exemplo.com", name: "Carlos Souza", checkout_phone: "11 98765-4321", ...(extra.buyer || {}) }, purchase: { transaction: tx, status: ev, price: { value: 997, currency_value: "BRL" }, origin: { src: VID, sck: VID, ...(extra.origin || {}) } } },
});

beforeAll(async () => {
  setTestEnv();
  Object.assign(process.env, { APP_URL: "https://contenthub.exemplo.test", TRACKING_ENABLED: "true", CAPI_ENABLED: "true" });
  setCapiFetch((async (url: string, init: any) => {
    capiCalls.push({ url, body: new URLSearchParams(init?.body || "") });
    return { ok: true, status: 200, json: async () => ({ events_received: 1, fbtrace_id: "Afake", messages: [] }), text: async () => "" };
  }) as any);
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("rastreio"));
  for (const [side, tag] of [[A, "alfa"], [B, "beta"]] as const) {
    side.org = await makeOrg(`Cliente ${tag}`, `cliente-${tag}`, { trackingEnabled: true, capiEnabled: true });
    side.owner = await makeUser(side.org._id, "owner", `dona@${tag}.test`);
    side.member = await makeUser(side.org._id, "member", `membro@${tag}.test`);
    side.cookie = cookieFor(side.owner);
    side.project = await Project.create({ organization: side.org._id, name: `Projeto ${tag}`, slug: "projeto" });
  }
});
afterAll(async () => {
  setCapiFetch(null);
  await mongoose.disconnect();
  await mongo.stop();
  for (const k of ["TRACKING_ENABLED", "CAPI_ENABLED"]) delete process.env[k];
});
beforeEach(async () => {
  capiCalls.length = 0;
  for (const M of [Contact, LeadEvent, ConsentLog, CapiLog, Sale, SalesIntegration, TrackEvent, TrackVisitor, TrackingSite, AdObject, AdInsightDaily]) await M.collection.deleteMany({});
  process.env.TRACKING_ENABLED = "true";
  process.env.CAPI_ENABLED = "true";
  await Organization.updateMany({}, { $set: { trackingEnabled: true, capiEnabled: true } });
});

async function newSite(side: any, body: Record<string, unknown> = {}) {
  const r = await call(sites.POST, { method: "POST", path: "/api/rastreio/sites", cookie: side.cookie, body: { project: String(side.project._id), domains: "loja.exemplo.com.br", ...body } });
  expect(r.status, r.text).toBe(201);
  return r.data;
}
async function newIntegration(side: any, provider: string, extra: Record<string, unknown> = {}) {
  const r = await call(integracoes.POST, { method: "POST", path: "/api/rastreio/integracoes", cookie: side.cookie, body: { provider, secret: provider === "hotmart" ? HOTTOK : KIWI, project: String(side.project._id), ...extra } });
  expect(r.status, r.text).toBe(201);
  return r.data;
}
const capiOn = (s: any, extra: Record<string, unknown> = {}) => call(site.PUT, { method: "PUT", path: "/api/rastreio/sites/x", params: { id: s._id }, cookie: A.cookie, body: { pixelId: "1234567890123", capiToken: "EAAtoken-da-api-de-conversoes-0000000001", capiEnabled: true, ...extra } });

describe("funções puras", () => {
  it("normalização e hash da Meta: e-mail minúsculo, telefone com 55, IP/UA/fbc sem hash", () => {
    expect(normPhoneForMeta("(11) 98765-4321")).toBe("5511987654321");
    expect(normPhoneForMeta("+55 11 98765-4321")).toBe("5511987654321");
    const { userData, keys } = buildUserData({ email: " Ana@X.com ", phone: "11987654321", name: "Ána Maria Lima", externalId: "abc", fbc: "fb.1.1700000000000.IwAR", fbp: "fb.1.1700000000000.123456", ip: "1.2.3.4", ua: UA });
    expect(userData.em).toEqual([sha256("ana@x.com")]);
    expect(userData.ph).toEqual([sha256("5511987654321")]);
    expect(userData.fn).toEqual([sha256("ana")]);
    expect(userData.ln).toEqual([sha256("lima")]);
    expect([userData.fbc, userData.client_ip_address, userData.client_user_agent]).toEqual(["fb.1.1700000000000.IwAR", "1.2.3.4", UA]);
    expect(keys.sort()).toEqual(["client_ip_address", "client_user_agent", "em", "external_id", "fbc", "fbp", "fn", "ln", "ph"]);
  });
  it("toque: UTMs, ids dinâmicos da Meta e id de clique", () => {
    const t = touchFromParams({ utm_source: "facebook", utm_campaign: "120210000000001", utm_content: "120210000000003", utm_term: "120210000000002", fbclid: "IwAR1" });
    expect(t).toMatchObject({ source: "facebook", campaignId: "120210000000001", adsetId: "120210000000002", adId: "120210000000003", clickType: "fbclid", clickId: "IwAR1" });
  });
  it("Hotmart e Kiwify: leitura do corpo e assinatura", () => {
    const h = parseHotmart(hotmartBody("PURCHASE_APPROVED", "HP123", { origin: { sck: "utm_campaign=outubro|utm_source=ig" } }))!;
    expect(h).toMatchObject({ externalId: "HP123", kind: "approved", value: 997, product: "Mentoria 90 dias", src: VID, buyer: { email: "comprador@exemplo.com" } });
    expect(h.params).toMatchObject({ utm_campaign: "outubro", utm_source: "ig" });
    expect(parseHotmart({ event: "PURCHASE_OUT_OF_SHOPPING_CART", id: "x1", data: { buyer: { email: "a@b.com" }, purchase: {} } })?.kind).toBe("abandoned");
    const k = parseKiwify({ order_id: "K1", webhook_event_type: "order_refunded", order_status: "refunded", Customer: { email: "k@x.com", mobile: "+5511999990000", full_name: "Kim" }, Product: { product_name: "Curso" }, Commissions: { charge_amount: 19700 }, TrackingParameters: { src: VID, utm_campaign: "abc" } })!;
    expect(k).toMatchObject({ externalId: "K1", kind: "refunded", value: 197, src: VID, buyer: { phone: "+5511999990000" } });
    const raw = '{"order_id":"1"}';
    expect(checkKiwifySignature(raw, createHmac("sha1", KIWI).update(raw).digest("hex"), KIWI)).toBe(true);
    expect(checkKiwifySignature(raw + " ", createHmac("sha1", KIWI).update(raw).digest("hex"), KIWI)).toBe(false);
  });
});

describe("script do site", () => {
  it("serve o JS da chave (válido) e 404 para chave inexistente", async () => {
    const s = await newSite(A);
    expect(s.snippet).toBe(`<script async src="https://contenthub.exemplo.test/api/t/${s.key}/script"></script>`);
    const r = await call(script.GET, { path: "/x", params: { key: s.key } });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("javascript");
    expect(() => new Function(r.text)).not.toThrow();
    expect(r.text).toContain(`/api/t/${s.key}/evento`);
    expect(r.text).toContain("pay.hotmart.com");
    expect((await call(script.GET, { path: "/x", params: { key: "naoexiste000000" } })).status).toBe(404);
  });

  it("consentimento: sem aceite nada é guardado; chave desligada idem; domínio errado 403", async () => {
    const s = await newSite(A);
    expect((await beacon(s.key, { t: "page_view", v: VID, u: "https://loja.exemplo.com.br/", c: false })).status).toBe(204);
    expect(await TrackVisitor.countDocuments({ organization: A.org._id })).toBe(0);
    await Organization.updateOne({ _id: A.org._id }, { $set: { trackingEnabled: false } });
    expect((await beacon(s.key, { t: "page_view", v: VID, u: "https://loja.exemplo.com.br/", c: true })).status).toBe(204);
    expect(await TrackVisitor.countDocuments({ organization: A.org._id })).toBe(0);
    await Organization.updateOne({ _id: A.org._id }, { $set: { trackingEnabled: true } });
    expect((await beacon(s.key, { t: "page_view", v: VID, u: "https://outro.com/", c: true })).status).toBe(403);
    expect((await beacon(s.key, { t: "page_view", v: "curto", u: "https://loja.exemplo.com.br/", c: true })).status).toBe(400);
  });

  it("visita + lead: primeiro toque fica, lead nasce com UTMs e consentimento, Lead vai para a Meta com hash e o mesmo event_id do pixel", async () => {
    const s = await newSite(A);
    await capiOn(s);
    const f = { at: Date.now() - 86_400_000, utm_source: "facebook", utm_campaign: "120210000000001", utm_content: "120210000000003", fbclid: "IwAR1", landing: "https://loja.exemplo.com.br/" };
    const l = { at: Date.now(), utm_source: "instagram", utm_campaign: "stories" };
    expect((await beacon(s.key, { t: "page_view", v: VID, u: "https://loja.exemplo.com.br/?utm_source=facebook", c: true, f, l: f, fbp: "fb.1.1700000000000.987654" })).status).toBe(204);
    expect((await beacon(s.key, { t: "page_view", v: VID, u: "https://loja.exemplo.com.br/oferta", c: true, f, l })).status).toBe(204);
    const v: any = await TrackVisitor.findOne({ organization: A.org._id, vid: VID }).lean();
    expect(v.firstTouch).toMatchObject({ source: "facebook", campaignId: "120210000000001", clickType: "fbclid" });
    expect(v.lastTouch).toMatchObject({ source: "instagram", campaign: "stories" });
    expect(v.fbc).toMatch(/^fb\.1\.\d+\.IwAR1$/);
    expect(v.pageViews).toBe(2);
    // lead sem a caixinha: não guarda e-mail nem cria lead
    await beacon(s.key, { t: "lead", v: VID, u: "https://loja.exemplo.com.br/oferta", c: true, f, l, id: "lead.abc123", lead: { email: "ana@x.com", consent: false } });
    expect(await Contact.countDocuments({ organization: A.org._id })).toBe(0);
    await beacon(s.key, { t: "lead", v: VID, u: "https://loja.exemplo.com.br/oferta", c: true, f, l, id: "lead.abc124", lead: { name: "Ana Lima", email: "Ana@X.com", phone: "11 98765-1111", consent: true } });
    const c: any = await Contact.findOne({ organization: A.org._id, email: "ana@x.com" }).lean();
    expect(c).toMatchObject({ source: "landing", lead: true, consent: { given: true, channel: "landing" } });
    expect(c.firstTouch).toMatchObject({ campaignId: "120210000000001", adId: "120210000000003" });
    expect(c.lastTouch.utm).toMatchObject({ source: "instagram", campaign: "stories" });
    expect((await TrackVisitor.findOne({ organization: A.org._id, vid: VID }).lean<any>()).contact).toEqual(c._id);
    // API de Conversões
    expect(capiCalls).toHaveLength(1);
    expect(capiCalls[0].url).toContain("/1234567890123/events");
    const ev = JSON.parse(capiCalls[0].body.get("data")!)[0];
    expect(ev).toMatchObject({ event_name: "Lead", event_id: "lead.abc124", action_source: "website", event_source_url: "https://loja.exemplo.com.br/oferta" });
    expect(ev.user_data.em).toEqual([sha256("ana@x.com")]);
    expect(ev.user_data.ph).toEqual([sha256("5511987651111")]);
    expect(ev.user_data.fbc).toMatch(/IwAR1$/);
    expect(ev.user_data.client_user_agent).toBe(UA);
    const log: any = await CapiLog.findOne({ organization: A.org._id }).lean();
    expect(log).toMatchObject({ status: "sent", eventName: "Lead", response: { events_received: 1, fbtrace_id: "Afake" } });
    expect(JSON.stringify(log)).not.toContain("ana@x.com");
    expect(JSON.stringify(log)).not.toContain(sha256("ana@x.com"));
  });

  it("API de Conversões desligada (env, conta, site) ou com código de teste: registrado, nada indevido", async () => {
    const s = await newSite(A);
    await capiOn(s);
    process.env.CAPI_ENABLED = "false";
    await beacon(s.key, { t: "lead", v: VID, u: "https://loja.exemplo.com.br/", c: true, id: "lead.x1", lead: { email: "b@x.com", consent: true } });
    expect(capiCalls).toHaveLength(0);
    expect((await CapiLog.findOne({ organization: A.org._id }).lean<any>()).status).toBe("skipped");
    process.env.CAPI_ENABLED = "true";
    // evento de teste: só com o código; vai com test_event_code
    expect((await call(testar.POST, { method: "POST", path: "/x", params: { id: s._id }, cookie: A.cookie })).data.field).toBe("testEventCode");
    await capiOn(s, { testEventCode: "TEST4242" });
    const t = await call(testar.POST, { method: "POST", path: "/x", params: { id: s._id }, cookie: A.cookie, headers: { "user-agent": UA } });
    expect(t.data.status).toBe("test");
    expect(capiCalls.at(-1)!.body.get("test_event_code")).toBe("TEST4242");
    expect((await call(testar.POST, { method: "POST", path: "/x", params: { id: s._id }, cookie: cookieFor(A.member) })).status).toBe(403);
    // ligar sem token: recusado
    const s2: any = await TrackingSite.findOne({ organization: A.org._id }).lean();
    await TrackingSite.updateOne({ _id: s2._id, organization: A.org._id }, { $set: { "capi.accessToken": "" } });
    const off = await call(site.PUT, { method: "PUT", path: "/x", params: { id: s._id }, cookie: A.cookie, body: { capiEnabled: true } });
    expect(off.data.field).toBe("capiEnabled");
  });
});

describe("vendas (Hotmart e Kiwify)", () => {
  it("Hotmart: hottok errado 401; aprovada liga ao lead pelo src, vai para Ganhou, entra na linha do tempo e manda Purchase; repetida não duplica", async () => {
    const s = await newSite(A);
    await capiOn(s);
    await beacon(s.key, { t: "page_view", v: VID, u: "https://loja.exemplo.com.br/", c: true, f: { at: Date.now() - 1000, utm_campaign: "120210000000001", utm_source: "facebook" }, fbp: "fb.1.1700000000000.555" });
    await beacon(s.key, { t: "lead", v: VID, u: "https://loja.exemplo.com.br/", c: true, id: "lead.v1", lead: { name: "Outro Nome", email: "lead@exemplo.com", consent: true } });
    capiCalls.length = 0;
    const integ = await newIntegration(A, "hotmart");
    expect(integ.url).toMatch(/^https:\/\/contenthub\.exemplo\.test\/api\/vendas\/hotmart\/[0-9a-f]{32}$/);
    const key = integ.url.split("/").pop();
    expect((await webhook("hotmart", key, hotmartBody("PURCHASE_APPROVED", "HP1"), { hottok: "errado" })).status).toBe(401);
    expect((await webhook("hotmart", key, hotmartBody("PURCHASE_APPROVED", "HP1"), { hottok: "" })).status).toBe(401);
    expect(await Sale.countDocuments({ organization: A.org._id })).toBe(0);
    const ok = await webhook("hotmart", key, hotmartBody("PURCHASE_APPROVED", "HP1"));
    expect([ok.status, ok.data.status]).toEqual([200, "stored"]);
    expect((await webhook("hotmart", key, hotmartBody("PURCHASE_APPROVED", "HP1"))).data.status).toBe("duplicate");
    const sale: any = await Sale.findOne({ organization: A.org._id }).lean();
    const c: any = await Contact.findOne({ organization: A.org._id, email: "lead@exemplo.com" }).lean();
    expect(sale).toMatchObject({ kind: "approved", value: 997, matchedBy: "src", capi: "sent" });
    expect(String(sale.contact)).toBe(String(c._id));
    expect(c).toMatchObject({ stage: "ganhou", value: 997 });
    expect((await LeadEvent.find({ organization: A.org._id, contact: c._id, kind: "sale" }).lean<any[]>())[0].text).toContain("Compra aprovada: Hotmart: Mentoria 90 dias");
    expect(capiCalls).toHaveLength(1);
    const ev = JSON.parse(capiCalls[0].body.get("data")!)[0];
    expect(ev).toMatchObject({ event_name: "Purchase", event_id: "purchase.hotmart.HP1", action_source: "system_generated", custom_data: { value: 997, currency: "BRL" } });
    expect(ev.user_data.em).toEqual([sha256("comprador@exemplo.com")]);
    expect(ev.user_data.fbp).toBe("fb.1.1700000000000.555");
    // reembolso com etapa configurada
    await SalesIntegration.updateOne({ organization: A.org._id }, { $set: { stageOnRefund: "perdeu" } });
    await webhook("hotmart", key, hotmartBody("PURCHASE_REFUNDED", "HP1"));
    expect((await Contact.findOne({ _id: c._id, organization: A.org._id }).lean<any>()).stage).toBe("perdeu");
    expect(await Sale.countDocuments({ organization: A.org._id })).toBe(2);
  });

  it("comprador novo vira lead (base: compra); abandono sem lead não cria ninguém; chave desligada = 200 sem guardar", async () => {
    const integ = await newIntegration(A, "hotmart", { stageOnApproved: "-" });
    const key = integ.url.split("/").pop();
    await webhook("hotmart", key, hotmartBody("PURCHASE_APPROVED", "HP2", { origin: { src: "", sck: "utm_campaign=120210000000009|utm_source=facebook" }, buyer: { email: "novo@exemplo.com" } }));
    const c: any = await Contact.findOne({ organization: A.org._id, email: "novo@exemplo.com" }).lean();
    expect(c).toMatchObject({ source: "sale", lead: true, stage: "novo", consent: { channel: "purchase" } });
    expect(c.firstTouch).toMatchObject({ campaignId: "120210000000009" });
    expect((await Sale.findOne({ organization: A.org._id }).lean<any>()).capi).toBe("sem site");
    await webhook("hotmart", key, { event: "PURCHASE_OUT_OF_SHOPPING_CART", id: "ab1", data: { buyer: { email: "abandonou@exemplo.com" }, purchase: {} } });
    expect(await Contact.countDocuments({ organization: A.org._id, email: "abandonou@exemplo.com" })).toBe(0);
    expect((await Sale.findOne({ organization: A.org._id, kind: "abandoned" }).lean<any>()).matchedBy).toBe("none");
    process.env.TRACKING_ENABLED = "false";
    const off = await webhook("hotmart", key, hotmartBody("PURCHASE_APPROVED", "HP3"));
    expect([off.status, off.data.ignored]).toEqual([200, "desligado"]);
    expect(await Sale.countDocuments({ organization: A.org._id, externalId: "HP3" })).toBe(0);
  });

  it("Kiwify: assinatura HMAC conferida; liga pelo e-mail; integração de outro cliente não serve", async () => {
    await Contact.create({ organization: A.org._id, name: "Kim", email: "k@x.com", lead: true, stage: "novo", consent: { given: true, channel: "manual" } });
    const integ = await newIntegration(A, "kiwify");
    const key = integ.url.split("/").pop();
    const body = { order_id: "K9", webhook_event_type: "order_approved", order_status: "paid", Customer: { email: "K@X.com" }, Product: { product_name: "Curso" }, Commissions: { charge_amount: 19700 }, TrackingParameters: {} };
    expect((await webhook("kiwify", key, body, { sign: "0".repeat(40) })).status).toBe(401);
    expect((await webhook("kiwify", key, body)).data.status).toBe("stored");
    expect((await Sale.findOne({ organization: A.org._id }).lean<any>())).toMatchObject({ matchedBy: "email", value: 197 });
    // a mesma chave com o provedor errado: não existe
    expect((await webhook("hotmart", key, hotmartBody("PURCHASE_APPROVED", "HPX"))).status).toBe(404);
    // venda da BETA nunca liga a lead da ALFA
    const ib = await newIntegration(B, "kiwify");
    await webhook("kiwify", ib.url.split("/").pop(), { ...body, order_id: "K10" });
    expect((await Sale.findOne({ organization: B.org._id }).lean<any>()).matchedBy).toBe("new");
    expect(await Contact.countDocuments({ organization: A.org._id, email: "k@x.com" })).toBe(1);
  });
});

describe("atribuição e LGPD", () => {
  it("painel: vendas, receita, reembolsos, CPA e ROAS por campanha quando o id bate; por automação", async () => {
    const day = dayKey(Date.now());
    const acc = new mongoose.Types.ObjectId();
    await AdObject.create({ organization: A.org._id, adAccount: acc, project: A.project._id, level: "campaign", metaId: "120210000000001", name: "Campanha Mentoria" });
    await AdInsightDaily.create({ organization: A.org._id, adAccount: acc, project: A.project._id, date: day, adId: "1", campaignId: "120210000000001", spend: 500, leads: 3 });
    const now = new Date();
    const c1 = await Contact.create({ organization: A.org._id, name: "L1", lead: true, leadAt: now, stage: "novo", firstTouch: { at: now, kind: "landing", campaignId: "120210000000001" }, lastTouch: { at: now, kind: "landing", campaignId: "120210000000001" } });
    const integ = await SalesIntegration.create({ organization: A.org._id, provider: "hotmart", key: "k".repeat(32) });
    await Sale.create([
      { organization: A.org._id, integration: integ._id, provider: "hotmart", externalId: "S1", kind: "approved", value: 997, contact: c1._id, at: now },
      { organization: A.org._id, integration: integ._id, provider: "hotmart", externalId: "S2", kind: "approved", value: 997, at: now, touch: { campaignId: "120210000000001" } },
      { organization: A.org._id, integration: integ._id, provider: "hotmart", externalId: "S2", kind: "refunded", value: 997, at: now, touch: { campaignId: "120210000000001" } },
    ]);
    const r = await call(relatorios.GET, { path: "/api/crm/relatorios?agrupar=campanha&periodo=7d", cookie: A.cookie });
    const row = r.data.rows.find((x: any) => x.key === "120210000000001");
    expect(row).toMatchObject({ label: "Campanha Mentoria", leads: 1, sales: 2, revenue: 1994, refunds: 997, spend: 500, cpa: 250, roas: 1.99, costPerLead: 500, basis: "real" });
    expect(r.data.totals).toMatchObject({ sales: 2, revenue: 1994, refunds: 997 });
    const csv = await call(relatorios.GET, { path: "/api/crm/relatorios?agrupar=campanha&periodo=7d&formato=csv", cookie: A.cookie });
    expect(csv.text.split("\n")[0]).toContain("roas");
    const b = await call(relatorios.GET, { path: "/api/crm/relatorios?agrupar=campanha&periodo=7d", cookie: B.cookie });
    expect(b.data.totals.revenue).toBe(0);
  });

  it("excluir a pedido apaga visitas e eventos do site e desliga a venda da pessoa; exportar traz vendas e visitas", async () => {
    const s = await newSite(A);
    await beacon(s.key, { t: "lead", v: VID, u: "https://loja.exemplo.com.br/", c: true, id: "lead.e1", lead: { email: "apagar@x.com", consent: true } });
    const c: any = await Contact.findOne({ organization: A.org._id, email: "apagar@x.com" }).lean();
    const integ = await newIntegration(A, "hotmart");
    await webhook("hotmart", integ.url.split("/").pop(), hotmartBody("PURCHASE_APPROVED", "HP9", { buyer: { email: "apagar@x.com" } }));
    const ex = await call(exportar.GET, { path: "/x", params: { id: String(c._id) }, cookie: A.cookie });
    expect(ex.data.vendas).toHaveLength(1);
    expect(ex.data.visitasDoSite).toHaveLength(1);
    expect((await call(leadRoute.DELETE, { method: "DELETE", path: "/x", params: { id: String(c._id) }, cookie: A.cookie })).status).toBe(200);
    expect(await TrackVisitor.countDocuments({ organization: A.org._id })).toBe(0);
    expect(await TrackEvent.countDocuments({ organization: A.org._id, contact: c._id })).toBe(0);
    const sale: any = await Sale.findOne({ organization: A.org._id }).lean();
    expect([sale.contact, sale.matchedBy, sale.value]).toEqual([null, "apagado", 997]);
  });

  it("painel do rastreamento: só a própria organização; membro vê, só o dono configura", async () => {
    await newSite(A);
    await newIntegration(B, "hotmart");
    const r = await call(overview.GET, { path: "/api/rastreio", cookie: cookieFor(A.member) });
    expect(r.status).toBe(200);
    expect([r.data.sites.length, r.data.integrations.length, r.data.canManage]).toEqual([1, 0, false]);
    expect((await call(sites.POST, { method: "POST", path: "/x", cookie: cookieFor(A.member), body: { project: String(A.project._id) } })).status).toBe(403);
    expect((await call(sites.POST, { method: "POST", path: "/x", cookie: A.cookie, body: { project: String(B.project._id) } })).status).toBe(404);
  });
});
