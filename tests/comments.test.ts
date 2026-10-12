/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { type Category, type Classification } from "@/lib/comments/classify";
import { LLM_ADAPTERS, type LlmProvider, chainClassifier, classifyWithChain, parseLlmOutput } from "@/lib/comments/llm";
import { classifyText, rulesClassifier } from "@/lib/comments/rules";
import { buildCommentsReport, buildStudy, gapMessage, groupQuestions } from "@/lib/comments/study";
import { connectInstagram } from "@/lib/instagram/accounts";
import { type FetchLike, InstagramClient, setFetchOverride } from "@/lib/instagram/client";
import { gapOf, loadComments, syncComments } from "@/lib/instagram/comments";
import { mockFetch } from "@/lib/instagram/mock";
import { syncAccount } from "@/lib/instagram/sync";
import AuditLog from "@/models/AuditLog";
import InstagramComment from "@/models/InstagramComment";
import { InstagramMedia } from "@/models/InstagramMedia";
import Organization from "@/models/Organization";
import Project from "@/models/Project";
import { PUT as adminOrgPUT } from "@/app/api/admin/organizations/[id]/route";
import { POST as replyPOST } from "@/app/api/instagram/comments/[id]/reply/route";
import { GET as commentsGET } from "@/app/api/instagram/comments/route";
import { GET as studyGET } from "@/app/api/instagram/comments/study/route";
import { POST as commentsSyncPOST } from "@/app/api/instagram/comments/sync/route";
import { GET as reportGET } from "@/app/api/instagram/report/route";
import { DELETE as accountDELETE } from "@/app/api/social-accounts/[id]/route";
import { call, cookieFor, makeOrg, makeUser, setTestEnv } from "./helpers";

// COMENTÁRIOS com a Meta SIMULADA: nenhuma chamada sai para a internet.

const NOW = Date.parse("2026-10-12T15:00:00Z");
const M1 = "1800000000000100"; // mídias que o simulador de sempre devolve
const M2 = "1800000000000101";
const M3 = "1800000000000102";

interface FakeComment { id: string; text: string; username: string; timestamp: string; like_count?: number; hidden?: boolean; replies?: FakeComment[] }
interface Fake { fetch: FetchLike; data: Record<string, FakeComment[]>; log: string[]; posts: { path: string; message: string }[]; fail: { match: RegExp; code: number; times: number } | null }

/** Meta de mentira para comentários: 50 por página, mais novos primeiro, respostas por expansão (até 50) e o resto em /replies. */
function commentsFake(): Fake {
  const base = mockFetch(() => NOW);
  const f: Fake = { fetch: null as any, data: {}, log: [], posts: [], fail: null };
  const page = (all: any[], params: URLSearchParams) => {
    const start = Number(params.get("after") || 0);
    const size = Math.min(Number(params.get("limit") || 50), 50);
    const slice = all.slice(start, start + size);
    const more = start + size < all.length;
    return { slice, paging: slice.length ? { cursors: { after: String(start + size) }, ...(more ? { next: "tem-mais" } : {}) } : undefined };
  };
  f.fetch = async (url, init) => {
    const u = new URL(url);
    const method = init?.method || "GET";
    const params = init?.body ? new URLSearchParams(init.body) : u.searchParams;
    const path = u.pathname.replace(/^\/v\d+\.\d+/, "");
    f.log.push(`${method} ${path}`);
    if (f.fail && f.fail.times > 0 && f.fail.match.test(path)) {
      f.fail.times--;
      return { ok: false, status: 400, json: async () => ({ error: { code: f.fail!.code, message: "erro simulado", type: "OAuthException" } }) };
    }
    let m = /^\/(\d+)\/comments$/.exec(path);
    if (m && method === "GET") {
      const all = [...(f.data[m[1]] || [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      const { slice, paging } = page(all, params);
      const expand = (params.get("fields") || "").includes("replies");
      return {
        ok: true, status: 200,
        json: async () => ({
          data: slice.map(({ replies, ...c }) => {
            if (!expand || !replies?.length) return c;
            const first = replies.slice(0, 50).map((r: FakeComment) => ({ ...r, parent_id: c.id }));
            return { ...c, replies: { data: first, ...(replies.length > 50 ? { paging: { cursors: { after: "50" }, next: "tem-mais" } } : {}) } };
          }),
          ...(paging ? { paging } : {}),
        }),
      };
    }
    m = /^\/(\d+)\/replies$/.exec(path);
    if (m && method === "GET") {
      const parent = Object.values(f.data).flat().find((c) => c.id === m![1]);
      const { slice, paging } = page(parent?.replies || [], params);
      return { ok: true, status: 200, json: async () => ({ data: slice, ...(paging ? { paging } : {}) }) };
    }
    if (m && method === "POST") {
      f.posts.push({ path, message: params.get("message") || "" });
      return { ok: true, status: 200, json: async () => ({ id: `1799${String(f.posts.length).padStart(8, "0")}` }) };
    }
    return base(url, init);
  };
  return f;
}

const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const c = (id: string, text: string, username: string, minutesAgo: number, replies?: FakeComment[]): FakeComment => ({ id, text, username, timestamp: at(minutesAgo), like_count: 1, replies });

let mongo: MongoMemoryServer;
let fake: Fake;
const w = {} as { A: any; B: any; admin: any };

async function side(tag: string) {
  const org = await makeOrg(`Cliente ${tag}`, `cliente-${tag}`);
  const owner = await makeUser(org._id, "owner", `dona@${tag}.test`);
  const project = await Project.create({ organization: org._id, name: `Projeto ${tag}`, slug: "projeto" });
  const account = await connectInstagram(org._id, { project: String(project._id), token: `IGAA-conta-${tag}oficial-000001` }, { now: NOW - 3_600_000 });
  await syncAccount(org._id, String(account._id), { now: NOW - 1_800_000 }); // primeira = histórico: não busca comentários
  return { org, owner, project, account, cookie: cookieFor(owner), username: `${tag}oficial` };
}
const setReported = (s: any, igId: string, n: number) => InstagramMedia.updateOne({ organization: s.org._id, account: s.account._id, igId }, { $set: { "metrics.comments": n } });
const countDocs = (s: any, q: Record<string, unknown> = {}) => InstagramComment.countDocuments({ organization: s.org._id, ...q });

beforeAll(async () => {
  setTestEnv();
  delete process.env.IG_COMMENT_REPLY_ENABLED;
  fake = commentsFake();
  setFetchOverride(fake.fetch);
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("comentarios"));
  const adminOrg = await makeOrg("Vínculo Digital", "vinculo-digital");
  w.admin = await makeUser(adminOrg._id, "platform_admin", "admin@plataforma.test");
  w.A = await side("alfa");
  w.B = await side("beta");
});
afterAll(async () => {
  setFetchOverride(null);
  delete process.env.IG_COMMENT_REPLY_ENABLED;
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(() => {
  fake.log.length = 0;
  fake.posts.length = 0;
  fake.fail = null;
});

describe("cliente da Meta: paginação e respostas aninhadas", () => {
  it("percorre todas as páginas (50 por vez) e busca em /replies o que não coube na expansão", async () => {
    const many: FakeComment[] = Array.from({ length: 120 }, (_, i) => c(`900${i}`, `comentário ${i}`, `pessoa${i % 7}`, 500 - i));
    many[3].replies = Array.from({ length: 70 }, (_, k) => c(`9003r${k}`, `resposta ${k}`, k === 0 ? "alfaoficial" : `amigo${k}`, 400 - k));
    many[5].replies = [c("9005r0", "obrigada!", "alfaoficial", 300)];
    fake.data[M1] = many;
    const api = new InstagramClient("IGAA-conta-alfaoficial-000001", fake.fetch);
    const r = await api.listComments(M1);
    expect(r.complete).toBe(true);
    expect(r.pages).toBe(3);
    expect(r.items).toHaveLength(120);
    expect(r.items.find((i) => i.id === "9003")!.allReplies).toHaveLength(70);
    expect(r.items.find((i) => i.id === "9005")!.allReplies).toHaveLength(1);
    expect(new Set(r.items.map((i) => i.id)).size).toBe(120);
    expect(fake.log.filter((l) => l === `GET /${M1}/comments`)).toHaveLength(3);
    expect(fake.log.filter((l) => l === "GET /9003/replies")).toHaveLength(1);
    expect(fake.log.some((l) => l.startsWith("POST"))).toBe(false);
  });

  it("teto de chamadas: para, diz que não terminou e não apaga nada", async () => {
    const api = new InstagramClient("IGAA-conta-alfaoficial-000001", fake.fetch);
    let left = 2;
    const r = await api.listComments(M1, { budget: () => left-- });
    expect(r.complete).toBe(false);
    expect(r.stopped).toBe("chamadas");
    expect(r.items.length).toBeLessThan(120);
  });

  it("se a Meta recusar um campo, tenta de novo com o conjunto mínimo", async () => {
    fake.fail = { match: /\/comments$/, code: 100, times: 1 };
    const r = await new InstagramClient("IGAA-conta-alfaoficial-000001", fake.fetch).listComments(M1);
    expect(r.items).toHaveLength(120);
  });
});

describe("sincronização de comentários", () => {
  it("grava comentários e respostas, marca os da conta e quem já foi respondido; rodar de novo não duplica", async () => {
    await setReported(w.A, M1, 191);
    const r1 = await syncComments(w.A.org._id, String(w.A.account._id), { mediaIgId: M1 }, { now: NOW });
    expect(r1).toMatchObject({ ok: true, medias: 1, checked: 1, reported: 191, fetched: 191, added: 191, removed: 0, stopped: "" });
    expect(await countDocs(w.A)).toBe(191);
    expect(await countDocs(w.A, { parentIgId: null })).toBe(120);
    expect(await countDocs(w.A, { parentIgId: "9003" })).toBe(70);
    expect(await countDocs(w.A, { own: true })).toBe(2);
    const answered = await InstagramComment.find({ organization: w.A.org._id, answered: true }).lean<any[]>();
    expect(answered.map((a) => a.igId).sort()).toEqual(["9003", "9005"]);
    expect(answered.find((a) => a.igId === "9005").answeredAt.toISOString()).toBe(at(300));
    // só o necessário: nada de id de usuário, foto ou perfil de quem comentou
    const one: any = await InstagramComment.collection.findOne({ igId: "9000" });
    expect(Object.keys(one).sort()).toEqual(["__v", "_id", "account", "answered", "answeredAt", "cls", "createdAt", "hidden", "igId", "likeCount", "mediaIgId", "organization", "own", "parentIgId", "project", "sentBy", "sentByName", "text", "timestamp", "updatedAt", "username"].sort());

    const r2 = await syncComments(w.A.org._id, String(w.A.account._id), { mediaIgId: M1 }, { now: NOW + 60_000 });
    expect(r2).toMatchObject({ ok: true, fetched: 191, added: 0, removed: 0 });
    expect(await countDocs(w.A)).toBe(191);
    // nada foi escrito no Instagram e nada caiu na outra organização
    expect(fake.log.some((l) => l.startsWith("POST"))).toBe(false);
    expect(await countDocs(w.B)).toBe(0);
  });

  it("comentário apagado no Instagram sai daqui na próxima busca completa", async () => {
    fake.data[M1] = fake.data[M1].filter((x) => x.id !== "9007");
    const r = await syncComments(w.A.org._id, String(w.A.account._id), { mediaIgId: M1 }, { now: NOW + 120_000 });
    expect(r.removed).toBe(1);
    expect(await countDocs(w.A, { igId: "9007" })).toBe(0);
    expect(await countDocs(w.A)).toBe(190);
  });

  it("o Instagram informa 10 e libera 0: registra a diferença e a tela recebe o aviso honesto", async () => {
    await setReported(w.A, M2, 10);
    fake.data[M2] = [];
    const r = await call(commentsSyncPOST, { method: "POST", path: "/api/instagram/comments/sync", cookie: w.A.cookie, body: { account: String(w.A.account._id), media: M2 } });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ ok: true, reported: 10, fetched: 0, added: 0 });
    const media: any = await InstagramMedia.findOne({ organization: w.A.org._id, igId: M2 }).lean();
    expect(media.commentsSync).toMatchObject({ reported: 10, fetched: 0, complete: true, error: "" });
    const panel = await call(commentsGET, { path: `/api/instagram/comments?media=${M2}`, cookie: w.A.cookie });
    expect(panel.status).toBe(200);
    expect(panel.data.comments).toEqual([]);
    expect(panel.data.gap).toMatchObject({ show: true, reported: 10, fetched: 0 });
    expect(panel.data.gap.message).toBe("O Instagram informou 10 comentários, mas só liberou 0 para o aplicativo. Enquanto o aplicativo não é aprovado pela Meta, só aparecem comentários de contas de teste.");
    expect(panel.data.reply.on).toBe(false);
    // mídia ainda não conferida: sem aviso de diferença, mas aparece como pendente de busca
    await setReported(w.A, M3, 4);
    expect(gapOf([(await InstagramMedia.findOne({ organization: w.A.org._id, igId: M3 }).lean()) as any])).toMatchObject({ reported: 0, fetched: 0, pendingMedia: 1, checkedMedia: 0 });
  });

  it("mídia que o Instagram diz ter 0 comentários não gasta chamada", async () => {
    await setReported(w.A, M3, 0);
    const r = await syncComments(w.A.org._id, String(w.A.account._id), { mediaIgId: M3 }, { now: NOW });
    expect(r).toMatchObject({ ok: true, checked: 1, calls: 0 });
    expect(fake.log).toEqual([]);
  });

  it("token sem a permissão de comentários: erro claro, nada apagado", async () => {
    fake.fail = { match: /\/comments$/, code: 10, times: 5 };
    const r = await syncComments(w.A.org._id, String(w.A.account._id), { mediaIgId: M1 }, { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/instagram_business_manage_comments/);
    expect(await countDocs(w.A)).toBe(190);
  });

  it("busca do período respeita o teto de chamadas e diz onde parou", async () => {
    const r = await syncComments(w.A.org._id, String(w.A.account._id), { from: "2026-09-01", to: "2026-10-12" }, { now: NOW, maxCalls: 3 });
    expect(r.ok).toBe(true);
    expect(r.calls).toBeLessThanOrEqual(3);
    expect(r.stopped).toMatch(/teto de segurança de 3 chamadas/);
    expect(r.checked).toBeLessThan(r.medias);
  });

  it("a sincronização normal da conta traz os comentários dos posts recentes; a de histórico não", async () => {
    const r = await syncAccount(w.B.org._id, String(w.B.account._id), { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.history).toBe(false);
    expect(r.comments).toMatchObject({ error: "" });
    expect(r.comments!.medias).toBeGreaterThan(5);
    expect(r.comments!.fetched).toBe(190); // a mídia M1 do simulador de comentários é a mesma para as duas contas
    expect(await countDocs(w.B)).toBe(190);
    const h = await syncAccount(w.B.org._id, String(w.B.account._id), { now: NOW, history: true, maxCalls: 400 });
    expect(h.comments).toBeNull();
  });

  it("desconectar a conta apaga os comentários dela (e só os dela)", async () => {
    const before = await countDocs(w.A);
    const r = await call(accountDELETE, { method: "DELETE", path: "/api/social-accounts/x", params: { id: String(w.B.account._id) }, cookie: w.B.cookie });
    expect(r.status).toBe(200);
    expect(r.data.commentsDeleted).toBe(190);
    expect(await countDocs(w.B)).toBe(0);
    expect(await countDocs(w.A)).toBe(before);
    w.B = await side("gama");
  });
});

describe("classificador por regras (português informal)", () => {
  const cases: [string, Category, Partial<Classification>?][] = [
    ["quanto custa?", "preco", { isQuestion: true }],
    ["valor?", "preco"],
    ["Qual o valor da consulta", "preco"],
    ["me passa o orçamento pfv", "preco"],
    ["qto fica?", "preco"],
    ["manda no direct", "intencao"],
    ["Quero!! como eu compro?", "intencao"],
    ["como faço pra agendar?", "intencao"],
    ["tem vaga essa semana?", "intencao"],
    ["passa o whats", "intencao"],
    ["@carol.mendes olha isso", "marcacao", { isQuestion: false }],
    ["@ju_santos @bia.rocha vamos?", "marcacao"],
    ["@maria 😍", "marcacao"],
    ["@drwaldirlopes atende sábado?", "duvida", { isQuestion: true }],
    ["😍😍😍", "elogio", { sentiment: "positivo" }],
    ["🔥", "elogio"],
    ["👏👏👏👏", "elogio"],
    ["😡", "reclamacao", { sentiment: "negativo" }],
    ["😂😂", "outro"],
    ["Liiiiindo demais", "elogio"],
    ["amei", "elogio", { sentiment: "positivo" }],
    ["Parabéns pelo trabalho!", "elogio"],
    ["top", "elogio"],
    ["Ótimo atendimento, só que não", "reclamacao", { sentiment: "negativo" }],
    ["Parabéns hein, 3 dias esperando resposta", "reclamacao"],
    ["Que maravilha, mandei mensagem e até agora nada", "reclamacao"],
    ["péssimo atendimento, não recomendo", "reclamacao"],
    ["ninguém responde o direct", "reclamacao"],
    ["Muito caro", "objecao", { sentiment: "negativo" }],
    ["será que funciona mesmo?", "objecao"],
    ["tenho medo de fazer", "objecao"],
    ["Dói?", "duvida"],
    ["onde fica a clínica", "duvida", { isQuestion: true }],
    ["Serve pra criança?", "duvida"],
    ["quanto tempo dura o efeito?", "duvida"],
    ["Ganhe dinheiro trabalhando de casa, link na minha bio", "spam"],
    ["sdv", "spam"],
    ["confira www.site-qualquer.com", "spam"],
    ["kkkkk eu todinha", "outro"],
    ["", "outro"],
  ];
  it(`classifica ${cases.length} exemplos`, async () => {
    const wrong = cases.filter(([text, cat]) => classifyText(text).category !== cat).map(([text, cat]) => `"${text}" => ${classifyText(text).category} (esperado ${cat})`);
    expect(wrong).toEqual([]);
    for (const [text, , extra] of cases) if (extra) expect(classifyText(text), text).toMatchObject(extra);
    const viaInterface = await rulesClassifier.classify(cases.map(([text], i) => ({ id: String(i), text })));
    expect(viaInterface.map((x) => x.category)).toEqual(cases.map(([, cat]) => cat));
    expect(viaInterface.every((x) => x.provider === "regras-v1")).toBe(true);
    expect(rulesClassifier.label).toMatch(/automática simples/);
  });
});

describe("estudo e relatório", () => {
  const mk = (i: number, text: string, username: string, minutesAgo: number, extra: Record<string, unknown> = {}) => ({
    igId: `s${i}`, mediaIgId: M1, parentIgId: null, username, text, timestamp: at(minutesAgo), likeCount: 0, own: false, answered: false, answeredAt: null, cls: classifyText(text), ...extra,
  });
  const sample = [
    mk(1, "quanto custa?", "ana", 600, { answered: true, answeredAt: at(540) }),
    mk(2, "valor?", "bia", 590),
    mk(3, "Qual o valor do clareamento?", "ana", 580, { answered: true, answeredAt: at(400) }),
    mk(4, "Dói muito?", "caio", 570),
    mk(5, "dói pra fazer o clareamento?", "duda", 560),
    mk(6, "amei o resultado do clareamento 😍", "bia", 550),
    mk(7, "muito caro", "edu", 540),
    mk(8, "@fulana olha", "ana", 530),
    mk(9, "sdv", "spammer", 520),
    mk(10, "como agendar?", "gabi", 510),
    mk(11, "Te chamei no direct", "alfaoficial", 540, { own: true, parentIgId: "s1", cls: classifyText("Te chamei no direct") }),
  ] as any[];

  it("conta por classificação, sentimento, perguntas agrupadas, termos, quem mais comenta, sem resposta e tempo médio", () => {
    const s = buildStudy(sample);
    expect(s.total).toBe(10);
    expect(s.ownReplies).toBe(1);
    expect(s.people).toBe(7);
    const cat = Object.fromEntries(s.byCategory.map((x) => [x.key, x.count]));
    expect(cat).toEqual({ preco: 3, duvida: 2, elogio: 1, objecao: 1, marcacao: 1, spam: 1, intencao: 1 });
    expect(s.sentiment).toEqual({ positivo: 1, neutro: 8, negativo: 1 });
    expect(s.questions[0]).toMatchObject({ theme: "preco", count: 3, unanswered: 1 });
    expect(s.questions.find((q) => q.theme === "dor")).toMatchObject({ count: 2, unanswered: 2 });
    expect(s.terms[0]).toEqual({ term: "clareamento", count: 3 });
    expect(s.commenters[0]).toEqual({ username: "ana", count: 3 });
    expect(s.unanswered).toMatchObject({ total: 7, important: 5 }); // fora o spam; importantes = preço, dúvida, objeção, intenção
    expect(s.response).toMatchObject({ answered: 2, avgMinutes: 120, medianMinutes: 120 });
    expect(s.bestHours.length).toBeGreaterThan(0);
    expect(s.ideas.join(" ")).toMatch(/valor/);
    expect(s.simple).toBe(true);
    expect(groupQuestions([mk(20, "vocês fazem lente de contato?", "x", 1), mk(21, "fazem lente de contato dental?", "y", 2), mk(22, "tem estacionamento?", "z", 3)] as any)[0].count).toBe(2);
  });

  it("relatório em texto plano, sem markdown, com o aviso de comentários não liberados", () => {
    const text = buildCommentsReport({ username: "alfaoficial", scope: "Posts publicados de 13/09 a 12/10", study: buildStudy(sample), gap: { reported: 40, fetched: 11, pendingMedia: 2, checkedMedia: 3, lastSyncAt: null }, posts: 5 });
    expect(text).toContain("COMENTÁRIOS @alfaoficial");
    expect(text).toContain(gapMessage({ reported: 40, fetched: 11 }));
    expect(text).toContain("PERGUNTAS QUE MAIS SE REPETEM");
    expect(text).toContain("Tempo médio de resposta: 2h");
    expect(text).toContain("IDEIAS DE POST A PARTIR DAS DÚVIDAS");
    expect(text).toContain("Classificação automática simples");
    expect(text).not.toMatch(/[*_#`]|\*\*|—/);
    const empty = buildCommentsReport({ username: "x", scope: "Post", study: buildStudy([]), gap: { reported: 10, fetched: 0, pendingMedia: 0, checkedMedia: 1, lastSyncAt: null } });
    expect(empty).toContain("só liberou 0");
    expect(empty).toContain("Nenhum comentário disponível para estudar ainda.");
  });

  it("rotas: painel do post, estudo do período e relatório tipo=comentarios", async () => {
    fake.data[M1] = [
      c("700", "Quanto custa?", "ana.cliente", 300, [c("700r", "Te chamei no direct", "alfaoficial", 240)]),
      c("701", "valor?", "bia.cliente", 200),
      c("702", "Amei 😍", "caio.cliente", 100),
    ];
    await setReported(w.A, M1, 9);
    await syncComments(w.A.org._id, String(w.A.account._id), { mediaIgId: M1 }, { now: NOW });
    const panel = await call(commentsGET, { path: `/api/instagram/comments?media=${M1}`, cookie: w.A.cookie });
    expect(panel.data.comments.map((x: any) => [x.igId, x.parentIgId, x.own, x.answered, x.cls.category])).toEqual([
      ["700", null, false, true, "preco"], ["700r", "700", true, false, "outro"], ["701", null, false, false, "preco"], ["702", null, false, false, "elogio"],
    ]);
    expect(panel.data.gap).toMatchObject({ show: true, reported: 9, fetched: 4 });
    expect(panel.data.study).toMatchObject({ total: 3, simple: true });
    expect(panel.data.study.response.avgMinutes).toBe(60);
    expect(panel.data.media.permalink).toMatch(/^https:\/\/www\.instagram\.com\//);
    expect(JSON.stringify(panel.data)).not.toMatch(/accessToken|enc:v1/);

    const study = await call(studyGET, { path: `/api/instagram/comments/study?project=${w.A.project._id}&dias=90`, cookie: w.A.cookie });
    expect(study.status).toBe(200);
    expect(study.data.study.total).toBe(3);
    expect(study.data.gap.show).toBe(true);
    expect(study.data.posts.find((p: any) => p.igId === M1)).toMatchObject({ reported: 9, fetched: 4, unanswered: 2 });
    expect(study.data.posts.find((p: any) => p.igId === M2)).toMatchObject({ reported: 10, fetched: 0 });
    expect(study.data.report).toContain("O Instagram informou 19 comentários, mas só liberou 4 para o aplicativo.");
    const bad = await call(studyGET, { path: `/api/instagram/comments/study?project=${w.A.project._id}&de=2026-13-01`, cookie: w.A.cookie });
    expect(bad.status).toBe(400);

    const report = await call(reportGET, { path: `/api/instagram/report?tipo=comentarios&dias=90&project=${w.A.project._id}`, cookie: w.A.cookie });
    expect(report.data.tipo).toBe("comentarios");
    expect(report.data.reports[0].text).toBe(study.data.report);
    // os outros tipos seguem como eram
    const old = await call(reportGET, { path: `/api/instagram/report?dias=30&project=${w.A.project._id}`, cookie: w.A.cookie });
    expect(old.data.tipo).toBe("periodo");
    expect(old.data.reports[0].text).not.toContain("COMENTÁRIOS @");
    // o outro cliente não enxerga nada disso
    const other = await call(studyGET, { path: `/api/instagram/comments/study?account=${w.A.account._id}&dias=90`, cookie: w.B.cookie });
    expect(other.data.study.total).toBe(0);
    expect(other.data.account.username).toBe("gamaoficial");
    expect(await loadComments(w.B.org._id, w.A.account._id)).toEqual([]);
  });
});

describe("responder comentário: duas chaves, desligadas por padrão", () => {
  const reply = (cookie: string, id: string, body: Record<string, unknown>) => call(replyPOST, { method: "POST", path: "/api/instagram/comments/x/reply", params: { id }, cookie, body });
  const target = () => InstagramComment.findOne({ organization: w.A.org._id, igId: "701" }).lean<any>();
  const posts = () => fake.log.filter((l) => l.startsWith("POST"));

  it("chave desligada: 403 e NADA é enviado ao Instagram", async () => {
    const t = await target();
    const r = await reply(w.A.cookie, String(t._id), { message: "Olá!", confirm: true });
    expect(r.status).toBe(403);
    expect(r.data.error).toMatch(/desligado.*Nada foi enviado/);
    // só a chave do servidor, ou só a do cliente: continua sem enviar
    process.env.IG_COMMENT_REPLY_ENABLED = "true";
    expect((await reply(w.A.cookie, String(t._id), { message: "Olá!", confirm: true })).status).toBe(403);
    delete process.env.IG_COMMENT_REPLY_ENABLED;
    await Organization.updateOne({ _id: w.A.org._id }, { $set: { commentReplyEnabled: true } });
    expect((await reply(w.A.cookie, String(t._id), { message: "Olá!", confirm: true })).status).toBe(403);
    await Organization.updateOne({ _id: w.A.org._id }, { $set: { commentReplyEnabled: false } });
    expect(posts()).toEqual([]);
    expect(fake.posts).toEqual([]);
    expect(await countDocs(w.A, { sentByName: { $ne: "" } })).toBe(0);
  });

  it("só o administrador da plataforma liga a chave do cliente (e fica registrado)", async () => {
    const asOwner = await call(adminOrgPUT, { method: "PUT", path: "/api/admin/organizations/x", params: { id: String(w.A.org._id) }, cookie: w.A.cookie, body: { commentReplyEnabled: true } });
    expect(asOwner.status).toBe(404);
    expect((await Organization.findById(w.A.org._id).lean<any>()).commentReplyEnabled).toBe(false);
    const asAdmin = await call(adminOrgPUT, { method: "PUT", path: "/api/admin/organizations/x", params: { id: String(w.A.org._id) }, cookie: cookieFor(w.admin), body: { commentReplyEnabled: true } });
    expect(asAdmin.data.commentReplyEnabled).toBe(true);
    expect(await AuditLog.countDocuments({ action: "cliente.resposta_comentario_ligada", organization: w.A.org._id })).toBe(1);
  });

  it("com as duas chaves: exige confirmação, envia UMA vez, registra quem respondeu e não alcança outro cliente", async () => {
    process.env.IG_COMMENT_REPLY_ENABLED = "true";
    const t = await target();
    expect((await reply(w.A.cookie, String(t._id), { message: "Olá!" })).status).toBe(409);
    expect((await reply(w.A.cookie, String(t._id), { message: "   ", confirm: true })).status).toBe(400);
    expect((await reply(w.A.cookie, String(t._id), { message: "x".repeat(1001), confirm: true })).status).toBe(400);
    // o outro cliente (com a chave dele desligada ou ligada) nunca responde comentário da ALFA
    expect((await reply(w.B.cookie, String(t._id), { message: "invadido", confirm: true })).status).toBe(403);
    await Organization.updateOne({ _id: w.B.org._id }, { $set: { commentReplyEnabled: true } });
    expect((await reply(w.B.cookie, String(t._id), { message: "invadido", confirm: true })).status).toBe(404);
    expect(fake.posts).toEqual([]);

    const ok = await reply(w.A.cookie, String(t._id), { message: "Te chamei no direct!", confirm: true });
    expect(ok.status).toBe(201);
    expect(fake.posts).toEqual([{ path: "/701/replies", message: "Te chamei no direct!" }]);
    const saved: any = await InstagramComment.findOne({ organization: w.A.org._id, igId: ok.data.igId }).lean();
    expect(saved).toMatchObject({ parentIgId: "701", own: true, sentByName: "dona", text: "Te chamei no direct!", username: "alfaoficial" });
    expect(String(saved.sentBy)).toBe(String(w.A.owner._id));
    expect((await target()).answered).toBe(true);
    const log: any = await AuditLog.findOne({ action: "comentario.respondido", organization: w.A.org._id }).lean();
    expect(log.actorEmail).toBe("dona@alfa.test");
    expect(JSON.stringify(log.meta)).not.toContain("Te chamei"); // o registro não copia o texto
    delete process.env.IG_COMMENT_REPLY_ENABLED;
  });
});

describe("classificação por IA: contrato e cadeia com fallback (nenhuma API é chamada)", () => {
  const items = [{ id: "a", text: "quanto custa?" }, { id: "b", text: "amei" }];
  const good = { items: [{ id: "a", category: "preco", sentiment: "neutro", isQuestion: true }, { id: "b", category: "elogio", sentiment: "positivo", isQuestion: false }] };
  const provider = (id: string, callFn: LlmProvider["call"]): LlmProvider => ({ id, apiKey: `chave-${id}`, call: callFn });

  it("não existe adaptador HTTP registrado nesta entrega", () => {
    expect(Object.keys(LLM_ADAPTERS)).toEqual([]);
  });

  it("primeiro falha, segundo responde; o terceiro nem é chamado", async () => {
    const third = vi.fn(async () => good);
    const r = await classifyWithChain([provider("um", async () => { throw new Error("401 da API"); }), provider("dois", async () => JSON.stringify(good)), provider("tres", third)], items);
    expect(r.attempts.map((x) => [x.provider, x.ok])).toEqual([["um", false], ["dois", true]]);
    expect(r.result!.map((x) => [x.category, x.provider])).toEqual([["preco", "ia:dois"], ["elogio", "ia:dois"]]);
    expect(third).not.toHaveBeenCalled();
  });

  it("estourou o tempo ou devolveu fora do schema: vai para o próximo", async () => {
    const seen: string[] = [];
    const slow = provider("lento", (req) => new Promise((resolve) => { seen.push(req.user); setTimeout(() => resolve(good), 500); }));
    const junk = provider("lixo", async () => ({ items: [{ id: "a", category: "inventada", sentiment: "neutro", isQuestion: true }, good.items[1]] }));
    const short = provider("curto", async () => ({ items: [good.items[0]] }));
    const r = await classifyWithChain([slow, junk, short, provider("bom", async () => good)], items, { timeoutMs: 30 });
    expect(r.attempts.map((x) => [x.provider, x.ok, x.error ?? ""])).toEqual([["lento", false, "tempo esgotado"], ["lixo", false, "item a fora do schema"], ["curto", false, "quantidade de itens diferente da pedida"], ["bom", true, ""]]);
    // o que vai para o provedor: id e texto; nunca o @ de quem comentou
    expect(JSON.parse(seen[0])).toEqual({ comentarios: [{ id: "a", texto: "quanto custa?" }, { id: "b", texto: "amei" }] });
    expect(() => parseLlmOutput("não é json", items, "x")).toThrow();
  });

  it("todos falharam: a mesma interface cai nas regras", async () => {
    const net = vi.spyOn(globalThis, "fetch");
    const chain = chainClassifier([provider("um", async () => { throw new Error("fora do ar"); })], rulesClassifier, { timeoutMs: 30 });
    const out = await chain.classify(items);
    expect(out.map((x) => [x.category, x.provider])).toEqual([["preco", "regras-v1"], ["elogio", "regras-v1"]]);
    expect(net).not.toHaveBeenCalled();
    net.mockRestore();
  });
});
