/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connectInstagram } from "@/lib/instagram/accounts";
import { setFetchOverride } from "@/lib/instagram/client";
import { processDue } from "@/lib/automations/engine";
import { checkSignature, parseWebhook } from "@/lib/automations/webhook";
import { keywordMatches, validEmail, validPhone } from "@/lib/automations/match";
import { Automation, AutomationEvent, AutomationLedger, AutomationRun, Contact, TrackedLink, WebhookDaily } from "@/models/Automation";
import { InstagramMedia } from "@/models/InstagramMedia";
import Organization from "@/models/Organization";
import Project from "@/models/Project";
import * as webhook from "@/app/api/instagram/webhook/route";
import * as redirect from "@/app/api/r/[org]/[code]/route";
import * as automacoes from "@/app/api/automacoes/route";
import * as automacao from "@/app/api/automacoes/[id]/route";
import * as simular from "@/app/api/automacoes/simular/route";
import * as assinar from "@/app/api/automacoes/assinar/route";
import * as worker from "@/app/api/automacoes/worker/route";
import * as contatos from "@/app/api/contatos/route";
import * as contato from "@/app/api/contatos/[id]/route";
import { call, cookieFor, makeOrg, makeUser, setTestEnv } from "./helpers";
import { type AutomationFake, SECRET, automationFake, commentPayload, messagePayload, sign } from "./automation-fake";

// AUTOMAÇÕES DO DIRECT: webhook assinado e idempotente, chaves, modo ensaio, regras da Meta
// (7 dias, 1 por comentário, 1 por pessoa por post, 24h, teto por hora), consentimento antes do
// e-mail, parar, nova tentativa sem duplicar, clique contado e isolamento entre clientes.

let mongo: MongoMemoryServer;
let fake: AutomationFake;
let clock = Date.now();
const H = 3_600_000;
const A: any = {};
const B: any = {};
const MEDIA = "1800000000000100";

async function deliver(payload: unknown, secret = SECRET) {
  const raw = JSON.stringify(payload);
  return call(webhook.POST, { method: "POST", path: "/api/instagram/webhook", body: payload, headers: { "x-hub-signature-256": sign(raw, secret) } });
}
/** roda o motor depois do atraso de propósito (até 40 s) */
const runEngine = (plus = 60_000) => processDue({ now: clock + plus });

async function newAutomation(side: any, body: Record<string, any>, live = true) {
  const r = await call(automacoes.POST, { method: "POST", path: "/api/automacoes", cookie: side.cookie, body: { account: String(side.account._id), name: "Ebook", trigger: { kind: "comment", scope: "all", keywords: ["quero"] }, publicReplies: ["Te mandei no direct!", "Olha a DM 😉", "Enviado!"], dm: { text: "Aqui está o seu ebook", buttons: [{ kind: "url", title: "Baixar", url: "https://exemplo.com.br/ebook.pdf" }] }, tags: ["ebook"], active: true, dryRun: !live, ...body } });
  expect(r.status, r.text).toBe(201);
  return r.data;
}

beforeAll(async () => {
  setTestEnv();
  Object.assign(process.env, { AUTOMACOES_ENABLED: "true", IG_APP_SECRET: SECRET, IG_WEBHOOK_VERIFY_TOKEN: "token-de-verificacao-do-webhook", APP_URL: "https://contenthub.exemplo.test" });
  fake = automationFake(() => clock);
  setFetchOverride(fake.fetch);
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("automacoes"));
  for (const [side, tag] of [[A, "alfa"], [B, "beta"]] as const) {
    side.org = await makeOrg(`Cliente ${tag}`, `cliente-${tag}`, { automationsEnabled: tag === "alfa" });
    side.owner = await makeUser(side.org._id, "owner", `dona@${tag}.test`);
    side.member = await makeUser(side.org._id, "member", `membro@${tag}.test`);
    side.cookie = cookieFor(side.owner);
    side.project = await Project.create({ organization: side.org._id, name: `Projeto ${tag}`, slug: "projeto" });
    side.account = await connectInstagram(side.org._id, { project: String(side.project._id), token: `IGAA-conta-${tag}oficial-000001` }, { now: clock - H });
    side.ig = side.account.accountId;
  }
});
afterAll(async () => {
  setFetchOverride(null);
  await mongoose.disconnect();
  await mongo.stop();
  for (const k of ["AUTOMACOES_ENABLED", "IG_WEBHOOK_VERIFY_TOKEN", "AUTOMACOES_HOURLY_CAP"]) delete process.env[k];
});
beforeEach(async () => {
  clock += 2 * H; // cada teste numa hora nova (teto por hora zerado)
  fake.replies.length = 0;
  fake.messages.length = 0;
  fake.errors.length = 0;
  for (const M of [Automation, AutomationEvent, AutomationRun, AutomationLedger, Contact, TrackedLink]) await M.collection.deleteMany({});
  delete process.env.AUTOMACOES_HOURLY_CAP;
  process.env.AUTOMACOES_ENABLED = "true";
  await Organization.updateOne({ _id: A.org._id }, { $set: { automationsEnabled: true } });
});

describe("funções puras", () => {
  it("palavra: sem acento, sem maiúscula, palavra inteira", () => {
    expect(keywordMatches("Eu QUÉRO!!", ["quero"])).toBe("quero");
    expect(keywordMatches("queroo", ["quero"])).toBeNull();
    expect(keywordMatches("queroo", ["quero"], "contains")).toBe("quero");
    expect(keywordMatches("quero sim", ["quero"], "exact")).toBeNull();
  });
  it("e-mail e telefone", () => {
    expect(validEmail(" Ana@Exemplo.com.br ")).toBe("ana@exemplo.com.br");
    expect(validEmail("ana@exemplo")).toBeNull();
    expect(validPhone("(11) 91234-5678")).toBe("+5511912345678");
    expect(validPhone("+55 21 3333-4444")).toBe("+552133334444");
    expect(validPhone("1234")).toBeNull();
  });
  it("assinatura: só o HMAC do corpo cru com o segredo", () => {
    const raw = '{"object":"instagram"}';
    expect(checkSignature(raw, sign(raw))).toBe(true);
    expect(checkSignature(raw + " ", sign(raw))).toBe(false);
    expect(checkSignature(raw, sign(raw, "outro"))).toBe(false);
    expect(checkSignature(raw, null)).toBe(false);
    expect(checkSignature(raw, sign(raw), "")).toBe(false);
  });
  it("separa comentário, mensagem, botão e o formato do botão Testar do painel", () => {
    const p = parseWebhook({ object: "instagram", entry: [{ id: "17841400000000009", time: 1, changes: [{ field: "messages", value: { sender: { id: "1" }, recipient: { id: "2" }, timestamp: 5, message: { mid: "x", text: "oi" } } }] }] });
    expect(p.events[0]).toMatchObject({ field: "messages", key: "m:x", data: { text: "oi" } });
    expect(parseWebhook({ object: "page", entry: [] }).events).toEqual([]);
  });
});

describe("webhook público", () => {
  it("verificação do painel da Meta: challenge só com o token certo", async () => {
    const ok = await call(webhook.GET, { path: "/api/instagram/webhook?hub.mode=subscribe&hub.verify_token=token-de-verificacao-do-webhook&hub.challenge=1158201444" });
    expect([ok.status, ok.text]).toEqual([200, "1158201444"]);
    const bad = await call(webhook.GET, { path: "/api/instagram/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1" });
    expect(bad.status).toBe(403);
  });

  it("assinatura inválida = 401 e nada guardado; sem segredo = 503", async () => {
    await newAutomation(A, {});
    const payload = commentPayload(A.ig, { id: "17850000000000001", text: "quero", mediaId: MEDIA, fromId: "9001", time: clock });
    const bad = await deliver(payload, "segredo-errado");
    expect(bad.status).toBe(401);
    const forged = await call(webhook.POST, { method: "POST", path: "/api/instagram/webhook", body: payload });
    expect(forged.status).toBe(401);
    expect(await AutomationEvent.countDocuments({ organization: A.org._id })).toBe(0);
    expect((await WebhookDaily.findOne({}).lean<any>())?.badSignature).toBeGreaterThanOrEqual(2);
    delete process.env.IG_APP_SECRET;
    expect((await deliver(payload)).status).toBe(503);
    process.env.IG_APP_SECRET = SECRET;
  });

  it("idempotente: o mesmo evento duas vezes vira UM evento e UMA resposta", async () => {
    await newAutomation(A, {});
    const payload = commentPayload(A.ig, { id: "17850000000000002", text: "QUERO!", mediaId: MEDIA, fromId: "9002", time: clock });
    const r1 = await deliver(payload);
    const r2 = await deliver(payload);
    expect([r1.status, r1.data.stored, r2.data.stored, r2.data.duplicate]).toEqual([200, 1, 0, 1]);
    // o motor espera o atraso de propósito (5 a 40 s): logo depois, nada sai
    expect((await processDue({ now: Date.now() + 1_000 })).processed).toBe(0);
    await runEngine();
    await runEngine();
    expect(fake.replies).toHaveLength(1);
    expect(fake.messages).toHaveLength(1);
  });

  it("chave geral ou do cliente desligada: responde 200 e não guarda nada", async () => {
    await newAutomation(A, {});
    process.env.AUTOMACOES_ENABLED = "false";
    const off = await deliver(commentPayload(A.ig, { id: "17850000000000003", text: "quero", mediaId: MEDIA, fromId: "9003", time: clock }));
    expect([off.status, off.data.stored, off.data.switchedOff]).toEqual([200, 0, 1]);
    expect((await runEngine()).enabled).toBe(false);
    process.env.AUTOMACOES_ENABLED = "true";
    await Organization.updateOne({ _id: A.org._id }, { $set: { automationsEnabled: false } });
    const orgOff = await deliver(commentPayload(A.ig, { id: "17850000000000004", text: "quero", mediaId: MEDIA, fromId: "9004", time: clock }));
    expect([orgOff.data.stored, orgOff.data.switchedOff]).toEqual([0, 1]);
    const unknown = await deliver(commentPayload("17841499999999999", { id: "17850000000000005", text: "quero", mediaId: MEDIA, fromId: "9005", time: clock }));
    expect(unknown.data.unknownAccount).toBe(1);
    expect(await AutomationEvent.countDocuments({ organization: A.org._id })).toBe(0);
    expect(fake.replies.length + fake.messages.length).toBe(0);
  });
});

describe("comentou PALAVRA", () => {
  it("resposta pública em rodízio + private reply com botão de link rastreado + etiqueta + log", async () => {
    const a = await newAutomation(A, {});
    for (let i = 0; i < 4; i++) await deliver(commentPayload(A.ig, { id: `1785000000000010${i}`, text: "quero o ebook", mediaId: MEDIA, fromId: `910${i}`, username: `pessoa${i}`, time: clock }));
    // comentário da própria conta e comentário sem a palavra: nada
    await deliver(commentPayload(A.ig, { id: "17850000000000199", text: "quero", mediaId: MEDIA, fromId: A.ig, time: clock }));
    await deliver(commentPayload(A.ig, { id: "17850000000000198", text: "que lindo", mediaId: MEDIA, fromId: "9199", time: clock }));
    await runEngine();
    // a ordem depende do atraso sorteado; o rodízio usa os 3 textos e repete o 1º no 4º
    expect(fake.replies.map((r) => r.message).sort()).toEqual(["Enviado!", "Olha a DM 😉", "Te mandei no direct!", "Te mandei no direct!"]);
    expect(fake.messages).toHaveLength(4);
    const m = fake.messages.find((x) => x.recipient.comment_id === "17850000000000100")!;
    expect(m.recipient).toEqual({ comment_id: "17850000000000100" });
    const btn = m.message.attachment.payload.buttons[0];
    expect(m.message.attachment.payload).toMatchObject({ template_type: "button", text: "Aqui está o seu ebook" });
    // ?k= é a chave opaca do contato (CRM: o clique entra na linha do tempo dele), nunca dado pessoal
    expect(btn.url).toMatch(new RegExp(`^https://contenthub\\.exemplo\\.test/api/r/${A.org._id}/[\\w-]{11}\\?k=[\\w-]{12}$`));
    // nunca tag de mensagem (HUMAN_AGENT exige análise e humano)
    for (const s of fake.messages) expect(Object.keys(s.params).sort()).toEqual(["access_token", "message", "recipient"]);
    const contact: any = await Contact.findOne({ organization: A.org._id, igsid: "9100" }).lean();
    expect(contact).toMatchObject({ username: "pessoa0", tags: ["ebook"], lastInboundAt: null });
    const runs: any[] = await AutomationRun.find({ organization: A.org._id }).lean();
    expect(runs).toHaveLength(4);
    expect(runs.find((r) => r.commentId === "17850000000000100").steps.map((s: any) => `${s.kind}:${s.status}`)).toEqual(["public_reply:sent", "private_reply:sent", "tag:done"]);
    const stats: any = (await Automation.findOne({ _id: a._id, organization: A.org._id }).lean<any>()).stats;
    expect([stats.matched, stats.publicSent, stats.dmSent]).toEqual([4, 4, 4]);
    // clique no link: conta e redireciona
    const code = btn.url.split("/").pop().split("?")[0];
    const click = await call(redirect.GET, { path: btn.url.replace("https://contenthub.exemplo.test", ""), params: { org: String(A.org._id), code } });
    expect([click.status, click.headers.get("location")]).toEqual([302, "https://exemplo.com.br/ebook.pdf"]);
    expect((await call(redirect.GET, { path: "/api/r/x/y", params: { org: String(B.org._id), code } })).status).toBe(404);
    expect((await Automation.findOne({ _id: a._id, organization: A.org._id }).lean<any>()).stats.clicks).toBe(1);
  });

  it("modo ensaio (padrão): casa e registra o que enviaria, sem chamar a Meta", async () => {
    await newAutomation(A, {}, false);
    await deliver(commentPayload(A.ig, { id: "17850000000000201", text: "quero", mediaId: MEDIA, fromId: "9201", time: clock }));
    await runEngine();
    expect(fake.replies.length + fake.messages.length).toBe(0);
    const run: any = await AutomationRun.findOne({ organization: A.org._id }).lean();
    expect(run.status).toBe("dry_run");
    expect(run.steps.filter((s: any) => s.kind !== "tag").every((s: any) => s.status === "dry_run")).toBe(true);
    expect(run.steps[1].payload.recipient).toEqual({ comment_id: "17850000000000201" });
  });

  it("uma DM por pessoa por post; private reply só até 7 dias", async () => {
    await newAutomation(A, {});
    await deliver(commentPayload(A.ig, { id: "17850000000000301", text: "quero", mediaId: MEDIA, fromId: "9301", time: clock }));
    await deliver(commentPayload(A.ig, { id: "17850000000000302", text: "quero de novo", mediaId: MEDIA, fromId: "9301", time: clock }));
    await deliver(commentPayload(A.ig, { id: "17850000000000303", text: "quero", mediaId: MEDIA, fromId: "9302", time: clock - 8 * 24 * H }));
    await runEngine();
    expect(fake.replies).toHaveLength(3);
    // só UM dos dois comentários da mesma pessoa no mesmo post leva DM (o que for processado primeiro)
    expect(fake.messages).toHaveLength(1);
    const first = fake.messages[0].recipient.comment_id;
    expect(["17850000000000301", "17850000000000302"]).toContain(first);
    const second = first === "17850000000000301" ? "17850000000000302" : "17850000000000301";
    const runs: any[] = await AutomationRun.find({ organization: A.org._id }).lean();
    const byId = (id: string) => runs.find((r) => r.commentId === id).steps.find((s: any) => s.kind === "private_reply");
    expect(byId(second).detail).toMatch(/já recebeu a DM deste post/);
    expect(byId("17850000000000303").detail).toMatch(/mais de 7 dias/);
  });

  it("teto por hora por conta: o excedente espera a hora seguinte, sem perder nem duplicar", async () => {
    process.env.AUTOMACOES_HOURLY_CAP = "2";
    await newAutomation(A, { publicReplies: [] });
    for (let i = 0; i < 3; i++) await deliver(commentPayload(A.ig, { id: `1785000000000040${i}`, text: "quero", mediaId: MEDIA, fromId: `940${i}`, time: clock }));
    const r = await runEngine();
    expect([fake.messages.length, r.deferred]).toEqual([2, 1]);
    const waiting: any = await AutomationEvent.findOne({ organization: A.org._id, status: "pending" }).lean();
    expect(waiting.runAfter.getTime()).toBeGreaterThan(clock + 60_000);
    await processDue({ now: clock + 2 * H });
    expect(fake.messages).toHaveLength(3);
    process.env.AUTOMACOES_HOURLY_CAP = "5000";
    const { hourlyCap } = await import("@/lib/automations/match");
    expect(hourlyCap()).toBe(200); // nunca perto dos 750/h da Meta
  });

  it("erro passageiro da Meta: tenta de novo sem repetir o que já saiu", async () => {
    await newAutomation(A, {});
    fake.errors.push({ match: /\/messages$/, times: 1, error: { code: 2, message: "Service temporarily unavailable" }, status: 503 });
    await deliver(commentPayload(A.ig, { id: "17850000000000501", text: "quero", mediaId: MEDIA, fromId: "9501", time: clock }));
    const first = await runEngine();
    expect([first.deferred, fake.replies.length, fake.messages.length]).toEqual([1, 1, 0]);
    await processDue({ now: clock + 10 * 60_000 });
    expect([fake.replies.length, fake.messages.length]).toEqual([1, 1]);
    // erro definitivo: registra o erro da Meta, não tenta de novo
    fake.errors.push({ match: /\/messages$/, times: 1, error: { code: 100, message: "Invalid parameter" } });
    await deliver(commentPayload(A.ig, { id: "17850000000000502", text: "quero", mediaId: MEDIA, fromId: "9502", time: clock }));
    await processDue({ now: clock + 20 * 60_000 });
    const run: any = await AutomationRun.findOne({ organization: A.org._id, commentId: "17850000000000502" }).lean();
    expect(run.status).toBe("partial");
    expect(run.steps.find((s: any) => s.kind === "private_reply").metaError).toMatch(/100 Invalid parameter/);
  });

  it("escopo 'próximo post': só vale para post publicado depois de criar, e fica preso nele", async () => {
    const a = await newAutomation(A, { trigger: { kind: "comment", scope: "next", keywords: ["quero"] } });
    fake.mediaTimestamps["17999000000000001"] = new Date(Date.now() - 24 * H).toISOString();
    await InstagramMedia.create({ organization: A.org._id, project: A.project._id, account: A.account._id, igId: "17999000000000002", timestamp: new Date(clock + 60_000), kind: "reel" });
    fake.mediaTimestamps["17999000000000003"] = new Date(clock + 120_000).toISOString();
    await deliver(commentPayload(A.ig, { id: "17850000000000601", text: "quero", mediaId: "17999000000000001", fromId: "9601", time: clock }));
    await deliver(commentPayload(A.ig, { id: "17850000000000602", text: "quero", mediaId: "17999000000000002", fromId: "9602", time: clock }));
    await runEngine();
    await deliver(commentPayload(A.ig, { id: "17850000000000603", text: "quero", mediaId: "17999000000000003", fromId: "9603", time: clock }));
    await runEngine(120_000);
    expect(fake.messages.map((m) => m.recipient.comment_id)).toEqual(["17850000000000602"]);
    expect((await Automation.findOne({ _id: a._id, organization: A.org._id }).lean<any>()).trigger.mediaIds).toEqual(["17999000000000002"]);
  });
});

describe("direct: palavra, botões, janela de 24h, consentimento e parar", () => {
  it("palavra na DM responde dentro da janela; fora das 24h nada sai", async () => {
    await newAutomation(A, { name: "Preço", trigger: { kind: "dm", keywords: ["preco"] }, publicReplies: [], dm: { text: "O curso custa R$ 97", quickReplies: [{ title: "Quero comprar", replyText: "Link: https://exemplo.com.br", tag: "comprador" }] } });
    await deliver(messagePayload(A.ig, { mid: "m1", fromId: "9701", text: "Qual o PREÇO?", time: clock }));
    // mensagem que chegou há 25 h (processada atrasada): fora da janela
    await deliver(messagePayload(A.ig, { mid: "m2", fromId: "9702", text: "preço", time: clock - 25 * H }));
    await runEngine();
    expect(fake.messages.map((m) => m.recipient)).toEqual([{ id: "9701" }]);
    expect(fake.messages[0].message.quick_replies[0]).toMatchObject({ content_type: "text", title: "Quero comprar" });
    const late: any = await AutomationRun.findOne({ organization: A.org._id, "steps.status": "skipped" }).lean();
    expect(late.steps[0].detail).toMatch(/janela de 24h/);
    // resposta rápida: responde e põe a etiqueta
    await deliver(messagePayload(A.ig, { mid: "m3", fromId: "9701", text: "Quero comprar", quickReply: fake.messages[0].message.quick_replies[0].payload, time: clock + 30_000 }));
    await runEngine(90_000);
    expect(fake.messages[1].message).toEqual({ text: "Link: https://exemplo.com.br" });
    expect((await Contact.findOne({ organization: A.org._id, igsid: "9701" }).lean<any>()).tags).toContain("comprador");
    // eco (mensagem que a própria conta mandou) não dispara nada
    await deliver(messagePayload(A.ig, { mid: "m4", fromId: A.ig, text: "preço", echo: true, time: clock + 40_000 }));
    await runEngine(100_000);
    expect(fake.messages).toHaveLength(2);
  });

  it("pedir e-mail: consentimento explícito ANTES, valida, guarda com data e versão do texto", async () => {
    const a = await newAutomation(A, { ask: { enabled: true, field: "email", consentText: "A Marca Alfa guarda seu e-mail só para enviar o ebook. Autoriza?" } });
    await deliver(commentPayload(A.ig, { id: "17850000000000801", text: "quero", mediaId: MEDIA, fromId: "9801", time: clock }));
    await runEngine();
    const buttons = fake.messages[0].message.attachment.payload.buttons;
    expect(buttons.map((b: any) => b.type)).toEqual(["web_url", "postback"]);
    let t = clock + 70_000;
    const say = async (m: Record<string, any>) => {
      t += 10_000;
      await deliver(messagePayload(A.ig, { mid: `x${t}`, fromId: "9801", time: t, ...m }));
      await processDue({ now: t + 5_000 });
    };
    await say({ postback: buttons[1].payload });
    const consentMsg = fake.messages[1].message;
    expect(consentMsg.text).toBe("A Marca Alfa guarda seu e-mail só para enviar o ebook. Autoriza?");
    // antes do "sim", nada de e-mail guardado mesmo que a pessoa mande
    expect((await Contact.findOne({ organization: A.org._id, igsid: "9801" }).lean<any>()).consent.given).toBe(false);
    await say({ text: "Sim, autorizo", quickReply: consentMsg.quick_replies[0].payload });
    expect(fake.messages[2].message.text).toMatch(/e-mail/);
    await say({ text: "meu email é ana@" });
    expect(fake.messages[3].message.text).toMatch(/não parece um e-mail/);
    await say({ text: "ana@exemplo.com.br" });
    const c: any = await Contact.findOne({ organization: A.org._id, igsid: "9801" }).lean();
    expect(c.email).toBe("ana@exemplo.com.br");
    expect(c.consent).toMatchObject({ given: true, text: "A Marca Alfa guarda seu e-mail só para enviar o ebook. Autoriza?" });
    expect(c.consent.version).toMatch(/^v-[0-9a-f]{10}$/);
    expect(c.consent.at.getTime()).toBeLessThan(t);
    expect(c.pending.step).toBe("");
    expect((await Automation.findOne({ _id: a._id, organization: A.org._id }).lean<any>()).stats.leads).toBe(1);
    // exportar CSV com o consentimento
    const csv = await call(contatos.GET, { path: "/api/contatos?formato=csv", cookie: A.cookie });
    expect(csv.text).toContain("ana@exemplo.com.br");
    expect(csv.text).toContain(c.consent.version);
  });

  it("disse NÃO: nada é guardado; PARAR: nenhuma mensagem automática depois", async () => {
    await newAutomation(A, { ask: { enabled: true, field: "phone" } });
    await deliver(commentPayload(A.ig, { id: "17850000000000901", text: "quero", mediaId: MEDIA, fromId: "9901", time: clock }));
    await runEngine();
    const askPayload = fake.messages[0].message.attachment.payload.buttons[1].payload;
    await deliver(messagePayload(A.ig, { mid: "n1", fromId: "9901", postback: askPayload, time: clock + 70_000 }));
    await runEngine(80_000);
    expect(fake.messages[1].message.text).toMatch(/telefone/);
    await deliver(messagePayload(A.ig, { mid: "n2", fromId: "9901", text: "não", time: clock + 90_000 }));
    await runEngine(100_000);
    let c: any = await Contact.findOne({ organization: A.org._id, igsid: "9901" }).lean();
    expect([c.phone, c.consent.given, Boolean(c.consent.refusedAt)]).toEqual(["", false, true]);
    await deliver(messagePayload(A.ig, { mid: "n3", fromId: "9901", text: "PARAR", time: clock + 110_000 }));
    await runEngine(120_000);
    c = await Contact.findOne({ organization: A.org._id, igsid: "9901" }).lean();
    expect(c.optOutAt).toBeTruthy();
    const before = fake.messages.length + fake.replies.length;
    await deliver(commentPayload(A.ig, { id: "17850000000000902", text: "quero", mediaId: "17999000000000777", fromId: "9901", time: clock + 130_000 }));
    await runEngine(200_000);
    expect(fake.messages.length + fake.replies.length).toBe(before);
  });
});

describe("telas e permissões", () => {
  it("nasce desligada e em ensaio; membro não liga; sair do ensaio pede confirmação", async () => {
    const r = await call(automacoes.POST, { method: "POST", path: "/api/automacoes", cookie: cookieFor(A.member), body: { account: String(A.account._id), name: "Teste", trigger: { kind: "comment", scope: "all", keywords: ["eu"] }, dm: { text: "oi" } } });
    expect([r.status, r.data.active, r.data.dryRun]).toEqual([201, false, true]);
    const asMember = await call(automacao.PUT, { method: "PUT", path: "/api/automacoes/x", params: { id: r.data._id }, cookie: cookieFor(A.member), body: { active: true } });
    expect(asMember.status).toBe(403);
    const noConfirm = await call(automacao.PUT, { method: "PUT", path: "/api/automacoes/x", params: { id: r.data._id }, cookie: A.cookie, body: { active: true, dryRun: false } });
    expect(noConfirm.status).toBe(409);
    const ok = await call(automacao.PUT, { method: "PUT", path: "/api/automacoes/x", params: { id: r.data._id }, cookie: A.cookie, body: { active: true, dryRun: false, confirm: true } });
    expect([ok.status, ok.data.active, ok.data.dryRun]).toEqual([200, true, false]);
    // validações com campo
    const badUrl = await call(automacoes.POST, { method: "POST", path: "/api/automacoes", cookie: A.cookie, body: { account: String(A.account._id), name: "Xis", trigger: { kind: "comment", scope: "all", keywords: ["a"] }, dm: { text: "oi", buttons: [{ kind: "url", title: "Ir", url: "javascript:alert(1)" }] } } });
    expect([badUrl.status, badUrl.data.field]).toEqual([400, "dm.buttons.0.url"]);
    const noPost = await call(automacoes.POST, { method: "POST", path: "/api/automacoes", cookie: A.cookie, body: { account: String(A.account._id), name: "Xis", trigger: { kind: "comment", scope: "posts", keywords: ["a"] }, dm: { text: "oi" } } });
    expect(noPost.data.field).toBe("mediaIds");
  });

  it("simular funciona com as chaves desligadas e nunca chama a Meta", async () => {
    process.env.AUTOMACOES_ENABLED = "false";
    const a = await newAutomation(A, {});
    const r = await call(simular.POST, { method: "POST", path: "/api/automacoes/simular", cookie: A.cookie, body: { automation: a._id, text: "Quero!", username: "teste" } });
    expect([r.status, r.data.matched, r.data.run.status]).toEqual([200, true, "dry_run"]);
    expect(r.data.run.steps.map((s: any) => s.kind)).toEqual(["public_reply", "private_reply", "tag"]);
    const miss = await call(simular.POST, { method: "POST", path: "/api/automacoes/simular", cookie: A.cookie, body: { automation: a._id, text: "bom dia" } });
    expect(miss.data.matched).toBe(false);
    expect(fake.replies.length + fake.messages.length).toBe(0);
    expect(await Contact.countDocuments({ organization: A.org._id })).toBe(0);
    // ligar o webhook na conta: só com as chaves ligadas
    expect((await call(assinar.POST, { method: "POST", path: "/api/automacoes/assinar", cookie: A.cookie, body: { account: String(A.account._id) } })).status).toBe(403);
    process.env.AUTOMACOES_ENABLED = "true";
    const sub = await call(assinar.POST, { method: "POST", path: "/api/automacoes/assinar", cookie: A.cookie, body: { account: String(A.account._id) } });
    expect([sub.status, fake.subscribed.at(-1)]).toEqual([200, "comments,messages,messaging_postbacks,messaging_referral"]);
  });

  it("contato: etiquetas, campos e exclusão a pedido (LGPD) que limpa o log", async () => {
    await newAutomation(A, {});
    await deliver(commentPayload(A.ig, { id: "17850000000001001", text: "quero", mediaId: MEDIA, fromId: "9911", username: "apagar_eu", time: clock }));
    await runEngine();
    const list = await call(contatos.GET, { path: "/api/contatos?tag=ebook", cookie: A.cookie });
    expect(list.data.contacts.map((c: any) => c.username)).toEqual(["apagar_eu"]);
    const id = list.data.contacts[0]._id;
    const upd = await call(contato.PUT, { method: "PUT", path: "/api/contatos/x", params: { id }, cookie: A.cookie, body: { tags: ["ebook", "vip"], fields: { cidade: "Sorocaba" } } });
    expect(upd.data).toMatchObject({ tags: ["ebook", "vip"], fields: { cidade: "Sorocaba" } });
    expect((await call(contato.PUT, { method: "PUT", path: "/api/contatos/x", params: { id }, cookie: A.cookie, body: { fields: { "Cidade!": "x" } } })).status).toBe(400);
    expect((await call(contato.DELETE, { method: "DELETE", path: "/api/contatos/x", params: { id }, cookie: cookieFor(A.member) })).status).toBe(403);
    expect((await call(contato.DELETE, { method: "DELETE", path: "/api/contatos/x", params: { id }, cookie: A.cookie })).status).toBe(200);
    const run: any = await AutomationRun.findOne({ organization: A.org._id }).lean();
    expect([run.username, run.text, run.contact]).toEqual(["", "", null]);
    expect(await AutomationLedger.countDocuments({ organization: A.org._id, key: /:9911$/ })).toBe(0);
  });

  it("worker só com o token de rotina", async () => {
    expect((await call(worker.POST, { method: "POST", path: "/api/automacoes/worker", cookie: A.cookie })).status).toBe(401);
    const r = await call(worker.POST, { method: "POST", path: "/api/automacoes/worker", headers: { authorization: `Bearer ${process.env.CRON_TOKEN}` } });
    expect([r.status, r.data.enabled]).toEqual([200, true]);
  });
});

describe("isolamento", () => {
  it("a mesma conta do Instagram em dois clientes: só quem tem a chave ligada recebe, e cada um no seu", async () => {
    await newAutomation(A, {});
    // B conecta a MESMA conta do Instagram de A, mas está com as automações desligadas
    const same = await connectInstagram(B.org._id, { project: String(B.project._id), token: "IGAA-conta-alfaoficial-000001" }, { now: clock });
    expect(same.accountId).toBe(A.ig);
    await deliver(commentPayload(A.ig, { id: "17850000000001101", text: "quero", mediaId: MEDIA, fromId: "9921", time: clock }));
    expect(await AutomationEvent.countDocuments({ organization: B.org._id })).toBe(0);
    await Organization.updateOne({ _id: B.org._id }, { $set: { automationsEnabled: true } });
    await deliver(commentPayload(A.ig, { id: "17850000000001102", text: "quero", mediaId: MEDIA, fromId: "9922", time: clock }));
    expect(await AutomationEvent.countDocuments({ organization: B.org._id })).toBe(1);
    await runEngine();
    // B não tem automação: nada sai em nome de B; A respondeu os dois
    expect(await AutomationRun.countDocuments({ organization: B.org._id })).toBe(0);
    expect(await Contact.countDocuments({ organization: B.org._id })).toBe(0);
    expect(fake.messages).toHaveLength(2);
    // dono da BETA não vê nada da ALFA
    const listB = await call(automacoes.GET, { path: "/api/automacoes", cookie: B.cookie });
    expect(listB.data.automations).toEqual([]);
    expect((await call(contatos.GET, { path: "/api/contatos", cookie: B.cookie })).data.contacts).toEqual([]);
    await Organization.updateOne({ _id: B.org._id }, { $set: { automationsEnabled: false } });
  });
});
