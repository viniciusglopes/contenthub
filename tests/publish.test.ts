/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { MongoMemoryServer } from "mongodb-memory-server";
import sharp from "sharp";
import { setClock } from "@/lib/clock";
import { connectInstagram } from "@/lib/instagram/accounts";
import { setFetchOverride } from "@/lib/instagram/client";
import { runDue } from "@/lib/instagram/scheduler";
import { syncAccount } from "@/lib/instagram/sync";
import { cleanupOrphans } from "@/lib/media/store";
import AuditLog from "@/models/AuditLog";
import { InstagramMedia } from "@/models/InstagramMedia";
import MediaAsset from "@/models/MediaAsset";
import Organization from "@/models/Organization";
import Post from "@/models/Post";
import Project from "@/models/Project";
import { GET as mediaGET } from "@/app/api/media/[org]/[file]/route";
import { POST as publishDue } from "@/app/api/instagram/publish-due/route";
import { POST as publishNow } from "@/app/api/instagram/publish/route";
import { DELETE as postDELETE, PUT as postPUT } from "@/app/api/posts/[id]/route";
import { GET as flowGET, POST as flowPOST } from "@/app/api/posts/[id]/workflow/route";
import { GET as postsGET, POST as postsPOST } from "@/app/api/posts/route";
import { DELETE as uploadDELETE, PUT as uploadPUT } from "@/app/api/uploads/[id]/route";
import { GET as uploadsGET, POST as uploadsPOST } from "@/app/api/uploads/route";
import { PUT as adminOrgPUT } from "@/app/api/admin/organizations/[id]/route";
import { GET as meGET } from "@/app/api/me/route";
import { call, cookieFor, makeOrg, makeUser, setTestEnv } from "./helpers";
import { type MetaFake, image, metaFake, upload } from "./meta-fake";

// PUBLICAÇÃO AGENDADA, com a Meta SIMULADA (nenhuma chamada sai para a internet).
// O relógio é `clock`: os testes andam no tempo sem esperar.

const T0 = Date.parse("2026-10-14T12:00:00Z"); // 14/10/2026 09:00 em Brasília
let clock = T0;
const now = () => clock;
const MIN = 60_000;
const FIX = path.resolve(import.meta.dirname, "fixtures");

let mongo: MongoMemoryServer;
let meta: MetaFake;
let dir: string;
const w = {} as { A: any; B: any; admin: any; adminOrg: any };
const run = (extra: Record<string, unknown> = {}) => runDue({ sleep: async () => {}, ...extra });
const bearer = () => ({ authorization: `Bearer ${process.env.CRON_TOKEN}` });

async function side(tag: string) {
  const org = await makeOrg(`Cliente ${tag}`, `cliente-${tag}`, { publishEnabled: true });
  const owner = await makeUser(org._id, "owner", `dona@${tag}.test`);
  const member = await makeUser(org._id, "member", `membro@${tag}.test`);
  const project = await Project.create({ organization: org._id, name: `Projeto ${tag}`, slug: "projeto" });
  const account = await connectInstagram(org._id, { project: String(project._id), token: `IGAA-conta-${tag}oficial-000001` }, { now: T0 - 3_600_000 });
  return { org, owner, member, project, account, cookie: cookieFor(owner), memberCookie: cookieFor(member) };
}

/** Cria um post já com mídia. `when` = minutos a partir de agora (horário de Brasília calculado). */
async function makePost(s: any, opts: { format?: string; files?: Buffer[]; names?: string[]; when?: number; caption?: string; title?: string } = {}) {
  const at = new Date(clock + (opts.when ?? 30) * MIN - 3 * 3_600_000);
  const media: string[] = [];
  for (const [i, f] of (opts.files ?? [await image(1080, 1080)]).entries()) {
    const up = await upload(uploadsPOST, s.cookie, f, opts.names?.[i] ?? `arquivo-${i}.jpg`);
    expect(up.status, up.text).toBe(201);
    media.push(up.data._id);
  }
  const r = await call(postsPOST, {
    method: "POST", path: "/api/posts", cookie: s.memberCookie,
    body: { project: String(s.project._id), title: opts.title ?? "Post de teste", caption: opts.caption ?? "Legenda de teste", format: opts.format ?? "post", platforms: ["instagram"], scheduledDate: at.toISOString().slice(0, 10), scheduledTime: at.toISOString().slice(11, 16), media },
  });
  expect(r.status, r.text).toBe(201);
  return r.data;
}
const flow = (s: any, id: string, action: string, extra: Record<string, unknown> = {}, cookie?: string) =>
  call(flowPOST, { method: "POST", path: "/api/posts/x/workflow", params: { id }, cookie: cookie ?? s.cookie, body: { action, ...extra } });
/** Post aprovado para daqui a `when` minutos; o relógio já anda até a hora de sair. */
async function approved(s: any, opts: Parameters<typeof makePost>[1] = {}) {
  const post = await makePost(s, opts);
  const r = await flow(s, post._id, "approve");
  expect(r.status, r.text).toBe(200);
  clock += (opts?.when ?? 30) * MIN + MIN;
  return post._id as string;
}
const fresh = (id: string) => Post.collection.findOne({ _id: new mongoose.Types.ObjectId(id) }) as Promise<any>;

beforeAll(async () => {
  setTestEnv();
  dir = mkdtempSync(path.join(os.tmpdir(), "contenthub-midia-"));
  Object.assign(process.env, { MEDIA_DIR: dir, APP_URL: "https://contenthub.exemplo.test", IG_PUBLISH_ENABLED: "true" });
  meta = metaFake(now);
  setClock(now);
  setFetchOverride(meta.fetch);
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("publicacao"));
  w.adminOrg = await makeOrg("Vínculo Digital", "vinculo-digital");
  w.admin = await makeUser(w.adminOrg._id, "platform_admin", "admin@plataforma.test");
  w.A = await side("alfa");
  w.B = await side("beta");
});

afterAll(async () => {
  setFetchOverride(null);
  setClock(null);
  delete process.env.IG_PUBLISH_ENABLED;
  delete process.env.MEDIA_DIR;
  await mongoose.disconnect();
  await mongo.stop();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  clock += 3 * 86_400_000; // cada teste num dia novo: nada de um teste "vence" no outro
  process.env.IG_PUBLISH_ENABLED = "true";
  meta.errors = [];
  meta.videoPolls = 0;
  meta.quota = { used: 2, total: 50 };
  meta.publishCalls = 0;
  meta.createCalls = 0;
  meta.loseNextPublishResponse = false;
  meta.log.length = 0;
  // nada pendente de um teste para o outro
  for (const s of [w.A, w.B]) await Post.updateMany({ organization: s.org._id, status: { $in: ["scheduled", "publishing"] } }, { $set: { status: "draft" } });
});

describe("mídia: envio, conversão e arquivo público", () => {
  it("PNG e WebP viram JPEG sRGB; o tipo é conferido pelo conteúdo, não pelo nome", async () => {
    const png = await upload(uploadsPOST, w.A.cookie, await image(2000, 2000, "png"), "logo.png");
    expect(png.status).toBe(201);
    expect(png.data).toMatchObject({ kind: "image", width: 1440, height: 1440, problems: [] });
    expect(png.data.url).toMatch(new RegExp(`^/api/media/${w.A.org._id}/[a-f0-9]{48}\\.jpg$`));
    const file = path.join(dir, String(w.A.org._id), png.data.url.split("/").pop());
    const m = await sharp(file).metadata();
    expect([m.format, m.space, m.width]).toEqual(["jpeg", "srgb", 1440]);
    // WebP com nome de .jpg: aceito e convertido
    expect((await upload(uploadsPOST, w.A.cookie, await image(800, 800, "webp"), "foto.jpg")).status).toBe(201);
    // texto com nome de imagem, GIF e HEIC: recusados com mensagem clara
    const fake = await upload(uploadsPOST, w.A.cookie, Buffer.from("<html>não sou imagem</html>".repeat(4)), "foto.jpg");
    expect([fake.status, fake.data.error]).toEqual([415, expect.stringContaining("não é uma imagem nem um vídeo")]);
    expect((await upload(uploadsPOST, w.A.cookie, Buffer.from("GIF89a" + "0".repeat(40)), "anim.gif")).data.error).toContain("GIF");
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(40)]);
    expect((await upload(uploadsPOST, w.A.cookie, heic, "IMG_0001.HEIC")).data.error).toContain("HEIC");
    expect((await upload(uploadsPOST, w.A.cookie, Buffer.alloc(0), "vazio.jpg")).status).toBe(400);
    // nenhum arquivo temporário sobrou
    expect(readdirSync(path.join(dir, String(w.A.org._id))).filter((f) => f.startsWith(".envio"))).toEqual([]);
  });

  it("proporção fora do aceito: avisa e oferece recortar ou ajustar com fundo", async () => {
    const tall = await upload(uploadsPOST, w.A.cookie, await image(1080, 2400), "story.jpg");
    expect(tall.data.problems.map((p: any) => [p.code, p.level])).toEqual([["proporcao", "erro"]]);
    const crop = await call(uploadPUT, { method: "PUT", path: "/api/uploads/x", params: { id: tall.data._id }, cookie: w.A.cookie, body: { fit: "crop" } });
    expect(crop.data).toMatchObject({ width: 1080, height: 1350, problems: [], fit: "crop" });
    expect(crop.data.url).not.toBe(tall.data.url); // arquivo novo, nome novo
    expect(existsSync(path.join(dir, String(w.A.org._id), tall.data.url.split("/").pop()))).toBe(false);
    const wide = await upload(uploadsPOST, w.A.cookie, await image(2400, 600), "faixa.jpg", "&fit=pad");
    expect(wide.data).toMatchObject({ width: 1440, height: 754, problems: [], fit: "pad" });
    const small = await upload(uploadsPOST, w.A.cookie, await image(200, 200), "mini.jpg");
    expect(small.data).toMatchObject({ width: 320, problems: [{ code: "pequena", level: "aviso" }] });
  });

  it("vídeo: lê duração, codec e tamanho; fora do padrão vira lista de problemas", async () => {
    const okv = await upload(uploadsPOST, w.A.cookie, readFileSync(path.join(FIX, "reel-ok.mp4")), "reel.mp4");
    expect(okv.data).toMatchObject({ kind: "video", width: 180, height: 320, durationMs: 4000, problems: [] });
    expect(okv.data.url).toMatch(/\.mp4$/);
    const short = await upload(uploadsPOST, w.A.cookie, readFileSync(path.join(FIX, "reel-curto.mp4")), "curto.mp4");
    expect(short.data.problems).toEqual([expect.objectContaining({ code: "duracao", level: "erro" })]);
    const vp9 = await upload(uploadsPOST, w.A.cookie, readFileSync(path.join(FIX, "reel-vp9.mp4")), "vp9.mp4");
    expect(vp9.data.problems.map((p: any) => p.code)).toEqual(["codec_video", "moov"]);
    const mov = await upload(uploadsPOST, w.A.cookie, readFileSync(path.join(FIX, "video-deitado.mov")), "deitado.mov");
    expect(mov.data.url).toMatch(/\.mov$/);
    expect(mov.data.problems.every((p: any) => p.level === "aviso")).toBe(true);
    const broken = await upload(uploadsPOST, w.A.cookie, readFileSync(path.join(FIX, "reel-ok.mp4")).subarray(0, 600), "cortado.mp4");
    expect([broken.status, broken.data.error]).toEqual([400, expect.stringContaining("Não foi possível ler esse vídeo")]);
  });

  it("arquivo público: abre sem login, aceita Range, e não existe listagem nem caminho torto", async () => {
    const up = await upload(uploadsPOST, w.A.cookie, readFileSync(path.join(FIX, "reel-ok.mp4")), "reel.mp4");
    const [, , , org, file] = up.data.url.split("/");
    const get = (o: string, f: string, headers: Record<string, string> = {}) => mediaGET(new NextRequest(`http://localhost/api/media/${o}/${f}`, { headers }), { params: Promise.resolve({ org: o, file: f }) });
    const full = await get(org, file);
    expect([full.status, full.headers.get("content-type"), full.headers.get("accept-ranges"), full.headers.get("content-length")]).toEqual([200, "video/mp4", "bytes", String(up.data.bytes)]);
    expect(Buffer.from(await full.arrayBuffer()).equals(readFileSync(path.join(FIX, "reel-ok.mp4")))).toBe(true);
    const part = await get(org, file, { range: "bytes=100-199" });
    expect([part.status, part.headers.get("content-range"), (await part.arrayBuffer()).byteLength]).toEqual([206, `bytes 100-199/${up.data.bytes}`, 100]);
    const tail = await get(org, file, { range: "bytes=-50" });
    expect([tail.status, (await tail.arrayBuffer()).byteLength]).toEqual([206, 50]);
    expect((await get(org, file, { range: "bytes=99999999-" })).status).toBe(416);
    // o arquivo da ALFA pedido na pasta da BETA, caminhos tortos e "listagem": 404
    for (const [o, f] of [[String(w.B.org._id), file], [org, "../" + file], [org, ""], [org, "x.jpg"], ["..", file], [org, file.replace(".mp4", ".jpg")], [org, `%2e%2e%2f${file}`]])
      expect((await get(o, f)).status, `${o}/${f}`).toBe(404);
  });

  it("cota por organização, mídia órfã e apagar post apagam o arquivo", async () => {
    const before = (await call(uploadsGET, { path: "/api/uploads", cookie: w.B.cookie })).data;
    expect(before).toMatchObject({ usedBytes: 0, quotaBytes: 5 * 1024 ** 3 });
    const post = await makePost(w.B, { format: "carrossel", files: [await image(1080, 1080), await image(1080, 1080, "jpeg", "#0ea5e9")] });
    const files = post.media.map((m: any) => path.join(dir, String(w.B.org._id), m.url.split("/").pop()));
    expect(files.every((f: string) => existsSync(f))).toBe(true);
    expect((await call(uploadsGET, { path: "/api/uploads", cookie: w.B.cookie })).data.usedBytes).toBe(post.media[0].bytes + post.media[1].bytes);
    // tirar uma mídia do post e salvar apaga o arquivo dela
    const put = await call(postPUT, { method: "PUT", path: "/api/posts/x", params: { id: post._id }, cookie: w.B.cookie, body: { media: [post.media[1]._id] } });
    expect(put.data.media.map((m: any) => m._id)).toEqual([post.media[1]._id]);
    expect([existsSync(files[0]), existsSync(files[1])]).toEqual([false, true]);
    // mídia em uso não sai pela rota de upload; a solta sai
    expect((await call(uploadDELETE, { method: "DELETE", path: "/api/uploads/x", params: { id: post.media[1]._id }, cookie: w.B.cookie })).status).toBe(409);
    const loose = await upload(uploadsPOST, w.B.cookie, await image(600, 600));
    const loosePath = path.join(dir, String(w.B.org._id), loose.data.url.split("/").pop());
    // órfã: some depois de 24h (e só ela)
    expect(await cleanupOrphans(w.B.org._id, Date.now() + 23 * 3_600_000)).toBe(0);
    expect(await cleanupOrphans(w.B.org._id, Date.now() + 25 * 3_600_000)).toBe(1);
    expect([existsSync(loosePath), existsSync(files[1])]).toEqual([false, true]);
    // cota cheia: recusa com mensagem clara
    process.env.MEDIA_QUOTA_MB = "0.001";
    const full = await upload(uploadsPOST, w.B.cookie, await image(600, 600));
    delete process.env.MEDIA_QUOTA_MB;
    expect([full.status, full.data.error]).toEqual([413, expect.stringContaining("está cheio")]);
    // apagar o post apaga o arquivo e o registro
    expect((await call(postDELETE, { method: "DELETE", path: "/api/posts/x", params: { id: post._id }, cookie: w.B.cookie })).status).toBe(200);
    expect(existsSync(files[1])).toBe(false);
    expect(await MediaAsset.countDocuments({ organization: w.B.org._id })).toBe(0);
  });
});

describe("fluxo de aprovação", () => {
  it("membro pede, só o dono aprova; fica registrado quem aprovou e quando", async () => {
    const post = await makePost(w.A);
    expect(post.status).toBe("draft");
    // o navegador não consegue pular o fluxo mandando o status
    const forced = await call(postPUT, { method: "PUT", path: "/api/posts/x", params: { id: post._id }, cookie: w.A.memberCookie, body: { status: "scheduled" } });
    expect(forced.data.status).toBe("draft");
    expect((await flow(w.A, post._id, "approve", {}, w.A.memberCookie)).status).toBe(403);
    const req = await flow(w.A, post._id, "request", {}, w.A.memberCookie);
    expect(req.data.post.status).toBe("pending");
    // aparece na fila do dono
    const queue = await call(postsGET, { path: "/api/posts?fila=aprovacao", cookie: w.A.cookie });
    expect(queue.data.map((p: any) => p._id)).toContain(post._id);
    const ok = await flow(w.A, post._id, "approve");
    expect(ok.status).toBe(200);
    expect(ok.data.post).toMatchObject({ status: "scheduled", approval: { byName: "dona" } });
    expect(new Date(ok.data.post.publishAt).getTime()).toBe(Math.floor((clock + 30 * MIN) / MIN) * MIN);
    const log: any = await AuditLog.findOne({ action: "post.aprovado", target: post._id }).lean();
    expect([log.actorEmail, String(log.organization)]).toEqual(["dona@alfa.test", String(w.A.org._id)]);
    expect(ok.data.post.history.map((h: any) => h.type)).toEqual(["criado", "pedido", "aprovado"]);
    expect(ok.data.post.publish.lockId).toBeUndefined();
  });

  it("editar um post aprovado volta para aguardando aprovação; pedir ajuste volta para rascunho", async () => {
    const post = await makePost(w.A);
    await flow(w.A, post._id, "approve");
    // salvar sem mudar nada (o formulário manda todos os campos) não desfaz a aprovação
    const same = await call(postPUT, { method: "PUT", path: "/api/posts/x", params: { id: post._id }, cookie: w.A.memberCookie, body: { title: post.title, caption: post.caption, format: post.format, platforms: post.platforms, scheduledDate: post.scheduledDate.slice(0, 10), scheduledTime: post.scheduledTime, hashtags: [], media: post.media.map((m: any) => m._id), project: String(w.A.project._id) } });
    expect(same.data.status).toBe("scheduled");
    const edited = await call(postPUT, { method: "PUT", path: "/api/posts/x", params: { id: post._id }, cookie: w.A.memberCookie, body: { caption: "Legenda nova" } });
    expect(edited.data).toMatchObject({ status: "pending", publishAt: null, approval: { at: null, byName: "" } });
    expect(edited.data.history.at(-1).type).toBe("voltou_aprovacao");
    clock += 60 * MIN;
    expect((await run()).published).toBe(0); // não está mais aprovado: não sai
    expect((await flow(w.A, post._id, "adjust", { note: "Troca a foto" }, w.A.memberCookie)).status).toBe(403);
    const adj = await flow(w.A, post._id, "adjust", { note: "Troca a foto" });
    expect(adj.data.post).toMatchObject({ status: "draft", review: { note: "Troca a foto", noteByName: "dona" } });
    expect(await AuditLog.countDocuments({ action: "post.ajuste_pedido", target: post._id })).toBe(1);
  });

  it("antes de aprovar: lista clara do que falta", async () => {
    const at = new Date(clock - 3 * 3_600_000 - 60 * MIN); // uma hora atrás
    const r = await call(postsPOST, { method: "POST", path: "/api/posts", cookie: w.A.cookie, body: { project: String(w.A.project._id), title: "Incompleto", caption: "x".repeat(2300) + " " + Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" "), format: "carrossel", platforms: ["tiktok"], scheduledDate: at.toISOString().slice(0, 10), scheduledTime: at.toISOString().slice(11, 16) } });
    const view = await call(flowGET, { path: "/api/posts/x/workflow", params: { id: r.data._id }, cookie: w.A.cookie });
    const failed = Object.fromEntries(view.data.check.items.filter((i: any) => !i.ok).map((i: any) => [i.key, i.detail]));
    expect(Object.keys(failed).sort()).toEqual(["data", "legenda", "midia", "rede"]);
    expect(failed.midia).toContain("Falta enviar");
    expect(failed.legenda).toMatch(/2\.200 caracteres.*30 hashtags/);
    expect(failed.data).toContain("já passou");
    const no = await flow(w.A, r.data._id, "approve");
    expect([no.status, no.data.error]).toEqual([400, expect.stringContaining("Ainda não dá para aprovar. Falta:")]);

    // formato x mídia, mídia com problema, e conta sem permissão de publicar
    const tall = await makePost(w.A, { files: [await image(1080, 2400)] });
    expect((await flow(w.A, tall._id, "approve")).data.error).toContain("mais alta do que o Instagram aceita");
    const reelWithImage = await makePost(w.A, { format: "reel" });
    expect((await flow(w.A, reelWithImage._id, "approve")).data.error).toContain("Reel precisa de 1 vídeo");
    const one = await makePost(w.A, { format: "carrossel" });
    expect((await flow(w.A, one._id, "approve")).data.error).toContain("Carrossel precisa de 2 a 10 mídias (tem 1)");
    const story = await makePost(w.A, { format: "story" });
    expect((await flow(w.A, story._id, "approve")).data.error).toContain("ainda não é publicado automaticamente");

    const good = await makePost(w.A);
    await mongoose.models.SocialAccount.collection.updateOne({ _id: w.A.account._id }, { $set: { canPublish: null, canPublishCheckedAt: null } });
    meta.errors.push({ match: /content_publishing_limit/, times: 1, error: { code: 10, message: "Application does not have permission for this action" } });
    expect((await flow(w.A, good._id, "approve")).data.error).toContain("não tem permissão para publicar");
    await mongoose.models.SocialAccount.collection.updateOne({ _id: w.A.account._id }, { $set: { canPublish: null, canPublishCheckedAt: null } });
    expect((await flow(w.A, good._id, "approve")).status).toBe(200);
  });
});

describe("agendador com a Meta simulada", () => {
  it("imagem: sai na hora marcada, guarda id e link, e a Meta recebe o endereço público https", async () => {
    const id = await approved(w.A, { caption: "Bom dia", when: 30 });
    clock -= 10 * MIN; // ainda faltam 9 minutos
    expect((await run()).published).toBe(0);
    expect(meta.createCalls).toBe(0);
    clock += 10 * MIN;
    const r = await run();
    expect([r.published, r.failed, meta.publishCalls]).toEqual([1, 0, 1]);
    const post = await fresh(id);
    const mediaId = meta.published.at(-1)!.id;
    expect(post).toMatchObject({ status: "posted", externalIds: { instagram: mediaId, instagramPermalink: `https://www.instagram.com/p/TESTE${mediaId.slice(-4)}/` } });
    expect(post.history.at(-1).type).toBe("publicado");
    const container = meta.containers.get(meta.published.at(-1)!.creationId)!;
    expect(container.params.image_url).toMatch(new RegExp(`^https://contenthub\\.exemplo\\.test/api/media/${w.A.org._id}/[a-f0-9]{48}\\.jpg$`));
    expect(container.params.caption).toBe("Bom dia");
    expect(await AuditLog.countDocuments({ action: "post.publicado", target: id })).toBe(1);
    expect((await run()).published).toBe(0); // rodar de novo não republica
    expect(meta.publishCalls).toBe(1);
  });

  it("carrossel: um container por item e um do conjunto, na ordem", async () => {
    const id = await approved(w.A, { format: "carrossel", files: [await image(1080, 1350), await image(1080, 1350, "png"), await image(1080, 1350, "webp")] });
    expect((await run()).published).toBe(1);
    const parent = meta.containers.get(meta.published.at(-1)!.creationId)!;
    const kids = parent.params.children.split(",");
    expect([parent.params.media_type, kids.length, meta.createCalls]).toEqual(["CAROUSEL", 3, 4]);
    const post = await fresh(id);
    const assets = await MediaAsset.find({ organization: w.A.org._id, _id: { $in: post.media } }).lean<any[]>();
    expect(kids.map((k) => meta.containers.get(k)!.params.image_url.split("/").pop())).toEqual(post.media.map((m: any) => assets.find((a) => String(a._id) === String(m)).file));
    expect(kids.every((k) => meta.containers.get(k)!.params.is_carousel_item === "true" && !meta.containers.get(k)!.params.caption)).toBe(true);
  });

  it("reel: espera o Instagram processar e publica numa rodada seguinte, com UM container", async () => {
    meta.videoPolls = 6;
    const id = await approved(w.A, { format: "reel", files: [readFileSync(path.join(FIX, "reel-ok.mp4"))], names: ["reel.mp4"] });
    const first = await run();
    expect([first.published, first.waiting]).toEqual([0, 1]);
    let post = await fresh(id);
    expect([post.status, Boolean(post.publish.containerId), post.publish.waitNote]).toEqual(["scheduled", true, expect.stringContaining("processando")]);
    expect((await run()).waiting).toBe(0); // ainda não deu 1 minuto: nem consulta
    clock += MIN + 1000;
    expect((await run()).published).toBe(1);
    post = await fresh(id);
    expect([post.status, meta.createCalls, meta.publishCalls]).toEqual(["posted", 1, 1]);
    expect(meta.containers.get(meta.published.at(-1)!.creationId)!.params).toMatchObject({ media_type: "REELS", video_url: expect.stringMatching(/\.mp4$/) });
  });

  it("idempotência: duas rodadas ao mesmo tempo publicam uma vez só", async () => {
    const ids = [await approved(w.A, { when: 5 }), ...(await Promise.all([makePost(w.A, { when: -5 }), makePost(w.A, { when: -5 })])).map((p) => p._id)];
    for (const id of ids.slice(1)) await Post.updateOne({ _id: id, organization: w.A.org._id }, { $set: { status: "scheduled", publishAt: new Date(clock - MIN), "approval.at": new Date(), "publish.dueAt": new Date(clock - MIN) } });
    const reports = await Promise.all([run(), run(), run(), run()]);
    expect(reports.reduce((n, r) => n + r.published, 0)).toBe(3);
    expect([meta.publishCalls, meta.createCalls]).toEqual([3, 3]);
    for (const id of ids) expect((await fresh(id)).status).toBe("posted");
    expect(new Set(meta.published.slice(-3).map((p) => p.id)).size).toBe(3);
  });

  it("queda entre criar o container e publicar: a próxima rodada retoma sem duplicar", async () => {
    const id = await approved(w.A);
    await expect(run({ hook: (step: string) => { if (step === "after_container") throw new Error("processo morreu"); } })).rejects.toThrow("processo morreu");
    let post = await fresh(id);
    expect([post.status, Boolean(post.publish.containerId), meta.createCalls, meta.publishCalls]).toEqual(["publishing", true, 1, 0]);
    expect((await run()).published).toBe(0); // a trava ainda vale: ninguém mexe
    clock += 11 * MIN;
    expect((await run()).published).toBe(1);
    post = await fresh(id);
    expect([post.status, meta.createCalls, meta.publishCalls, post.publish.recoveries]).toEqual(["posted", 1, 1, 1]);
  });

  it("queda DEPOIS de publicar (id não gravado): a retomada acha o post no Instagram e não publica de novo", async () => {
    const id = await approved(w.A, { caption: "Legenda única da retomada" });
    await expect(run({ hook: (step: string) => { if (step === "after_publish") throw new Error("processo morreu"); } })).rejects.toThrow();
    expect([(await fresh(id)).status, meta.publishCalls]).toEqual(["publishing", 1]);
    clock += 11 * MIN;
    expect((await run()).published).toBe(1);
    const post = await fresh(id);
    expect([post.status, post.externalIds.instagram, meta.publishCalls]).toEqual(["posted", meta.published.at(-1)!.id, 1]);

    // resposta do publish perdida na rede: mesmo desfecho, pela nova tentativa
    const id2 = await approved(w.A, { caption: "Resposta perdida" });
    meta.publishCalls = 0;
    meta.loseNextPublishResponse = true;
    const r = await run();
    expect([r.published, r.waiting]).toEqual([0, 1]);
    clock += 2 * MIN + 1000;
    expect((await run()).published).toBe(1);
    expect([(await fresh(id2)).externalIds.instagram, meta.publishCalls]).toEqual([meta.published.at(-1)!.id, 1]);
  });

  it("limite de 24h lido da API: não publica, espera, e sai quando a cota libera", async () => {
    const id = await approved(w.A);
    meta.quota = { used: 50, total: 50 };
    const r = await run();
    expect([r.published, r.waiting, meta.createCalls, meta.publishCalls]).toEqual([0, 1, 0, 0]);
    let post = await fresh(id);
    expect([post.status, post.publish.waitNote]).toEqual(["scheduled", expect.stringContaining("Limite de publicações do Instagram atingido (50 de 50")]);
    clock += 31 * MIN;
    meta.quota.used = 49;
    expect((await run()).published).toBe(1);
    // cota cheia até passar a tolerância: perde o horário, não fica tentando para sempre
    const id2 = await approved(w.A);
    meta.quota = { used: 50, total: 50 };
    await run();
    clock += 31 * MIN;
    await run();
    clock += 31 * MIN;
    const last = await run();
    post = await fresh(id2);
    expect([last.missed, post.status, post.publish.lastError]).toEqual([1, "missed", expect.stringContaining("limite de publicações")]);
    // e o erro 2207042 da própria publicação é tratado como limite, não como falha
    const id3 = await approved(w.A);
    meta.quota = { used: 2, total: 50 };
    meta.errors.push({ match: /media_publish/, times: 1, error: { code: 9, error_subcode: 2207042, message: "You reached maximum number of posts" } });
    expect((await run()).waiting).toBe(1);
    expect((await fresh(id3)).status).toBe("scheduled");
  });

  it("atraso além da tolerância: não publica sozinho, marca 'perdeu o horário' e pede decisão", async () => {
    const id = await approved(w.A);
    clock += 61 * MIN; // o agendador ficou parado mais de uma hora
    const r = await run();
    expect([r.published, r.missed, meta.createCalls]).toEqual([0, 1, 0]);
    let post = await fresh(id);
    expect([post.status, post.publish.lastError]).toEqual(["missed", expect.stringMatching(/passou mais de 60 minutos do horário marcado.*Escolha publicar agora/)]);
    expect((await run()).published).toBe(0);
    // dentro da tolerância configurada sai normalmente
    const id2 = await approved(w.A);
    clock += 61 * MIN;
    expect((await run({ toleranceMin: 180 })).published).toBe(1);
    expect((await fresh(id2)).status).toBe("posted");
    // decisão do dono: "publicar agora" (membro não pode)
    expect((await flow(w.A, id, "retry", {}, w.A.memberCookie)).status).toBe(403);
    expect((await flow(w.A, id, "retry")).data.post.status).toBe("scheduled");
    clock += MIN;
    expect((await run()).published).toBe(1);
    post = await fresh(id);
    expect(post.history.map((h: any) => h.type).slice(-3)).toEqual(["perdeu", "tentar_de_novo", "publicado"]);
  });

  it("erro permanente: falha na hora com a mensagem traduzida, sem insistir", async () => {
    const id = await approved(w.A);
    meta.errors.push({ match: /\/media$/, method: "POST", times: 5, error: { code: 36003, error_subcode: 2207009, message: "The submitted image with aspect ratio cannot be published" } });
    const r = await run();
    expect([r.failed, meta.publishCalls]).toEqual([1, 0]);
    const post = await fresh(id);
    expect([post.status, post.publish.lastError, post.publish.attempts]).toEqual(["failed", expect.stringContaining("recusou a proporção da imagem"), 0]);
    clock += 60 * MIN;
    const calls = meta.log.length;
    await run();
    expect(meta.log.length).toBe(calls); // falhou: o agendador não toca mais nele
    // token vencido também é permanente
    const id2 = await approved(w.A);
    meta.errors = [{ match: /content_publishing_limit/, times: 1, error: { code: 190, message: "Error validating access token" } }];
    await run();
    expect((await fresh(id2)).publish.lastError).toContain("token não é válido");
    // "tentar de novo" pelo dono, com o erro resolvido
    meta.errors = [];
    expect((await flow(w.A, id, "retry")).status).toBe(200);
    expect((await run()).published).toBe(1);
  });

  it("erro temporário: no máximo 2 novas tentativas, espaçadas; depois falha e para", async () => {
    const id = await approved(w.A);
    meta.errors.push({ match: /\/media$/, method: "POST", times: 99, error: { code: 2, message: "An unexpected error has occurred. Please retry your request later." }, status: 500 });
    expect((await run()).waiting).toBe(1);
    let post = await fresh(id);
    expect([post.status, post.publish.attempts, new Date(post.publish.nextAttemptAt).getTime() - clock]).toEqual(["scheduled", 1, 2 * MIN]);
    clock += MIN;
    await run(); // ainda não é hora da nova tentativa
    expect(meta.log.filter((l) => l.startsWith("POST")).length).toBe(1);
    clock += MIN + 1000;
    await run();
    post = await fresh(id);
    expect([post.publish.attempts, new Date(post.publish.nextAttemptAt).getTime() - clock]).toEqual([2, 10 * MIN]);
    clock += 10 * MIN + 1000;
    const last = await run();
    post = await fresh(id);
    expect([last.failed, post.status, post.publish.lastError]).toEqual([1, "failed", expect.stringMatching(/instável.*Tentei 3 vezes e parei/)]);
    expect(meta.log.filter((l) => l.startsWith("POST")).length).toBe(3);
    clock += 60 * MIN;
    await run();
    expect(meta.log.filter((l) => l.startsWith("POST")).length).toBe(3);

    // erro temporário que passa: publica na nova tentativa
    meta.log.length = 0;
    const id2 = await approved(w.A);
    meta.errors = [{ match: /media_publish/, times: 1, error: { code: -1, error_subcode: 2207001, message: "Instagram server error" } }];
    expect((await run()).waiting).toBe(1);
    clock += 2 * MIN + 1000;
    expect((await run()).published).toBe(1);
    expect([(await fresh(id2)).status, meta.createCalls]).toEqual(["posted", 1]); // o container do post é um só, reaproveitado na nova tentativa
  });

  it("depois de publicar, a sincronização de métricas casa o post pelo id", async () => {
    const id = await approved(w.A);
    meta.nextMediaId = "1800000000000103"; // um id que a Meta simulada devolve na lista de mídias
    expect((await run()).published).toBe(1);
    const sync = await syncAccount(w.A.org._id, String(w.A.account._id), { now: clock });
    expect(sync.ok).toBe(true);
    const media: any = await InstagramMedia.findOne({ organization: w.A.org._id, igId: "1800000000000103" }).lean();
    expect(String(media.post)).toBe(id);
  });
});

describe("chaves de publicação e isolamento", () => {
  it("chave geral desligada: a rota do agendador responde 'desligado' e não toca em nada", async () => {
    const id = await approved(w.A);
    delete process.env.IG_PUBLISH_ENABLED;
    const calls = meta.log.length;
    const r = await call(publishDue, { method: "POST", path: "/api/instagram/publish-due", headers: bearer() });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ enabled: false, published: 0, organizations: [], message: expect.stringContaining("desligada") });
    expect([meta.log.length, (await fresh(id)).status]).toEqual([calls, "scheduled"]);
    // a tela é avisada
    const me = await call(meGET, { path: "/api/me", cookie: w.A.cookie });
    expect(me.data.publishing).toMatchObject({ on: false, global: false, org: true, message: expect.stringContaining("Publicação automática desligada para esta conta") });
    // "publicar agora" também não passa
    const direct = await call(publishNow, { method: "POST", path: "/api/instagram/publish", cookie: w.A.cookie, body: { postId: id } });
    expect([direct.status, direct.data.error]).toEqual([403, expect.stringContaining("Nada foi publicado")]);
    expect(meta.log.length).toBe(calls);
  });

  it("chave da organização: só o administrador liga; desligada, só aquela organização fica de fora", async () => {
    const a = await approved(w.A, { when: 5 });
    const post = await makePost(w.B, { when: -1 });
    await Post.updateOne({ _id: post._id, organization: w.B.org._id }, { $set: { status: "scheduled", publishAt: new Date(clock - MIN), "approval.at": new Date(), "publish.dueAt": new Date(clock - MIN) } });
    // dono não liga a própria chave; administrador desliga a da ALFA
    expect((await call(adminOrgPUT, { method: "PUT", path: "/api/admin/organizations/x", params: { id: String(w.A.org._id) }, cookie: w.A.cookie, body: { publishEnabled: true } })).status).toBe(404);
    const off = await call(adminOrgPUT, { method: "PUT", path: "/api/admin/organizations/x", params: { id: String(w.A.org._id) }, cookie: cookieFor(w.admin), body: { publishEnabled: false } });
    expect(off.data.publishEnabled).toBe(false);
    expect(await AuditLog.countDocuments({ action: "cliente.publicacao_desligada", organization: w.A.org._id })).toBe(1);
    const r = await call(publishDue, { method: "POST", path: "/api/instagram/publish-due", headers: bearer() });
    expect(r.data).toMatchObject({ enabled: true, published: 1, skippedOrganizations: 2 }); // ALFA e a do administrador (nunca ligada)
    expect(r.data.organizations.map((o: any) => o.name)).toEqual(["Cliente beta"]);
    expect([(await fresh(a)).status, (await fresh(post._id)).status]).toEqual(["scheduled", "posted"]);
    const view = await call(flowGET, { path: "/api/posts/x/workflow", params: { id: a }, cookie: w.A.cookie });
    expect(view.data.publishing).toMatchObject({ on: false, org: false, global: true });
    await Organization.updateOne({ _id: w.A.org._id }, { $set: { publishEnabled: true } });
    // organização nova nasce com a chave desligada
    expect((await makeOrg("Nova", "nova")).publishEnabled).toBe(false);
  });

  it("o agendador só entra com o token de rotina: login (nem de administrador) não serve", async () => {
    for (const headers of [{}, { authorization: "Bearer errado" }] as Record<string, string>[])
      expect((await call(publishDue, { method: "POST", path: "/api/instagram/publish-due", headers })).status).toBe(401);
    for (const u of [w.A.owner, w.admin])
      expect((await call(publishDue, { method: "POST", path: "/api/instagram/publish-due", cookie: cookieFor(u) })).status).toBe(401);
  });

  it("isolamento: a BETA não aprova, não publica, não vê nem apaga post e mídia da ALFA", async () => {
    const post = await makePost(w.A);
    await flow(w.A, post._id, "request", {}, w.A.memberCookie);
    const assetId = post.media[0]._id;
    const file = path.join(dir, String(w.A.org._id), post.media[0].url.split("/").pop());
    const before = JSON.stringify([await fresh(post._id), await MediaAsset.collection.findOne({ _id: new mongoose.Types.ObjectId(assetId) })]);
    const b = w.B.cookie;
    const p = { id: post._id };
    for (const action of ["approve", "request", "adjust", "draft", "retry", "mark_posted"])
      expect((await flow(w.B, post._id, action, {}, b)).status, action).toBe(404);
    expect((await call(flowGET, { path: "/api/posts/x/workflow", params: p, cookie: b })).status).toBe(404);
    expect((await call(publishNow, { method: "POST", path: "/api/instagram/publish", cookie: b, body: { postId: post._id } })).status).toBe(404);
    expect((await call(postDELETE, { method: "DELETE", path: "/api/posts/x", params: p, cookie: b })).status).toBe(404);
    expect((await call(uploadDELETE, { method: "DELETE", path: "/api/uploads/x", params: { id: assetId }, cookie: b })).status).toBe(404);
    expect((await call(uploadPUT, { method: "PUT", path: "/api/uploads/x", params: { id: assetId }, cookie: b, body: { fit: "crop" } })).status).toBe(404);
    // usar a mídia da ALFA num post da BETA (novo ou existente): recusado, e nada da BETA fica pela metade
    const count = await Post.countDocuments({ organization: w.B.org._id });
    const steal = await call(postsPOST, { method: "POST", path: "/api/posts", cookie: b, body: { project: String(w.B.project._id), title: "Roubo", format: "post", platforms: ["instagram"], scheduledDate: "2026-12-01", scheduledTime: "09:00", media: [assetId] } });
    expect(steal.status).toBe(404);
    expect(await Post.countDocuments({ organization: w.B.org._id })).toBe(count);
    const mine = await makePost(w.B);
    expect((await call(postPUT, { method: "PUT", path: "/api/posts/x", params: { id: mine._id }, cookie: b, body: { media: [assetId] } })).status).toBe(404);
    // a fila e o espaço usado da BETA não mostram nada da ALFA
    const queue = await call(postsGET, { path: "/api/posts?fila=aprovacao", cookie: b });
    expect(queue.text).not.toContain(post._id);
    expect(JSON.stringify([await fresh(post._id), await MediaAsset.collection.findOne({ _id: new mongoose.Types.ObjectId(assetId) })])).toBe(before);
    expect(existsSync(file)).toBe(true);
    // e a mídia de um post da ALFA só pode ser reaproveitada em outro post da própria ALFA se estiver solta
    const other = await call(postsPOST, { method: "POST", path: "/api/posts", cookie: w.A.cookie, body: { project: String(w.A.project._id), title: "Outro", format: "post", platforms: ["instagram"], scheduledDate: "2026-12-01", scheduledTime: "09:00", media: [assetId] } });
    expect(other.status).toBe(409);
  });
});
