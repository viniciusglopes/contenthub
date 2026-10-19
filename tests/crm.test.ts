/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connectInstagram } from "@/lib/instagram/accounts";
import { setFetchOverride } from "@/lib/instagram/client";
import { setMetaFetch } from "@/lib/ads/client";
import { encrypt } from "@/lib/crypto";
import { processDue } from "@/lib/automations/engine";
import { processLeadAds, parseLeadgen } from "@/lib/crm/leadads";
import { applyTouch } from "@/lib/crm/leads";
import { dayKey } from "@/lib/instagram/dates";
import { checkToken, issueToken } from "@/lib/crm/capture";
import { guessMapping, mapLeadFields, normPhone, parseCsv, parseMoney } from "@/lib/crm/pure";
import { Automation, AutomationRun, Contact } from "@/models/Automation";
import { AdInsightDaily, AdObject } from "@/models/Ads";
import { CaptureRate, ConsentLog, LeadAdsEvent, LeadAdsPage, LeadCapture, LeadEvent, LeadTask, Pipeline } from "@/models/Crm";
import Organization from "@/models/Organization";
import Project from "@/models/Project";
import * as igWebhook from "@/app/api/instagram/webhook/route";
import * as redirect from "@/app/api/r/[org]/[code]/route";
import * as automacoes from "@/app/api/automacoes/route";
import * as simular from "@/app/api/automacoes/simular/route";
import * as leadsRoute from "@/app/api/crm/leads/route";
import * as leadRoute from "@/app/api/crm/leads/[id]/route";
import * as exportar from "@/app/api/crm/leads/[id]/exportar/route";
import * as notas from "@/app/api/crm/leads/[id]/notas/route";
import * as tarefas from "@/app/api/crm/leads/[id]/tarefas/route";
import * as tarefa from "@/app/api/crm/tarefas/[id]/route";
import * as mesclar from "@/app/api/crm/leads/[id]/mesclar/route";
import * as funis from "@/app/api/crm/funis/route";
import * as funil from "@/app/api/crm/funis/[id]/route";
import * as importar from "@/app/api/crm/importar/route";
import * as relatorios from "@/app/api/crm/relatorios/route";
import * as capturas from "@/app/api/crm/capturas/route";
import * as captura from "@/app/api/captura/[org]/[code]/route";
import * as leadAdsWebhook from "@/app/api/crm/lead-ads/webhook/route";
import * as paginas from "@/app/api/crm/lead-ads/paginas/route";
import * as processar from "@/app/api/crm/lead-ads/processar/route";
import { call, cookieFor, makeOrg, makeUser, setTestEnv } from "./helpers";
import { type AutomationFake, SECRET, automationFake, commentPayload, sign } from "./automation-fake";
import { type LeadAdsFake, META_SECRET, leadAdsFake, leadgenPayload, signMeta } from "./crm-fake";

// CRM DE LEADS: entrada por formulário da Meta (webhook assinado + busca do lead), captura pública,
// cadastro à mão, planilha, automação do direct e anúncio para o direct; dedupe, atribuição,
// etapas, relatório com custo, LGPD e isolamento entre clientes.

let mongo: MongoMemoryServer;
let ig: AutomationFake;
let meta: LeadAdsFake;
let clock = Date.now();
const A: any = {};
const B: any = {};
const PAGE = "1020304050";
const MEDIA = "1800000000000100";

async function deliverLeadgen(payload: unknown, secret = META_SECRET) {
  const raw = JSON.stringify(payload);
  return call(leadAdsWebhook.POST, { method: "POST", path: "/api/crm/lead-ads/webhook", body: payload, headers: { "x-hub-signature-256": signMeta(raw, secret) } });
}
const newLead = (side: any, body: Record<string, unknown>) => call(leadsRoute.POST, { method: "POST", path: "/api/crm/leads", cookie: side.cookie, body });
const detail = (side: any, id: string) => call(leadRoute.GET, { path: "/api/crm/leads/x", params: { id }, cookie: side.cookie });

beforeAll(async () => {
  setTestEnv();
  Object.assign(process.env, { AUTOMACOES_ENABLED: "true", IG_APP_SECRET: SECRET, APP_URL: "https://contenthub.exemplo.test", META_APP_SECRET: META_SECRET, LEAD_ADS_VERIFY_TOKEN: "token-de-verificacao-lead-ads" });
  ig = automationFake(() => clock);
  setFetchOverride(ig.fetch);
  meta = leadAdsFake();
  setMetaFetch(meta.fetch);
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("crm"));
  for (const [side, tag] of [[A, "alfa"], [B, "beta"]] as const) {
    side.org = await makeOrg(`Cliente ${tag}`, `cliente-${tag}`, { automationsEnabled: true });
    side.owner = await makeUser(side.org._id, "owner", `dona@${tag}.test`);
    side.member = await makeUser(side.org._id, "member", `membro@${tag}.test`);
    side.cookie = cookieFor(side.owner);
    side.memberCookie = cookieFor(side.member);
    side.project = await Project.create({ organization: side.org._id, name: `Projeto ${tag}`, slug: "projeto" });
    side.account = await connectInstagram(side.org._id, { project: String(side.project._id), token: `IGAA-conta-${tag}oficial-000001` }, { now: clock - 3_600_000 });
    side.ig = side.account.accountId;
  }
});
afterAll(async () => {
  setFetchOverride(null);
  setMetaFetch(null);
  await mongoose.disconnect();
  await mongo.stop();
  for (const k of ["AUTOMACOES_ENABLED", "META_APP_SECRET", "LEAD_ADS_VERIFY_TOKEN", "CRM_LEAD_ADS_ENABLED"]) delete process.env[k];
});
beforeEach(async () => {
  clock += 2 * 3_600_000;
  meta.calls.length = 0;
  meta.writes.length = 0;
  meta.errors.length = 0;
  for (const M of [Contact, LeadEvent, LeadTask, ConsentLog, LeadAdsEvent, LeadAdsPage, LeadCapture, CaptureRate, Automation, AutomationRun, AdObject, AdInsightDaily]) await M.collection.deleteMany({});
  process.env.CRM_LEAD_ADS_ENABLED = "true";
  await Organization.updateMany({}, { $set: { leadAdsEnabled: true } });
});

describe("funções puras", () => {
  it("telefone: celular antigo de 10 dígitos casa com o de 11; estrangeiro com +", () => {
    expect(normPhone("(11) 91234-5678")).toEqual({ phone: "+5511912345678", key: "11912345678" });
    expect(normPhone("+55 11 9123-4567")?.key).toBe(normPhone("11 99123-4567")?.key);
    expect(normPhone("+351 912 345 678")).toEqual({ phone: "+351912345678", key: "351912345678" });
    expect(normPhone("1234")).toBeNull();
  });
  it("CSV com aspas, ponto e vírgula e cabeçalho adivinhado", () => {
    const rows = parseCsv('Nome;E-mail;WhatsApp;utm_campaign;Cidade\n"Silva; Ana";ana@x.com;11 91234-5678;black;"São ""Paulo"""\n');
    expect(rows).toEqual([["Nome", "E-mail", "WhatsApp", "utm_campaign", "Cidade"], ["Silva; Ana", "ana@x.com", "11 91234-5678", "black", 'São "Paulo"']]);
    expect(guessMapping(rows[0])).toEqual(["name", "email", "phone", "utm_campaign", "field:cidade"]);
    expect([parseMoney("1.234,56"), parseMoney("R$ 97"), parseMoney("12.5"), parseMoney("abc")]).toEqual([1234.56, 97, 12.5, null]);
  });
  it("campos do formulário da Meta: padrão + mapa da Página", () => {
    const fd = [{ name: "full_name", values: ["Ana Lima"] }, { name: "email", values: ["ana@x.com"] }, { name: "qual_seu_whatsapp", values: ["11912345678"] }, { name: "cidade", values: ["Sorocaba"] }];
    expect(mapLeadFields(fd)).toEqual({ name: "Ana Lima", email: "ana@x.com", phone: "", fields: { qual_seu_whatsapp: "11912345678", cidade: "Sorocaba" } });
    expect(mapLeadFields(fd, { qual_seu_whatsapp: "phone", cidade: "ignore" })).toMatchObject({ phone: "11912345678", fields: {} });
  });
  it("aviso leadgen: só campo leadgen, dedupe no próprio aviso, created_time em segundos", () => {
    const p = leadgenPayload(PAGE, { leadgenId: "444", adId: "777", time: 1_700_000_000_000 });
    p.entry[0].changes.push(p.entry[0].changes[0], { field: "feed", value: {} } as any);
    const r = parseLeadgen(p);
    expect(r.rows).toEqual([{ pageId: PAGE, leadgenId: "444", formId: "555000111", adId: "777", adgroupId: "777", createdTime: 1_700_000_000_000 }]);
    expect(r.ignored).toBe(2);
  });
  it("atribuição: primeiro toque nunca muda, último é o mais recente", () => {
    const c: any = { firstTouch: { at: new Date(1000), kind: "landing" }, lastTouch: { at: new Date(1000), kind: "landing" } };
    const later = applyTouch(c, { at: new Date(5000), kind: "meta_lead_ads", campaignId: "9" });
    expect(later.firstTouch).toBeUndefined();
    expect((later.lastTouch as any).campaignId).toBe("9");
    const older = applyTouch(c, { at: new Date(10), kind: "import" });
    expect((older.firstTouch as any).kind).toBe("import");
    expect(older.lastTouch).toBeUndefined();
  });
  it("ficha anti-robô: assinada, nem rápida demais nem velha", () => {
    const t = issueToken("org", "codigo123", 1_000_000_000_000);
    expect(checkToken("org", "codigo123", t, 1_000_000_000_500)).toBe("fast");
    expect(checkToken("org", "codigo123", t, 1_000_000_005_000)).toBe("ok");
    expect(checkToken("org", "codigo123", t, 1_000_000_000_000 + 3 * 3_600_000)).toBe("expired");
    expect(checkToken("org", "outro12345", t, 1_000_000_005_000)).toBe("missing");
    expect(checkToken("org", "codigo123", t.replace(/.$/, "x"), 1_000_000_005_000)).toBe("missing");
  });
});

describe("formulário da Meta (Lead Ads)", () => {
  async function addPage(side: any, extra: Record<string, unknown> = {}) {
    const r = await call(paginas.POST, { method: "POST", path: "/api/crm/lead-ads/paginas", cookie: side.cookie, body: { pageId: PAGE, token: `pagina-${PAGE}-token-de-teste`, tags: ["meta"], ...extra } });
    expect(r.status, r.text).toBe(201);
    return r.data;
  }

  it("verificação e assinatura: challenge só com token certo; assinatura errada = 401 e nada guardado", async () => {
    const ok = await call(leadAdsWebhook.GET, { path: "/api/crm/lead-ads/webhook?hub.mode=subscribe&hub.verify_token=token-de-verificacao-lead-ads&hub.challenge=987" });
    expect([ok.status, ok.text]).toEqual([200, "987"]);
    expect((await call(leadAdsWebhook.GET, { path: "/api/crm/lead-ads/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1" })).status).toBe(403);
    await addPage(A);
    const p = leadgenPayload(PAGE, { leadgenId: "900001" });
    expect((await deliverLeadgen(p, "outro-segredo")).status).toBe(401);
    expect((await call(leadAdsWebhook.POST, { method: "POST", path: "/api/crm/lead-ads/webhook", body: p })).status).toBe(401);
    expect(await LeadAdsEvent.countDocuments({ organization: A.org._id })).toBe(0);
    delete process.env.META_APP_SECRET;
    expect((await deliverLeadgen(p)).status).toBe(503);
    process.env.META_APP_SECRET = META_SECRET;
  });

  it("cadastrar Página confere o token só com leitura; token de outra Página é recusado; membro não cadastra", async () => {
    const wrong = await call(paginas.POST, { method: "POST", path: "/api/crm/lead-ads/paginas", cookie: A.cookie, body: { pageId: PAGE, token: "pagina-999999-token-de-outra" } });
    expect([wrong.status, wrong.data.field]).toEqual([400, "token"]);
    expect((await call(paginas.POST, { method: "POST", path: "/api/crm/lead-ads/paginas", cookie: A.memberCookie, body: { pageId: PAGE, token: `pagina-${PAGE}-token` } })).status).toBe(403);
    const p = await addPage(A);
    expect(p).toMatchObject({ pageId: PAGE, hasToken: true, name: `Página ${PAGE}` });
    expect(JSON.stringify(p)).not.toContain("token-de-teste");
    const raw: any = await LeadAdsPage.findOne({ organization: A.org._id }).lean();
    expect(raw.credentials.accessToken).not.toContain("token-de-teste");
    expect(meta.writes).toEqual([]);
  });

  it("chaves desligadas: nada guardado (env) e nada guardado (organização)", async () => {
    await addPage(A);
    process.env.CRM_LEAD_ADS_ENABLED = "false";
    const r1 = await deliverLeadgen(leadgenPayload(PAGE, { leadgenId: "900002" }));
    expect(r1.data).toMatchObject({ stored: 0, switchedOff: 1 });
    process.env.CRM_LEAD_ADS_ENABLED = "true";
    await Organization.updateOne({ _id: A.org._id }, { $set: { leadAdsEnabled: false } });
    const r2 = await deliverLeadgen(leadgenPayload(PAGE, { leadgenId: "900002" }));
    expect(r2.data).toMatchObject({ stored: 0, switchedOff: 1 });
    expect(await LeadAdsEvent.countDocuments({ organization: A.org._id })).toBe(0);
    // e o processar pela tela também não roda
    const pr = await call(processar.POST, { method: "POST", path: "/api/crm/lead-ads/processar", cookie: A.cookie });
    expect(pr.data).toMatchObject({ enabled: false, processed: 0 });
  });

  it("aviso -> busca do lead -> lead no CRM com campanha, conjunto e anúncio; idempotente; nenhuma escrita na Meta", async () => {
    await addPage(A, { stage: "em-conversa" });
    // anúncio sincronizado no Tráfego completa campanha e conjunto que o lead não trouxe
    await AdObject.create({ organization: A.org._id, adAccount: new mongoose.Types.ObjectId(), project: A.project._id, level: "ad", metaId: "777001", name: "Anúncio Ebook", campaignId: "333001", adsetId: "222001" });
    meta.leads.set("900003", { id: "900003", created_time: new Date(clock).toISOString(), ad_id: "777001", form_id: "555000111", field_data: [{ name: "full_name", values: ["Ana Lima"] }, { name: "email", values: ["ANA@Exemplo.com"] }, { name: "phone_number", values: ["+55 11 91234-5678"] }, { name: "cidade", values: ["Sorocaba"] }] });
    const payload = leadgenPayload(PAGE, { leadgenId: "900003", adId: "777001", time: clock });
    expect((await deliverLeadgen(payload)).data).toMatchObject({ stored: 1 });
    expect((await deliverLeadgen(payload)).data).toMatchObject({ stored: 0, duplicate: 1 });
    const out = await processLeadAds({ now: clock + 1000 });
    expect(out).toMatchObject({ processed: 1, failed: 0 });
    const c: any = await Contact.findOne({ organization: A.org._id, "origin.leadgenId": "900003" }).lean();
    expect(c).toMatchObject({ name: "Ana Lima", email: "ana@exemplo.com", phone: "+5511912345678", lead: true, stage: "em-conversa", source: "meta_lead_ads", tags: ["meta"], fields: { cidade: "Sorocaba" } });
    expect(c.origin).toMatchObject({ kind: "meta_lead_ads", adId: "777001", adsetId: "222001", campaignId: "333001", formId: "555000111", pageId: PAGE });
    expect(c.firstTouch).toMatchObject({ kind: "meta_lead_ads", campaignId: "333001" });
    expect(c.consent).toMatchObject({ given: true, channel: "meta_lead_form", version: "form:555000111" });
    expect(await ConsentLog.countDocuments({ organization: A.org._id, contact: c._id, action: "given" })).toBe(1);
    expect(await LeadEvent.countDocuments({ organization: A.org._id, contact: c._id, kind: "lead_ads" })).toBe(1);
    // o mesmo lead de novo (ex.: aviso reenviado depois de 30 dias): não duplica
    await LeadAdsEvent.deleteMany({ organization: A.org._id });
    await deliverLeadgen(payload);
    await processLeadAds({ now: clock + 2000 });
    expect(await Contact.countDocuments({ organization: A.org._id })).toBe(1);
    expect(meta.calls.filter((x) => x.startsWith("GET /900003"))).toHaveLength(1);
    expect(meta.writes).toEqual([]);
  });

  it("erro passageiro = nova tentativa; token vencido = falha registrada na Página", async () => {
    await addPage(A);
    meta.leads.set("900004", { id: "900004", field_data: [{ name: "full_name", values: ["Bia"] }] });
    meta.errors.push({ code: 2, status: 500 });
    await deliverLeadgen(leadgenPayload(PAGE, { leadgenId: "900004" }));
    expect(await processLeadAds({ now: clock + 1000 })).toMatchObject({ deferred: 1 });
    expect(await processLeadAds({ now: clock + 1000 + 3 * 60_000 })).toMatchObject({ processed: 1 });
    expect(await Contact.countDocuments({ organization: A.org._id, name: "Bia" })).toBe(1);
    // token inválido
    await LeadAdsPage.updateOne({ organization: A.org._id }, { $set: { "credentials.accessToken": encrypt("token-invalido-0000000000000") } });
    meta.leads.set("900005", { id: "900005", field_data: [] });
    await deliverLeadgen(leadgenPayload(PAGE, { leadgenId: "900005" }));
    expect(await processLeadAds({ now: clock + 10 * 60_000 })).toMatchObject({ failed: 1 });
    const page: any = await LeadAdsPage.findOne({ organization: A.org._id }).lean();
    expect(page.lastError).toMatch(/token/i);
  });

  it("isolamento: a mesma Página em dois clientes = um aviso para cada; cliente desligado não recebe", async () => {
    await addPage(A);
    await addPage(B);
    meta.leads.set("900006", { id: "900006", field_data: [{ name: "full_name", values: ["Caio"] }, { name: "email", values: ["caio@x.com"] }] });
    expect((await deliverLeadgen(leadgenPayload(PAGE, { leadgenId: "900006" }))).data).toMatchObject({ stored: 2 });
    await processLeadAds({ now: clock + 1000 });
    expect(await Contact.countDocuments({ organization: A.org._id, email: "caio@x.com" })).toBe(1);
    expect(await Contact.countDocuments({ organization: B.org._id, email: "caio@x.com" })).toBe(1);
    await Organization.updateOne({ _id: B.org._id }, { $set: { leadAdsEnabled: false } });
    expect((await deliverLeadgen(leadgenPayload(PAGE, { leadgenId: "900007" }))).data).toMatchObject({ stored: 1 });
    expect(await LeadAdsEvent.countDocuments({ organization: B.org._id, leadgenId: "900007" })).toBe(0);
  });
});

describe("cadastro, dedupe, etapas e tarefas", () => {
  it("e-mail/telefone só com consentimento; mesmo telefone = mesmo lead (dedupe)", async () => {
    const no = await newLead(A, { name: "Duda", phone: "11 91234-0000" });
    expect([no.status, no.data.field]).toEqual([400, "consent"]);
    const noBasis = await newLead(A, { name: "Duda", phone: "11 91234-0000", consent: true });
    expect([noBasis.status, noBasis.data.field]).toEqual([400, "consentBasis"]);
    const ok = await newLead(A, { name: "Duda", phone: "11 91234-0000", consent: true, consentBasis: "pediu orçamento por telefone", value: "1.500,00", tags: "vip" });
    expect(ok.status, ok.text).toBe(201);
    expect(ok.data.lead).toMatchObject({ phone: "+5511912340000", value: 1500, stage: "novo", source: "manual", consent: { given: true, channel: "manual" } });
    const again = await newLead(A, { name: "Outro nome", phone: "+55 (11) 91234-0000", email: "duda@x.com", consent: true, consentBasis: "mesmo contato" });
    expect([again.status, again.data.deduped, again.data.lead._id]).toEqual([200, true, ok.data.lead._id]);
    expect(again.data.lead).toMatchObject({ name: "Duda", email: "duda@x.com" });
    expect(await Contact.countDocuments({ organization: A.org._id })).toBe(1);
    // o mesmo telefone na BETA é outro lead (nada cruza)
    const b = await newLead(B, { name: "Duda B", phone: "11 91234-0000", consent: true, consentBasis: "x y z" });
    expect(b.status).toBe(201);
    expect(await Contact.countDocuments({ organization: B.org._id })).toBe(1);
  });

  it("etapas: ganhou marca data, perdeu guarda motivo, tudo na linha do tempo; tarefa e nota", async () => {
    const l = (await newLead(A, { name: "Eva" })).data.lead;
    let r = await call(leadRoute.PUT, { method: "PUT", path: "/api/crm/leads/x", params: { id: l._id }, cookie: A.memberCookie, body: { stage: "ganhou", value: "997" } });
    expect(r.status, r.text).toBe(200);
    expect(r.data.lead).toMatchObject({ stage: "ganhou", value: 997 });
    expect(r.data.lead.wonAt).toBeTruthy();
    r = await call(leadRoute.PUT, { method: "PUT", path: "/api/crm/leads/x", params: { id: l._id }, cookie: A.cookie, body: { stage: "perdeu", lostReason: "preço" } });
    expect(r.data.lead).toMatchObject({ stage: "perdeu", lostReason: "preço", wonAt: null });
    expect((await call(leadRoute.PUT, { method: "PUT", path: "/api/crm/leads/x", params: { id: l._id }, cookie: A.cookie, body: { stage: "nao-existe" } })).status).toBe(400);
    expect((await call(leadRoute.PUT, { method: "PUT", path: "/api/crm/leads/x", params: { id: l._id }, cookie: A.cookie, body: { owner: String(B.owner._id) } })).data.field).toBe("owner");
    await call(notas.POST, { method: "POST", path: "/api/crm/leads/x/notas", params: { id: l._id }, cookie: A.cookie, body: { text: "Ligou pedindo desconto" } });
    const t = await call(tarefas.POST, { method: "POST", path: "/api/crm/leads/x/tarefas", params: { id: l._id }, cookie: A.cookie, body: { title: "Retornar", dueAt: new Date(Date.now() - 60_000).toISOString() } });
    expect(t.data).toMatchObject({ title: "Retornar", overdue: true, assignee: String(A.owner._id) });
    await call(tarefa.PUT, { method: "PUT", path: "/api/crm/tarefas/x", params: { id: t.data._id }, cookie: A.cookie, body: { done: true } });
    const d = await detail(A, l._id);
    const texts = d.data.events.map((e: any) => `${e.kind}:${e.text}`);
    expect(texts).toEqual(expect.arrayContaining(["stage:Novo → Ganhou", "stage:Ganhou → Perdeu (motivo: preço)", "note:Ligou pedindo desconto", "task:Concluída: Retornar."]));
    expect(d.data.tasks[0].done).toBe(true);
    // a BETA não alcança o lead da ALFA
    expect((await call(leadRoute.PUT, { method: "PUT", path: "/api/crm/leads/x", params: { id: l._id }, cookie: B.cookie, body: { stage: "ganhou" } })).status).toBe(404);
  });

  it("funil editável: etapa com lead só sai com destino; padrão não apaga", async () => {
    const l = (await newLead(A, { name: "Fábio", stage: "proposta" })).data.lead;
    const pipes = (await call(funis.GET, { path: "/api/crm/funis", cookie: A.cookie })).data.pipelines;
    const p = pipes[0];
    const without = p.stages.filter((s: any) => s.key !== "proposta");
    const blocked = await call(funil.PUT, { method: "PUT", path: "/api/crm/funis/x", params: { id: p._id }, cookie: A.cookie, body: { stages: [...without, { name: "Negociação", kind: "open" }] } });
    expect([blocked.status, blocked.data.field]).toEqual([409, "moveTo"]);
    const ok = await call(funil.PUT, { method: "PUT", path: "/api/crm/funis/x", params: { id: p._id }, cookie: A.cookie, body: { stages: [...without, { name: "Negociação", kind: "open" }], moveTo: { proposta: "negociacao" } } });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.data.stages.map((s: any) => s.key)).toEqual(["novo", "em-conversa", "ganhou", "perdeu", "negociacao"]);
    expect((await Contact.findOne({ _id: l._id, organization: A.org._id }).lean<any>()).stage).toBe("negociacao");
    expect((await call(funil.DELETE, { method: "DELETE", path: "/api/crm/funis/x", params: { id: p._id }, cookie: A.cookie })).status).toBe(400);
    expect((await call(funil.PUT, { method: "PUT", path: "/api/crm/funis/x", params: { id: p._id }, cookie: A.memberCookie, body: { name: "X" } })).status).toBe(403);
    await Pipeline.deleteMany({ organization: A.org._id });
  });

  it("juntar repetidos: fica um, com a linha do tempo dos dois", async () => {
    const a = (await newLead(A, { name: "Gil", email: "gil@x.com", consent: true, consentBasis: "formulário" })).data.lead;
    const c = await Contact.create({ organization: A.org._id, name: "", username: "gil.insta", lead: true, tags: ["ig"] });
    await call(notas.POST, { method: "POST", path: "/api/crm/leads/x/notas", params: { id: String(c._id) }, cookie: A.cookie, body: { text: "nota do outro" } });
    const r = await call(mesclar.POST, { method: "POST", path: "/api/crm/leads/x/mesclar", params: { id: a._id }, cookie: A.cookie, body: { other: String(c._id) } });
    expect(r.status, r.text).toBe(200);
    expect(r.data.lead).toMatchObject({ name: "Gil", username: "gil.insta", email: "gil@x.com" });
    expect(r.data.lead.tags.sort()).toEqual(["ig"]);
    expect(await Contact.countDocuments({ organization: A.org._id })).toBe(1);
    expect(r.data.events.map((e: any) => e.text)).toEqual(expect.arrayContaining(["nota do outro"]));
    // id da BETA no corpo: 404, nada muda
    const other = (await newLead(B, { name: "Beta" })).data.lead;
    expect((await call(mesclar.POST, { method: "POST", path: "/api/crm/leads/x/mesclar", params: { id: r.data.lead._id }, cookie: A.cookie, body: { other: other._id } })).status).toBe(404);
    expect(await Contact.countDocuments({ organization: B.org._id, name: "Beta" })).toBe(1);
  });
});

describe("planilha", () => {
  const CSV = "Nome,E-mail,Telefone,Etapa,Valor,utm_campaign,Cidade\nAna,ana@x.com,11 91111-1111,Proposta,\"1.000,00\",black,Sorocaba\nBruno,bruno@x.com,,,,,\nAna de novo,ANA@x.com,,,,,\n,,,,,,Itu\nCarla,carla@,,,,,\n";

  it("prévia mostra o que acontece em cada linha e não grava; confirmar grava; de novo vira atualização", async () => {
    await newLead(A, { name: "Bruno antigo", email: "bruno@x.com", consent: true, consentBasis: "evento" });
    const prev = await call(importar.POST, { method: "POST", path: "/api/crm/importar", cookie: A.cookie, body: { csv: CSV } });
    expect(prev.status, prev.text).toBe(200);
    expect(prev.data.mapping).toEqual(["name", "email", "phone", "stage", "value", "utm_campaign", "field:cidade"]);
    expect(prev.data.counts).toMatchObject({ total: 5, new: 1, update: 1, dup_file: 1, invalid: 2, droppedContact: 2 });
    expect(prev.data.preview.map((r: any) => r.status)).toEqual(["new", "update", "dup_file", "invalid", "invalid"]);
    expect(await Contact.countDocuments({ organization: A.org._id })).toBe(1);
    // sem a base do consentimento: recusado
    expect((await call(importar.POST, { method: "POST", path: "/api/crm/importar", cookie: A.cookie, body: { csv: CSV, consent: true } })).data.field).toBe("consentBasis");
    const done = await call(importar.POST, { method: "POST", path: "/api/crm/importar", cookie: A.cookie, body: { csv: CSV, consent: true, consentBasis: "inscritos no evento", commit: true, fileName: "evento.csv", tags: "evento" } });
    expect(done.data.result).toEqual({ created: 1, updated: 1, failed: 0 });
    const ana: any = await Contact.findOne({ organization: A.org._id, email: "ana@x.com" }).lean();
    expect(ana).toMatchObject({ stage: "proposta", value: 1000, phone: "+5511911111111", source: "import", fields: { cidade: "Sorocaba" }, utm: { campaign: "black" }, consent: { channel: "import" } });
    expect(ana.tags).toEqual(["evento"]);
    const again = await call(importar.POST, { method: "POST", path: "/api/crm/importar", cookie: A.cookie, body: { csv: CSV, commit: true } });
    expect(again.data.result).toEqual({ created: 0, updated: 2, failed: 0 });
    expect(await Contact.countDocuments({ organization: A.org._id })).toBe(2);
  });

  it("sem autorização declarada: entra sem e-mail e telefone", async () => {
    await call(importar.POST, { method: "POST", path: "/api/crm/importar", cookie: A.cookie, body: { csv: "nome,email\nDani,dani@x.com\n", commit: true } });
    const c: any = await Contact.findOne({ organization: A.org._id, name: "Dani" }).lean();
    expect([c.email, c.consent?.given]).toEqual(["", false]);
  });
});

describe("página de captura (pública)", () => {
  async function newCapture(side: any, body: Record<string, unknown> = {}) {
    const r = await call(capturas.POST, { method: "POST", path: "/api/crm/capturas", cookie: side.cookie, body: { name: "Ebook", tags: ["ebook"], redirectUrl: "https://site.exemplo.com.br/obrigado", ...body } });
    expect(r.status, r.text).toBe(201);
    return r.data;
  }
  const post = (side: any, cap: any, body: Record<string, unknown>, ip = "10.0.0.1") => call(captura.POST, { method: "POST", path: "/api/captura/x/y", params: { org: String(side.org._id), code: cap.code }, body, headers: { "x-forwarded-for": ip } });

  it("ficha, isca, consentimento e UTMs da página; resposta sem dado do cliente", async () => {
    const cap = await newCapture(A);
    expect(cap.snippet).toContain(`/api/captura/${A.org._id}/${cap.code}`);
    const info = await call(captura.GET, { path: "/api/captura/x/y", params: { org: String(A.org._id), code: cap.code } });
    expect(info.status).toBe(200);
    expect(info.headers.get("access-control-allow-origin")).toBe("*");
    const fresh = await post(A, cap, { _t: info.data.token, name: "Lia", phone: "11 92222-2222", consent: true });
    expect([fresh.status, fresh.data.field]).toEqual([400, "_t"]); // rápido demais
    const old = issueToken(String(A.org._id), cap.code, Date.now() - 10_000);
    expect((await post(A, cap, { _t: old, website: "http://spam", name: "Robô", phone: "11 93333-3333", consent: true })).status).toBe(200); // isca: finge ok
    expect(await Contact.countDocuments({ organization: A.org._id })).toBe(0);
    expect((await post(A, cap, { _t: old, name: "Lia", phone: "11 92222-2222" })).data.field).toBe("consent");
    const ok = await post(A, cap, { _t: old, name: "Lia", phone: "11 92222-2222", consent: "on", page: "https://site.exemplo.com.br/ebook?utm_source=instagram&utm_campaign=outubro" });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.data).toEqual({ ok: true, redirect: "https://site.exemplo.com.br/obrigado" });
    const c: any = await Contact.findOne({ organization: A.org._id, phoneKey: "11922222222" }).lean();
    expect(c).toMatchObject({ name: "Lia", source: "landing", tags: ["ebook"], utm: { source: "instagram", campaign: "outubro" }, consent: { given: true, channel: "landing" } });
    expect(c.consent.version).toMatch(/^v-/);
    // código da ALFA com a organização da BETA: não existe
    expect((await post(B, cap, { _t: old, name: "X", phone: "11 94444-4444", consent: true })).status).toBe(404);
  });

  it("teto por IP e formulário HTML comum volta para a página de obrigado", async () => {
    const cap = await newCapture(A, { ask: "email" });
    const t = issueToken(String(A.org._id), cap.code, Date.now() - 10_000);
    for (let i = 0; i < 5; i++) expect((await post(A, cap, { _t: t, email: `p${i}@x.com`, consent: true }, "10.9.9.9")).status).toBe(200);
    expect((await post(A, cap, { _t: t, email: "p6@x.com", consent: true }, "10.9.9.9")).status).toBe(429);
    expect((await post(A, cap, { _t: t, email: "p7@x.com", consent: true }, "10.8.8.8")).status).toBe(200);
    const form = new URLSearchParams({ _t: t, email: "html@x.com", consent: "on", utm_campaign: "stories" }).toString();
    const { NextRequest } = await import("next/server");
    const res = await captura.POST(new NextRequest(`http://localhost/api/captura/${A.org._id}/${cap.code}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.7.7.7" }, body: form }), { params: Promise.resolve({ org: String(A.org._id), code: cap.code }) });
    expect([res.status, res.headers.get("location")]).toEqual([303, "https://site.exemplo.com.br/obrigado"]);
    expect((await Contact.findOne({ organization: A.org._id, email: "html@x.com" }).lean<any>()).utm.campaign).toBe("stories");
  });
});

describe("automação do direct e anúncio para o direct", () => {
  it("passo Enviar para o CRM: vira lead na etapa, com a automação e o post como origem; clique na linha do tempo", async () => {
    const r = await call(automacoes.POST, { method: "POST", path: "/api/automacoes", cookie: A.cookie, body: { account: String(A.account._id), name: "Ebook", trigger: { kind: "comment", scope: "all", keywords: ["quero"] }, dm: { text: "Aqui está", buttons: [{ kind: "url", title: "Baixar", url: "https://exemplo.com.br/e.pdf" }] }, crm: { enabled: true, stage: "em-conversa", owner: String(A.member._id), tags: ["quente"] }, active: true, dryRun: false } });
    expect(r.status, r.text).toBe(201);
    expect(r.data.crm).toMatchObject({ enabled: true, stage: "em-conversa", owner: String(A.member._id), tags: ["quente"] });
    // etapa de outro funil / responsável de outra organização: recusado
    expect((await call(automacoes.POST, { method: "POST", path: "/api/automacoes", cookie: A.cookie, body: { account: String(A.account._id), name: "Xis", trigger: { kind: "dm", keywords: ["x"] }, dm: { text: "x" }, crm: { enabled: true, owner: String(B.owner._id) } } })).data.field).toBe("owner");
    // simulação: só mostra
    const sim = await call(simular.POST, { method: "POST", path: "/api/automacoes/simular", cookie: A.cookie, body: { automation: r.data._id, text: "quero" } });
    expect(sim.data.run.steps.find((s: any) => s.kind === "crm")).toMatchObject({ status: "dry_run" });
    expect(await Contact.countDocuments({ organization: A.org._id, lead: true })).toBe(0);
    const raw = JSON.stringify(commentPayload(A.ig, { id: "17850000000009001", text: "quero!", mediaId: MEDIA, fromId: "7001", username: "ana.ig", time: clock }));
    await call(igWebhook.POST, { method: "POST", path: "/api/instagram/webhook", body: JSON.parse(raw), headers: { "x-hub-signature-256": sign(raw) } });
    await processDue({ now: clock + 60_000 });
    const c: any = await Contact.findOne({ organization: A.org._id, igsid: "7001" }).lean();
    expect(c).toMatchObject({ lead: true, stage: "em-conversa", owner: A.member._id, tags: expect.arrayContaining(["quente"]) });
    expect(c.origin).toMatchObject({ kind: "automation", postIgId: MEDIA, label: "Ebook" });
    expect(c.firstTouch).toMatchObject({ kind: "automation", postIgId: MEDIA });
    const run: any = await AutomationRun.findOne({ organization: A.org._id, contact: c._id }).lean();
    expect(run.steps.map((s: any) => `${s.kind}:${s.status}`)).toContain("crm:done");
    const kinds = (await LeadEvent.find({ organization: A.org._id, contact: c._id }).lean<any[]>()).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(["stage", "automation"]));
    // clique no link da DM com a chave opaca do contato
    const sent = ig.messages.at(-1)!;
    const url = new URL(sent.message.attachment.payload.buttons[0].url);
    expect(url.searchParams.get("k")).toBe(c.clickKey);
    const click = await call(redirect.GET, { path: url.pathname + url.search, params: { org: String(A.org._id), code: url.pathname.split("/").pop()! } });
    expect(click.status).toBe(302);
    expect(await LeadEvent.countDocuments({ organization: A.org._id, contact: c._id, kind: "click" })).toBe(1);
    // chave de contato numa organização errada não registra nada
    await call(redirect.GET, { path: url.pathname + url.search, params: { org: String(B.org._id), code: url.pathname.split("/").pop()! } });
    expect(await LeadEvent.countDocuments({ organization: B.org._id })).toBe(0);
  });

  it("mensagem vinda de anúncio (referral ADS) marca a origem com o anúncio e a campanha", async () => {
    await AdObject.create({ organization: A.org._id, adAccount: new mongoose.Types.ObjectId(), project: A.project._id, level: "ad", metaId: "666001", name: "Anúncio direct", campaignId: "333777", adsetId: "222777" });
    const body = { object: "instagram", entry: [{ id: A.ig, time: clock, messaging: [{ sender: { id: "7002" }, recipient: { id: A.ig }, timestamp: clock, message: { mid: "mid-ref-1", text: "Oi, vi o anúncio", referral: { ref: "promo", ad_id: "666001", source: "ADS", type: "OPEN_THREAD", ads_context_data: { ad_title: "Promo de outubro" } } } }] }] };
    const raw = JSON.stringify(body);
    await call(igWebhook.POST, { method: "POST", path: "/api/instagram/webhook", body, headers: { "x-hub-signature-256": sign(raw) } });
    await processDue({ now: clock + 60_000 });
    const c: any = await Contact.findOne({ organization: A.org._id, igsid: "7002" }).lean();
    expect(c.origin).toMatchObject({ kind: "ig_ad", adId: "666001", campaignId: "333777", label: "Promo de outubro" });
    expect(c.firstTouch).toMatchObject({ kind: "ig_ad", adId: "666001", campaignId: "333777", adsetId: "222777" });
    expect(await LeadEvent.countDocuments({ organization: A.org._id, contact: c._id, kind: "referral" })).toBe(1);
  });
});

describe("relatório e LGPD", () => {
  it("leads e vendas por campanha com custo só onde o id bate; estimativa rotulada por post; CSV", async () => {
    const day = dayKey(Date.now());
    const now = new Date();
    const acc = new mongoose.Types.ObjectId();
    await AdObject.create([
      { organization: A.org._id, adAccount: acc, project: A.project._id, level: "campaign", metaId: "333001", name: "Campanha Ebook" },
      { organization: A.org._id, adAccount: acc, project: A.project._id, level: "campaign", metaId: "333002", name: "Campanha Parada" },
      { organization: A.org._id, adAccount: acc, project: A.project._id, level: "ad", metaId: "777009", name: "Anúncio do post", campaignId: "333002", adsetId: "1", igMediaId: MEDIA },
    ]);
    await AdInsightDaily.create([
      { organization: A.org._id, adAccount: acc, project: A.project._id, date: day, adId: "777001", campaignId: "333001", spend: 100, leads: 5 },
      { organization: A.org._id, adAccount: acc, project: A.project._id, date: day, adId: "777009", campaignId: "333002", spend: 40, leads: 0 },
    ]);
    // a BETA tem gasto na mesma campanha-id: não pode entrar na conta da ALFA
    await AdInsightDaily.create({ organization: B.org._id, adAccount: new mongoose.Types.ObjectId(), project: B.project._id, date: day, adId: "777001", campaignId: "333001", spend: 9999, leads: 9 });
    const mk = (name: string, touch: Record<string, unknown>, extra: Record<string, unknown> = {}) => Contact.create({ organization: A.org._id, name, lead: true, leadAt: now, pipeline: null, stage: "novo", firstTouch: { at: now, ...touch }, lastTouch: { at: now, ...touch }, ...extra });
    const pipe: any = (await call(funis.GET, { path: "/api/crm/funis", cookie: A.cookie })).data.pipelines[0];
    await mk("L1", { kind: "meta_lead_ads", campaignId: "333001" });
    await mk("L2", { kind: "meta_lead_ads", campaignId: "333001" });
    await mk("L3", { kind: "meta_lead_ads", campaignId: "333001" }, { stage: "ganhou", value: 500 });
    await mk("L4", { kind: "landing", utm: { campaign: "Campanha Parada" } });
    await mk("L5", { kind: "automation", postIgId: MEDIA });
    await Contact.updateMany({ organization: A.org._id }, { $set: { pipeline: new mongoose.Types.ObjectId(pipe._id) } });
    const r = await call(relatorios.GET, { path: "/api/crm/relatorios?agrupar=campanha&periodo=7d", cookie: A.cookie });
    expect(r.status, r.text).toBe(200);
    const ebook = r.data.rows.find((x: any) => x.key === "333001");
    expect(ebook).toMatchObject({ label: "Campanha Ebook", leads: 3, won: 1, wonValue: 500, spend: 100, metaLeads: 5, costPerLead: 33.33, costPerSale: 100, basis: "real" });
    const byName = r.data.rows.find((x: any) => x.key === "333002");
    expect(byName).toMatchObject({ leads: 1, spend: 40, basis: "estimativa" });
    expect(r.data.rows.find((x: any) => x.key === "")).toMatchObject({ leads: 1, spend: null });
    expect(r.data.totals).toMatchObject({ leads: 5, won: 1, totalSpend: 140 });
    const post = await call(relatorios.GET, { path: "/api/crm/relatorios?agrupar=post&periodo=7d", cookie: A.cookie });
    expect(post.data.rows.find((x: any) => x.key === MEDIA)).toMatchObject({ leads: 1, spend: 40, basis: "estimativa" });
    const csv = await call(relatorios.GET, { path: "/api/crm/relatorios?agrupar=origem&periodo=7d&formato=csv", cookie: A.cookie });
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(csv.text).toContain("Formulário da Meta");
    // BETA não vê nada da ALFA
    const b = await call(relatorios.GET, { path: "/api/crm/relatorios?agrupar=campanha&periodo=7d", cookie: B.cookie });
    expect(b.data.totals.leads).toBe(0);
    expect(b.text).not.toContain("Campanha Ebook");
  });

  it("exportar e excluir a pedido: só o dono; tudo some e fica o registro sem dado pessoal", async () => {
    const l = (await newLead(A, { name: "Hugo", email: "hugo@x.com", consent: true, consentBasis: "pediu pelo site" })).data.lead;
    await call(tarefas.POST, { method: "POST", path: "/api/crm/leads/x/tarefas", params: { id: l._id }, cookie: A.cookie, body: { title: "Ligar" } });
    expect((await call(exportar.GET, { path: "/api/crm/leads/x/exportar", params: { id: l._id }, cookie: A.memberCookie })).status).toBe(403);
    const ex = await call(exportar.GET, { path: "/api/crm/leads/x/exportar", params: { id: l._id }, cookie: A.cookie });
    expect(ex.status).toBe(200);
    expect(ex.data.pessoa).toMatchObject({ name: "Hugo", email: "hugo@x.com" });
    expect(ex.data.pessoa.organization).toBeUndefined();
    expect(ex.data.tarefas).toHaveLength(1);
    expect(ex.data.consentimentos.map((c: any) => c.action)).toEqual(["given"]);
    expect((await call(exportar.GET, { path: "/api/crm/leads/x/exportar", params: { id: l._id }, cookie: B.cookie })).status).toBe(404);
    expect((await call(leadRoute.DELETE, { method: "DELETE", path: "/api/crm/leads/x", params: { id: l._id }, cookie: A.memberCookie })).status).toBe(403);
    expect((await call(leadRoute.DELETE, { method: "DELETE", path: "/api/crm/leads/x", params: { id: l._id }, cookie: A.cookie })).status).toBe(200);
    expect(await Contact.countDocuments({ organization: A.org._id })).toBe(0);
    expect(await LeadEvent.countDocuments({ organization: A.org._id })).toBe(0);
    expect(await LeadTask.countDocuments({ organization: A.org._id })).toBe(0);
    const logs = await ConsentLog.find({ organization: A.org._id }).lean<any[]>();
    expect(logs.map((x) => x.action).sort()).toEqual(["erased", "exported", "given"]);
    expect(JSON.stringify(logs)).not.toContain("hugo@x.com");
  });
});
