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
