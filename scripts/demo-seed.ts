/* eslint-disable @typescript-eslint/no-explicit-any */
// Dados de EXEMPLO (white label) para ver as telas sem token de verdade.
// Exige IG_MOCK=1 e banco local. Cria o administrador (ADMIN_EMAIL/ADMIN_PASSWORD) e
// clientes em situações diferentes: com dados, recém-criado, aguardando o dono e inativo.
import mongoose from "mongoose";
import type { Types } from "mongoose";
import Organization from "../src/models/Organization";
import Post from "../src/models/Post";
import Project from "../src/models/Project";
import User from "../src/models/User";
import { InstagramAccountDaily } from "../src/models/InstagramMedia";
import { hashPassword } from "../src/lib/auth";
import { connectInstagram } from "../src/lib/instagram/accounts";
import { addDays, dayKey } from "../src/lib/instagram/dates";
import { syncComments } from "../src/lib/instagram/comments";
import { syncAccount } from "../src/lib/instagram/sync";
import { createInvite } from "../src/lib/invites";
import { ensureAdmin, ensureDefaultOrganization } from "../src/lib/orgs";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import path from "node:path";
import { storeUpload } from "../src/lib/media/store";
import { historyEntry } from "../src/lib/workflow";
import { connectAdAccount, syncAdAccount } from "../src/lib/ads/accounts";
import { refreshCompetitor } from "../src/lib/competitors/competitors";
import { encrypt } from "../src/lib/crypto";
import { Competitor, CompetitorProduct } from "../src/models/Competitor";
import { HouseCredential } from "../src/models/Platform";
import SocialAccount from "../src/models/SocialAccount";
import { Automation } from "../src/models/Automation";
import { ensureLinks } from "../src/lib/automations/links";
import { ingest } from "../src/lib/automations/webhook";
import { processDue } from "../src/lib/automations/engine";
import { changeStage, createTask, logEvent, upsertLead } from "../src/lib/crm/leads";
import { defaultPipeline } from "../src/lib/crm/pipelines";
import { AdObject } from "../src/models/Ads";
import { Contact } from "../src/models/Automation";
import { LeadAdsEvent, LeadAdsPage, LeadCapture } from "../src/models/Crm";
import { SalesIntegration, TrackVisitor, TrackingSite } from "../src/models/Tracking";
import { processSale } from "../src/lib/tracking/sales";
import { HouseOffer, HouseOfferDaily, OfferDaily, OfferFavorite, OfferPage } from "../src/models/Offer";
import { mockActiveAds } from "../src/lib/ads/mock";

const uri = process.env.MONGODB_URI || "";
if (!/127\.0\.0\.1|localhost/.test(uri) || process.env.IG_MOCK !== "1") {
  console.error("Recusado: o seed de demonstração só roda em banco local e com IG_MOCK=1.");
  process.exit(1);
}

export const DEMO_PASSWORD = "demo-senha-2026";
const LOGO = (letter: string, color: string) =>
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${color}"/><text x="32" y="44" font-family="Arial" font-size="36" font-weight="700" text-anchor="middle" fill="#fff">${letter}</text></svg>`
  ).toString("base64");


// OFERTAS de exemplo: lista da organização (API simulada e manual) e lista da casa, com 40 dias de fotos.
async function seedOffers(org: Types.ObjectId, adminId: Types.ObjectId) {
  const today = dayKey(Date.now());
  const mine = await OfferPage.create([
    { organization: org, name: "Chá Seca Barriga", pageId: "7711021", offerUrl: "https://exemplo.com/cha", counting: "api", tags: { structure: "vsl", niche: "nutra", product: "chá", language: "pt", countries: ["PT", "BR"] } },
    { organization: org, name: "Método Inglês 90 Dias", pageId: "7712388", offerUrl: "https://exemplo.com/ingles", counting: "api", tags: { structure: "pagina_vendas", niche: "info", product: "curso de inglês", language: "pt", countries: ["PT"] } },
    { organization: org, name: "Quiz do Sono Profundo", pageId: "7719102", offerUrl: "https://exemplo.com/quiz-sono", counting: "api", tags: { structure: "quiz", niche: "nutra", product: "suplemento", language: "es", countries: ["ES", "MX"] } },
    { organization: org, name: "Planilha Financeira Pro", pageId: "7714077", offerUrl: "https://exemplo.com/planilha", counting: "api", tags: { structure: "pagina_vendas", niche: "info", product: "planilha", language: "pt", countries: ["PT"] } },
    { organization: org, name: "Kit Pele de Seda (só Brasil)", offerUrl: "https://exemplo.com/kit", counting: "manual", tags: { structure: "vsl", niche: "ecommerce", product: "cosmético", language: "pt", countries: ["BR"] } },
    { organization: org, name: "Desafio 21 Dias Sem Açúcar", pageId: "7715533", counting: "manual", tags: { structure: "quiz", niche: "info", language: "pt", countries: ["BR"] } },
  ]);
  for (const p of mine) {
    const rows: any[] = [];
    for (let i = 39; i >= 0; i--) {
      const date = addDays(today, -i);
      if (p.counting === "api") rows.push({ organization: org, page: p._id, date, count: mockActiveAds(p.pageId, date), source: "api", countries: ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"], calls: 2 });
      else if (i % 3 === 0) rows.push({ organization: org, page: p._id, date, count: Math.round((p.name.startsWith("Kit") ? 40 : 160) * (1 + (39 - i) * (p.name.startsWith("Kit") ? 0.045 : -0.012))), source: "manual", byUser: adminId, byName: "Administrador", note: "Biblioteca pública, país Brasil" });
    }
    await OfferDaily.insertMany(rows);
    const last = rows[rows.length - 1];
    await OfferPage.updateOne({ organization: org, _id: p._id }, { $set: { last: { date: last.date, count: last.count, source: last.source, complete: true, countries: last.countries || [], at: new Date(), error: "" } } });
  }
  await OfferFavorite.create([{ organization: org, user: adminId, kind: "org", ref: mine[0]._id }, { organization: org, user: adminId, kind: "org", ref: mine[2]._id }]);
  const house = [
    ["Gotas Articulações Ativa", "7721450", "vsl", "nutra", "es", ["ES", "MX"], 0],
    ["Curso Confeitaria Lucrativa", "7722871", "pagina_vendas", "info", "pt", ["PT", "BR"], 0],
    ["Quiz Pressão em Dia", "7723309", "quiz", "nutra", "pt", ["PT"], 3],
    ["Slim Coffee Express", "7724416", "vsl", "nutra", "en", ["IE", "US"], 6],
    ["Mentoria Renda Extra", "7725590", "vsl", "info", "pt", ["PT"], 9],
    ["Detox Verde 7", "7726014", "pagina_vendas", "nutra", "es", ["ES"], 14],
    ["Inglês no Carro", "7727731", "pagina_vendas", "info", "pt", ["BR", "PT"], 20],
    ["Colágeno Glow", "7728862", "quiz", "nutra", "en", ["IE"], 25],
  ] as const;
  for (const [name, pageId, structure, niche, language, countries, age] of house) {
    const h = await HouseOffer.create({ name, pageId, counting: "api", offerUrl: `https://exemplo.com/${pageId}`, tags: { structure, niche, language, countries: [...countries], product: "" }, addedBy: process.env.ADMIN_EMAIL || "" });
    await HouseOffer.collection.updateOne({ _id: h._id }, { $set: { createdAt: new Date(Date.now() - age * 86_400_000) } });
    const rows: any[] = [];
    for (let i = Math.max(age, 45); i >= 0; i--) {
      const date = addDays(today, -i);
      rows.push({ page: h._id, date, count: mockActiveAds(pageId, date), source: "api", countries: ["PT", "ES", "FR", "DE", "IT", "IE"], calls: 1 });
    }
    await HouseOfferDaily.insertMany(rows);
  }
  await OfferFavorite.create({ organization: org, user: adminId, kind: "casa", ref: (await HouseOffer.findOne({ pageId: "7721450" }))!._id });
}

async function content(org: Types.ObjectId, project: Types.ObjectId, titles: string[], token: string, followers: number) {
  const now = Date.now();
  for (const [i, title] of titles.entries()) {
    await Post.create({
      organization: org,
      project,
      title,
      caption: "Legenda de exemplo",
      format: i % 2 === 0 ? "reel" : "carrossel",
      platforms: ["instagram"],
      scheduledDate: new Date(now + (i - 2) * 86_400_000),
      scheduledTime: ["09:00", "12:00", "19:00"][i % 3],
      status: i < 2 ? "posted" : "draft",
      externalIds: i === 0 ? { instagram: "1800000000000100" } : {},
    });
  }
  const account = await connectInstagram(org, { project: String(project), token });
  const today = dayKey(now);
  for (let i = 1; i <= 45; i++) {
    await InstagramAccountDaily.updateOne(
      { organization: org, account: account._id, date: addDays(today, -i) },
      { $set: { project, followers: followers - i * Math.round(followers / 600) - Math.round(Math.sin(i * 1.3) * 9) } },
      { upsert: true }
    );
  }
  const r = await syncAccount(org, String(account._id));
  // comentários de exemplo dos posts dos últimos 60 dias (a Meta simulada libera só parte deles)
  await syncComments(org, String(account._id), { from: addDays(today, -60), to: today });
  return r;
}

// Arte de exemplo (gerada aqui mesmo) passando pelo MESMO caminho de um envio de verdade.
async function art(org: Types.ObjectId, text: string, a: string, b: string, w = 1080, h = 1350) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="50%" font-family="Arial" font-size="${Math.round(w / 12)}" font-weight="700" fill="#fff" text-anchor="middle">${text}</text></svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return storeUpload(org, { body: new Blob([new Uint8Array(buf)]).stream() as ReadableStream<Uint8Array>, name: `${text}.png` });
}
async function video(org: Types.ObjectId) {
  const buf = readFileSync(path.resolve(__dirname, "../tests/fixtures/reel-ok.mp4"));
  return storeUpload(org, { body: new Blob([new Uint8Array(buf)]).stream() as ReadableStream<Uint8Array>, name: "aula-experimental.mp4" });
}

// Posts em cada situação do fluxo: rascunho com ajuste pedido, aguardando aprovação, aprovado,
// publicado, falhou e perdeu o horário.
async function flowPosts(org: Types.ObjectId, project: Types.ObjectId, owner: string, member: string) {
  const now = Date.now();
  const day = (d: number) => new Date(Date.parse(dayKey(now + d * 86_400_000) + "T00:00:00Z"));
  const at = (d: number, time: string) => new Date(Date.parse(dayKey(now + d * 86_400_000) + "T00:00:00Z") + 3 * 3_600_000 + (Number(time.slice(0, 2)) * 60 + Number(time.slice(3))) * 60_000);
  const mk = async (title: string, format: string, d: number, time: string, assets: any[], extra: Record<string, unknown>) => {
    const post = await Post.create({
      organization: org, project, title, format, platforms: ["instagram"], scheduledDate: day(d), scheduledTime: time,
      caption: "Cuidar da postura muda o seu dia. Veja o passo a passo e salve para fazer em casa.\n\nAgende sua aula experimental pelo link do perfil.",
      hashtags: ["#pilates", "#postura", "#bemestar"], media: assets.map((a) => a._id), ...extra,
    });
    for (const a of assets) { a.post = post._id; await a.save(); }
    return post;
  };
  const h = (type: string, by: string, note: string, minsAgo: number) => historyEntry(type, by, note, new Date(now - minsAgo * 60_000));
  const approval = (mins: number) => ({ by: null, byName: owner, at: new Date(now - mins * 60_000) });

  await mk("Carrossel: postura no trabalho", "carrossel", 1, "09:00", [await art(org, "4 erros na postura", "#ec4899", "#8b5cf6"), await art(org, "1. Ombros caídos", "#8b5cf6", "#06b6d4"), await art(org, "2. Celular baixo", "#06b6d4", "#22c55e")], {
    status: "pending", review: { requestedByName: member, requestedAt: new Date(now - 50 * 60_000) }, history: [h("criado", member, "", 70), h("pedido", member, "", 50)],
  });
  await mk("Reel: convite para a aula", "reel", 2, "19:00", [await video(org)], {
    status: "pending", review: { requestedByName: member, requestedAt: new Date(now - 20 * 60_000) }, history: [h("criado", member, "", 30), h("pedido", member, "", 20)],
  });
  await mk("Frase da semana (foto muito alta)", "post", 3, "12:00", [await art(org, "Respire fundo", "#f97316", "#ec4899", 1080, 2200)], {
    status: "pending", review: { requestedByName: member, requestedAt: new Date(now - 10 * 60_000) }, history: [h("criado", member, "", 15), h("pedido", member, "", 10)],
  });
  await mk("Depoimento da aluna Ana", "post", 2, "09:00", [await art(org, "Depoimento da Ana", "#0ea5e9", "#6366f1", 1080, 1080)], {
    status: "scheduled", publishAt: at(2, "09:00"), approval: approval(200), publish: { dueAt: at(2, "09:00") }, history: [h("criado", member, "", 400), h("pedido", member, "", 380), h("aprovado", owner, "Sai no horário marcado", 200)],
  });
  await mk("Horários de novembro", "post", 4, "08:30", [await art(org, "Horários de novembro", "#22c55e", "#0ea5e9", 1080, 1080)], {
    status: "scheduled", publishAt: at(4, "08:30"), approval: approval(90), publish: { dueAt: at(4, "08:30") }, history: [h("criado", owner, "", 100), h("aprovado", owner, "", 90)],
  });
  await mk("Alongamento de 5 minutos", "post", -1, "09:00", [await art(org, "Alongamento 5 min", "#a855f7", "#ec4899")], {
    status: "posted", publishAt: at(-1, "09:00"), approval: approval(3000), externalIds: { instagram: "1800000000000105", instagramPermalink: "https://www.instagram.com/p/EXEMPLO5/" },
    publish: { dueAt: at(-1, "09:00"), publishedAt: new Date(at(-1, "09:00").getTime() + 40_000) },
    history: [h("criado", member, "", 3200), h("pedido", member, "", 3100), h("aprovado", owner, "", 3000), historyEntry("publicado", "ContentHub", "https://www.instagram.com/p/EXEMPLO5/", new Date(at(-1, "09:00").getTime() + 40_000))],
  });
  await mk("Promoção de aniversário", "post", 0, "07:00", [await art(org, "Promoção", "#ef4444", "#f97316", 1080, 1080)], {
    status: "failed", publishAt: at(0, "07:00"), approval: approval(900),
    publish: { dueAt: at(0, "07:00"), lastError: "A conta do Instagram está restrita ou com alguma pendência. Abra o aplicativo do Instagram e resolva o aviso que aparecer. (código 25/2207050)", lastErrorKind: "desconhecido", lastErrorAt: at(0, "07:00") },
    history: [h("criado", owner, "", 1000), h("aprovado", owner, "", 900), historyEntry("falhou", "ContentHub", "A conta do Instagram está restrita ou com alguma pendência.", at(0, "07:00"))],
  });
  await mk("Dica rápida de respiração", "post", -2, "18:00", [await art(org, "Respiração", "#14b8a6", "#3b82f6", 1080, 1080)], {
    status: "missed", publishAt: at(-2, "18:00"), approval: approval(4000),
    publish: { dueAt: at(-2, "18:00"), lastError: "Não foi publicado: passou mais de 60 minutos do horário marcado. Escolha publicar agora ou marcar outro horário.", lastErrorKind: "atraso", lastErrorAt: new Date(at(-2, "18:00").getTime() + 70 * 60_000) },
    history: [h("criado", member, "", 4200), h("aprovado", owner, "", 4000), historyEntry("perdeu", "ContentHub", "Passou mais de 60 minutos do horário marcado.", new Date(at(-2, "18:00").getTime() + 70 * 60_000))],
  });
  await mk("Bastidores do estúdio", "carrossel", 5, "17:00", [await art(org, "Bastidores", "#64748b", "#0f172a", 1080, 1080)], {
    status: "draft", review: { note: "Falta a segunda foto e a legenda está genérica.", noteByName: owner, noteAt: new Date(now - 30 * 60_000) }, history: [h("criado", member, "", 300), h("pedido", member, "", 280), h("ajuste", owner, "Falta a segunda foto e a legenda está genérica.", 30)],
  });
}


// Automações de exemplo na casa: uma de comentário (fora do ensaio), uma de direct (em ensaio) e
// eventos simulados passando pelo MESMO caminho do webhook e do motor (a Meta é a simulada do IG_MOCK).
async function automationsDemo(org: Types.ObjectId, project: Types.ObjectId) {
  const account: any = await SocialAccount.findOne({ organization: org, project, platform: "instagram" }).lean();
  await Organization.updateOne({ _id: org }, { $set: { automationsEnabled: true } });
  const ebook = new Automation({
    organization: org, project, account: account._id, name: "Ebook 21 dias", active: true, dryRun: false,
    trigger: { kind: "comment", scope: "all", keywords: ["quero", "21"], match: "word" },
    publicReplies: ["Te mandei no direct! 📩", "Corre lá na DM 😉", "Enviado, confere o direct!"],
    dm: { text: "Oi! Aqui está o ebook dos 21 dias que você pediu 👇", buttons: [{ kind: "url", title: "Baixar o ebook", url: "https://exemplo.com.br/ebook-21-dias.pdf" }] },
    ask: { enabled: true, field: "email", buttonTitle: "Quero por e-mail", consentText: "Para te mandar os próximos materiais, a Hora de Mudar o Jogo precisa guardar o seu e-mail e usar só para isso. Você autoriza?" },
    tags: ["ebook-21"],
    crm: { enabled: true, stage: "em-conversa", tags: ["ebook"] },
  });
  await ensureLinks(org, ebook);
  await ebook.save();
  const preco = new Automation({
    organization: org, project, account: account._id, name: "Preço da mentoria", active: true, dryRun: true,
    trigger: { kind: "dm", keywords: ["preco", "valor"], match: "word" },
    dm: { text: "A mentoria custa R$ 497 em até 12x. Quer ver como funciona?", buttons: [{ kind: "url", title: "Ver a página", url: "https://exemplo.com.br/mentoria" }], quickReplies: [{ title: "Tenho dúvida", replyText: "Me conta sua dúvida que eu respondo!", tag: "duvida" }] },
    tags: ["interesse-mentoria"],
  });
  await ensureLinks(org, preco);
  await preco.save();
  await Automation.create({ organization: org, project, account: account._id, name: "Próximo Reel: palavra GUIA", trigger: { kind: "comment", scope: "next", nextAfter: new Date(), keywords: ["guia"] }, dm: { text: "Aqui está o guia!" }, publicReplies: ["Enviado no direct!"] });
  const ig = String(account.accountId);
  const people = [["17841400000000201", "ana.souza"], ["17841400000000202", "bruno_lima"], ["17841400000000203", "carla.m"], ["17841400000000204", "diego.f"], ["17841400000000205", "eduarda_r"]];
  const t0 = Date.now() - 50 * 60_000;
  const prev = process.env.AUTOMACOES_ENABLED;
  process.env.AUTOMACOES_ENABLED = "true";
  const deliver = (body: unknown, at: number) => ingest(body, { now: at, delay: () => 0 });
  const comment = (i: number, text: string, media = "1800000000000100") => ({ object: "instagram", entry: [{ id: ig, time: Math.floor((t0 + i * 60_000) / 1000), changes: [{ field: "comments", value: { id: `1785100000000${100 + i}`, text, from: { id: people[i % people.length][0], username: people[i % people.length][1] }, media: { id: media } } }] }] });
  const msg = (who: number, mid: string, at: number, m: Record<string, unknown>) => ({ object: "instagram", entry: [{ id: ig, time: at, messaging: [{ sender: { id: people[who][0] }, recipient: { id: ig }, timestamp: at, ...m, ...(m.postback ? {} : { message: { mid, ...(m.message as object) } }) }] }] });
  for (const [i, text] of ["QUERO!!", "quero o ebook", "Quero 21", "que lindo esse post", "quero de novo"].entries()) {
    await deliver(comment(i, text, i === 4 ? "1800000000000100" : "1800000000000100"), t0 + i * 60_000);
  }
  // a 5ª pessoa repete no mesmo post: recebe resposta pública, mas não 2ª DM
  await deliver(comment(5, "QUERO também"), t0 + 6 * 60_000);
  await processDue({ now: t0 + 8 * 60_000 });
  // Ana pede por e-mail: botão -> consentimento -> sim -> e-mail
  const at = t0 + 10 * 60_000;
  await deliver(msg(0, "", at, { postback: { mid: "pb1", title: "Quero por e-mail", payload: `ask:${ebook._id}` } }), at);
  await processDue({ now: at + 5_000 });
  await deliver(msg(0, "mid-ana-1", at + 20_000, { message: { text: "Sim, autorizo", quick_reply: { payload: `ask-yes:${ebook._id}` } } }), at + 20_000);
  await processDue({ now: at + 25_000 });
  await deliver(msg(0, "mid-ana-2", at + 40_000, { message: { text: "ana.souza@exemplo.com.br" } }), at + 40_000);
  await processDue({ now: at + 45_000 });
  // Bruno pergunta o preço no direct (automação em ensaio)
  await deliver(msg(1, "mid-bruno-1", at + 60_000, { message: { text: "Qual o valor da mentoria?" } }), at + 60_000);
  await processDue({ now: at + 65_000 });
  // Carla pede para parar
  await deliver(msg(2, "mid-carla-1", at + 80_000, { message: { text: "parar" } }), at + 80_000);
  await processDue({ now: at + 85_000 });
  if (prev === undefined) delete process.env.AUTOMACOES_ENABLED; else process.env.AUTOMACOES_ENABLED = prev;
}

// CRM: leads de todas as portas, espalhados pelo funil, com tarefas e notas (tudo local)
async function crmDemo(org: Types.ObjectId, actor: any, seller: any) {
  await Organization.updateOne({ _id: org }, { $set: { leadAdsEnabled: true } });
  const pipe: any = await defaultPipeline(org);
  const ads: any[] = await AdObject.find({ organization: org, level: "ad" }).limit(6).lean();
  const camps: any[] = await AdObject.find({ organization: org, level: "campaign" }).lean();
  const cname = (id: string) => camps.find((c) => c.metaId === id)?.name || "";
  const page = await LeadAdsPage.create({ organization: org, pageId: "200000000000001", name: "Hora de Mudar o Jogo", credentials: { accessToken: encrypt("token-de-pagina-de-demonstracao-0001") }, pipeline: pipe._id, stage: "novo", tags: ["formulario"], lastLeadAt: new Date(Date.now() - 2 * 3_600_000) });
  const cap = await LeadCapture.create({ organization: org, name: "Página do ebook", code: "demoEbook01", pipeline: pipe._id, stage: "novo", tags: ["pagina-ebook"], redirectUrl: "https://exemplo.com.br/obrigado", postIgId: "1800000000000100", submissions: 4, lastAt: new Date(Date.now() - 5 * 3_600_000) });
  await LeadCapture.create({ organization: org, name: "Lista de espera da mentoria", code: "demoLista01", pipeline: pipe._id, stage: "novo", ask: "phone", tags: ["lista-espera"], active: false });
  const people = [
    ["Mariana Alves", "mariana.alves@exemplo.com.br", "11 98123-4501"], ["Rodrigo Pires", "rodrigo.p@exemplo.com.br", "21 99876-1102"], ["Juliana Castro", "ju.castro@exemplo.com.br", "31 99712-3303"],
    ["Felipe Moura", "felipe.moura@exemplo.com.br", "11 97654-2204"], ["Patrícia Gomes", "patricia.g@exemplo.com.br", "41 99888-0105"], ["Lucas Teixeira", "lucas.t@exemplo.com.br", "11 99345-7706"],
    ["Camila Rocha", "camila.rocha@exemplo.com.br", "19 99234-1207"], ["Thiago Nunes", "thiago.n@exemplo.com.br", "11 98765-4308"],
  ];
  const day = 86_400_000;
  const made: any[] = [];
  for (const [i, [name, email, phone]] of people.entries()) {
    const ad = ads[i % Math.max(1, ads.length)];
    const at = new Date(Date.now() - (i * 2 + 1) * day);
    const r = await upsertLead(org, {
      name, email, phone, tags: ["formulario"], pipeline: pipe._id, owner: i % 2 ? seller._id : actor._id, source: "meta_lead_ads",
      origin: { leadgenId: `9100000000${i}`, formId: "880000000000001", pageId: page.pageId, adId: ad?.metaId || "", adsetId: ad?.adsetId || "", campaignId: ad?.campaignId || "", label: cname(ad?.campaignId) || "Formulário" },
      touch: { at, kind: "meta_lead_ads", label: cname(ad?.campaignId), campaignId: ad?.campaignId || "", adsetId: ad?.adsetId || "", adId: ad?.metaId || "", formId: "880000000000001" },
      consent: { given: true, channel: "meta_lead_form", text: "Preencheu o formulário de cadastro do anúncio na Meta.", version: "form:880000000000001", basis: "formulário 880000000000001", at },
      eventKind: "lead_ads", eventText: `Preencheu o formulário da Meta (${cname(ad?.campaignId) || "anúncio"}).`,
    }, null, at);
    await LeadAdsEvent.create({ organization: org, page: page._id, pageId: page.pageId, leadgenId: `9100000000${i}`, formId: "880000000000001", adId: ad?.metaId || "", status: "done", note: "Lead criado.", contact: r.contact._id, processedAt: at });
    made.push(r.contact);
  }
  const landing = [["Beatriz Lopes", "", "11 99111-2233", "instagram", "bio"], ["Gustavo Reis", "gustavo.reis@exemplo.com.br", "", "instagram", "stories-outubro"], ["Helena Prado", "helena.p@exemplo.com.br", "11 99222-3344", "youtube", "video-rotina"]];
  for (const [i, [name, email, phone, src, camp]] of landing.entries()) {
    const at = new Date(Date.now() - (i + 1) * 30 * 3_600_000);
    const utm = { source: src, medium: "social", campaign: camp };
    const r = await upsertLead(org, { name, email, phone, tags: ["pagina-ebook"], pipeline: pipe._id, source: "landing", origin: { label: cap.name, capture: cap._id, postIgId: cap.postIgId }, touch: { at, kind: "link", label: cap.name, capture: cap._id, postIgId: cap.postIgId, utm }, utm, consent: { given: true, channel: "landing", text: "Autorizo a Hora de Mudar o Jogo a guardar meus dados deste formulário.", version: "v-demo", basis: `formulário "${cap.name}"`, at }, eventKind: "capture", eventText: `Enviou o formulário "${cap.name}" (utm_campaign ${camp}).` }, null, at);
    made.push(r.contact);
  }
  const manual = await upsertLead(org, { name: "Renato Barbosa", phone: "11 99555-6677", value: 1497, pipeline: pipe._id, owner: actor._id, source: "manual", origin: { label: "Indicação da Mariana" }, touch: { kind: "manual", label: "Indicação da Mariana" }, consent: { given: true, channel: "manual", text: "Autorização informada pela equipe.", basis: "pediu proposta pelo WhatsApp" } }, actor);
  made.push(manual.contact);
  const stages = ["proposta", "ganhou", "em-conversa", "perdeu", "novo", "proposta", "ganhou", "em-conversa", "novo", "em-conversa", "proposta", "proposta"];
  const values = [997, 497, null, 497, null, 1497, 997, null, null, 497, 997, 1497];
  for (const [i, c] of made.entries()) {
    if (values[i] != null) await Contact.updateOne({ _id: c._id, organization: org }, { $set: { value: values[i] } });
    const fresh: any = await Contact.findOne({ _id: c._id, organization: org }).lean();
    if (stages[i] !== fresh.stage) await changeStage(org, fresh, stages[i], i % 2 ? seller : actor, { lostReason: stages[i] === "perdeu" ? "Achou caro, vai pensar no próximo mês" : undefined });
  }
  await logEvent(org, made[0]._id, "note", "Ligou perguntando se a mentoria tem acompanhamento individual. Mandar proposta com o plano anual.", null, actor);
  await createTask(org, made[0]._id, { title: "Mandar proposta do plano anual", dueAt: new Date(Date.now() + 20 * 3_600_000).toISOString() }, actor);
  await createTask(org, made[2]._id, { title: "Retornar no WhatsApp", dueAt: new Date(Date.now() - 3 * 3_600_000).toISOString() }, actor);
  await createTask(org, made[5]._id, { title: "Confirmar pagamento", dueAt: new Date(Date.now() + 2 * day).toISOString(), assignee: String(seller._id) }, actor);
  // um cadastro repetido (mesmo @ do direct) para mostrar o "Juntar"
  await Contact.create({ organization: org, name: "Ana Souza", username: "ana.souza", lead: true, leadAt: new Date(Date.now() - day), pipeline: pipe._id, stage: "novo", source: "manual", origin: { kind: "manual", label: "Evento presencial" }, firstTouch: { at: new Date(Date.now() - day), kind: "manual", label: "Evento presencial" }, lastTouch: { at: new Date(Date.now() - day), kind: "manual", label: "Evento presencial" } });
}

// Rastreamento: script do HDMOJ com pixel, integrações Hotmart/Kiwify e vendas ligadas aos leads
async function trackingDemo(org: Types.ObjectId, project: Types.ObjectId) {
  await Organization.updateOne({ _id: org }, { $set: { trackingEnabled: true, capiEnabled: true } });
  const site = await TrackingSite.create({ organization: org, project, name: "Site HDMOJ", key: "demo0hdmoj00site", domains: ["horademudarojogo.com.br"], pixelId: "1234567890123", capi: { enabled: true, accessToken: encrypt("EAAtoken-capi-de-demonstracao-000000000001"), initiateCheckout: true }, hits: 1843, lastHitAt: new Date(Date.now() - 20 * 60_000) });
  const camps: any[] = await AdObject.find({ organization: org, level: "campaign" }).lean();
  const hot = await SalesIntegration.create({ organization: org, provider: "hotmart", name: "Mentoria", key: "demohotmart00000000000000000000a", secret: encrypt("hottok-demo-123456"), project, events: 6, lastEventAt: new Date(Date.now() - 2 * 3_600_000) });
  await SalesIntegration.create({ organization: org, provider: "kiwify", name: "Ebook pago", key: "demokiwify000000000000000000000b", secret: encrypt("token-kiwify-demo"), project, events: 2, lastEventAt: new Date(Date.now() - 26 * 3_600_000) });
  const leads: any[] = await Contact.find({ organization: org, lead: true, email: { $ne: "" } }).sort({ createdAt: 1 }).limit(6).lean();
  const day = 86_400_000;
  const sales: [number, string, number, string][] = [[0, "PURCHASE_APPROVED", 997, "HP10001"], [1, "PURCHASE_APPROVED", 497, "HP10002"], [5, "PURCHASE_APPROVED", 1497, "HP10003"], [5, "PURCHASE_APPROVED", 997, "HP10004"], [1, "PURCHASE_REFUNDED", 497, "HP10002"], [2, "PURCHASE_OUT_OF_SHOPPING_CART", 997, "ab-demo-1"]];
  for (const [i, ev, value, tx] of sales) {
    const c = leads[i % leads.length];
    if (!c) continue;
    const vid = randomVid(i);
    const camp = camps[i % Math.max(1, camps.length)];
    await TrackVisitor.create({ organization: org, site: site._id, vid, contact: c._id, firstTouch: { at: new Date(Date.now() - (i + 3) * day), source: "facebook", campaign: camp?.name || "", campaignId: camp?.metaId || "", clickType: "fbclid", clickId: "IwAR-demo" }, lastTouch: { at: new Date(Date.now() - (i + 1) * day), source: "instagram", campaign: "stories" }, fbc: `fb.1.${Date.now()}.IwAR-demo`, fbp: `fb.1.${Date.now()}.12345`, pageViews: 3 + i, expiresAt: new Date(Date.now() + 395 * day) }).catch(() => null);
    const kind = ev === "PURCHASE_APPROVED" ? "approved" : ev === "PURCHASE_REFUNDED" ? "refunded" : "abandoned";
    await processSale("hotmart", (hot as any).toObject(), { externalId: kind === "abandoned" ? `abandono:${tx}` : tx, kind, providerEvent: ev, value, currency: "BRL", product: value > 900 ? "Mentoria Virada 90" : "Curso Rotina de Ouro", productId: "123", buyer: { email: c.email, phone: c.phone, name: c.name }, src: vid, params: {}, at: new Date(Date.now() - (i + 0.5) * day) } as any);
  }
}
const randomVid = (i: number) => `d${String(i).padStart(2, "0")}`.padEnd(24, "a1b2c3");

async function main() {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const password = await hashPassword(DEMO_PASSWORD);
  const user = (organization: Types.ObjectId, role: string, name: string, email: string, lastLoginAt?: Date) =>
    User.create({ organization, role, name, email, passwordHash: password, passwordSetAt: new Date(), lastLoginAt: lastLoginAt ?? null });

  // 1) A casa: Vínculo Digital (organização padrão) + administrador pelas envs
  const home = await ensureDefaultOrganization();
  console.log("Administrador:", await ensureAdmin({ force: true }));
  const hdmoj = await Project.create({ organization: home._id, name: "Hora de Mudar o Jogo", slug: "hora-de-mudar-o-jogo", color: "#f5c518", icon: "🔥", platforms: ["instagram", "tiktok"] });
  await Project.create({ organization: home._id, name: "Compre sem Moderação", slug: "compre-sem-moderacao", color: "#ec4899", icon: "🛍️", platforms: ["instagram"] });
  const r1 = await content(home._id, hdmoj._id, ["Reel: 3 hábitos de manhã", "Carrossel: checklist do sim", "Frase do dia", "Reel: recomeçar", "Carrossel: rotina de 20 min", "Reel: constância"], "IGAA-token-de-demonstracao-0001", 12512);

  // Tráfego (Meta simulada) e concorrentes (Business Discovery e YouTube simulados)
  const adAcc = await connectAdAccount(home._id, { project: String(hdmoj._id), adAccountId: "act_803239545032201", token: "EAAtoken-de-demonstracao-0000000000000001" });
  await syncAdAccount(home._id, adAcc._id, { days: 120 });
  await HouseCredential.create({ service: "youtube", credentials: { apiKey: encrypt("AIzaChaveDeDemonstracao00000000000000000") }, purposes: [] });
  const rivals = await Competitor.create([
    { organization: home._id, project: hdmoj._id, name: "Concorrente A", instagram: "concorrente_a", youtube: "@concorrentea", facebookPage: "Concorrente A Oficial", notes: "Posta Reels todo dia; puxa para a mentoria de R$ 997." },
    { organization: home._id, project: hdmoj._id, name: "Mentora B", instagram: "mentora_b", youtube: "@mentorab" },
    { organization: home._id, project: hdmoj._id, name: "Marca C", instagram: "marca_c", facebookPage: "123456789012345" },
  ]);
  for (const c of rivals) await refreshCompetitor(home._id, c);
  await automationsDemo(home._id, hdmoj._id);
  const adminUser: any = await User.findOne({ organization: home._id, role: "platform_admin" }).lean();
  const seller: any = await user(home._id, "member", "Júlia Vendas", "julia@vinculo.exemplo", new Date(Date.now() - 4 * 3_600_000));
  await crmDemo(home._id, adminUser, seller);
  await trackingDemo(home._id, hdmoj._id);
  if (adminUser) await seedOffers(home._id, adminUser._id);
  await HouseCredential.create({ service: "meta_ad_library", credentials: { token: encrypt("EAAtoken-da-casa-de-demonstracao-0000000000001") }, purposes: [] });
  await CompetitorProduct.create([
    { organization: home._id, project: hdmoj._id, competitor: rivals[0]._id, name: "Mentoria Virada 90", platform: "Hotmart", price: 997, promise: "Mudar de carreira em 90 dias", link: "https://exemplo.com/virada90" },
    { organization: home._id, project: hdmoj._id, competitor: rivals[1]._id, name: "Curso Rotina de Ouro", platform: "Kiwify", price: 197, promise: "Rotina produtiva em 21 dias" },
    { organization: home._id, project: hdmoj._id, competitor: rivals[2]._id, name: "E-book Primeiros Passos", platform: "site próprio", price: 27, promise: "Guia de bolso para recomeçar", notes: "Usa como isca para a lista de e-mail" },
  ]);

  // 2) Cliente com marca própria e dados diferentes
  const bella = await Organization.create({ name: "Studio Bella Forma", slug: "bella-forma", brand: { displayName: "Bella Forma", color: "#ec4899", logo: LOGO("B", "#ec4899") } });
  await user(bella._id, "owner", "Marina Duarte", "marina@bellaforma.exemplo", new Date(Date.now() - 3 * 3_600_000));
  await user(bella._id, "member", "Rafael Lima", "rafael@bellaforma.exemplo", new Date(Date.now() - 26 * 3_600_000));
  const pilates = await Project.create({ organization: bella._id, name: "Bella Forma Pilates", slug: "bella-forma-pilates", color: "#ec4899", icon: "🧘", platforms: ["instagram"] });
  const r2 = await content(bella._id, pilates._id, ["Reel: alongamento de 5 minutos", "Carrossel: 4 erros na postura", "Depoimento da aluna Ana", "Reel: aula experimental", "Carrossel: horários de novembro"], "IGAA-conta-bellaformapilates-01", 4380);
  await createInvite({ kind: "member", organization: bella._id, email: "recepcao@bellaforma.exemplo" });
  bella.publishEnabled = true; // este cliente está com a publicação automática ligada
  bella.offersEnabled = true; // e com o módulo Ofertas (vê a lista da casa)
  await bella.save();
  await flowPosts(bella._id, pilates._id, "Marina Duarte", "Rafael Lima");
  // na casa (chave desligada): um aprovado, para ver o aviso "publicação automática desligada"
  await flowPosts(home._id, hdmoj._id, "Administrador", "Equipe");

  // 3) Cliente que acabou de entrar: dono criado, nenhum projeto (primeira experiência)
  const padaria = await Organization.create({ name: "Padaria Pão Quente", slug: "pao-quente", brand: { displayName: "Pão Quente", color: "#f97316" } });
  await user(padaria._id, "owner", "Seu Jorge", "jorge@paoquente.exemplo");

  // 4) Cliente criado, aguardando o dono aceitar o convite
  const clinica = await Organization.create({ name: "Clínica Sorriso Certo", slug: "sorriso-certo", brand: { color: "#06b6d4" } });
  const invite = await createInvite({ kind: "owner", organization: clinica._id, email: "dra.paula@sorrisocerto.exemplo" });

  // 5) Cliente desativado
  const antiga = await Organization.create({ name: "Loja Antiga Modas", slug: "loja-antiga", active: false });
  await user(antiga._id, "owner", "Carla Nunes", "carla@lojaantiga.exemplo", new Date(Date.now() - 80 * 86_400_000));

  console.log(
    JSON.stringify({
      senhaDeTodos: DEMO_PASSWORD,
      admin: process.env.ADMIN_EMAIL,
      donaBella: "marina@bellaforma.exemplo",
      donoNovo: "jorge@paoquente.exemplo",
      convite: invite.path,
      sincronizados: [r1.media, r2.media],
    })
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
