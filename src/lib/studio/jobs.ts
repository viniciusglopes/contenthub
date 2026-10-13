import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Types } from "mongoose";
import { nowMs } from "@/lib/clock";
import { FriendlyError } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import { probeVideo, videoProblems } from "@/lib/media/mp4";
import { newName, orgDir } from "@/lib/media/store";
import MediaAsset from "@/models/MediaAsset";
import StudioJob from "@/models/StudioJob";
import { clipSeconds, costUsd, modelSpec } from "./catalog";
import { type Cred, resolveChain, runChain } from "./chain";
import { settings } from "./cost";
import { assertQuota, runEngine } from "./engine";
import { type SceneBuild, assembleReel, probe } from "./ffmpeg";
import { engineKit, kitBlockers, kitText, loadKit } from "./kit";
import { IMAGE, VIDEO, VOICE, downloadVideo } from "./providers";
import { type ReelScript, captionChunks, finalCaption, imagePrompt, readSeconds, validateReel } from "./script";
import { sectorOf } from "./sectors";
import { createDraft, sceneSeconds, speechSeconds } from "./studio";

/* eslint-disable @typescript-eslint/no-explicit-any */

// FILA DE TRABALHOS DO ESTÚDIO (Reels). Persistente no banco:
//  - cada trabalho é pego com trava atômica (findOneAndUpdate com o estado de partida no filtro);
//  - quem está trabalhando renova a trava a cada 20 s; trava parada há mais de STALE_MS = o
//    servidor caiu no meio: o trabalho é retomado (conta como tentativa), reaproveitando o que
//    já foi pago (narração, imagens e pedidos de vídeo ficam em `state` e na pasta do trabalho);
//  - limite de trabalhos simultâneos global e por organização; tempo máximo por trabalho;
//  - vídeo de IA é assíncrono: o trabalho fica "waiting" e volta à fila para consultar o provedor.
// Quem processa: o laço interno do servidor (src/instrumentation.ts) e/ou a rota
// POST /api/estudio/worker (CRON_TOKEN), que chamam drain().

export const STALE_MS = 90_000;
const BEAT_MS = 20_000;
const POLL_MS = 10_000;
const WORKER = `${process.pid}-${randomBytes(4).toString("hex")}`;
const cross = { crossOrg: true };

class Stop extends Error {} // o trabalho deixou de ser nosso (cancelado ou retomado por outro)
class Waiting extends Error {} // esperando o provedor de vídeo

export function publicJob(j: any) {
  return {
    _id: String(j._id), project: String(j.project), kind: j.kind, status: j.status, title: j.title, progress: j.progress, step: j.step, attempts: j.attempts, error: j.error,
    estimateUsd: j.estimateUsd, spentUsd: j.spentUsd, providers: j.providers || [], post: j.post ? String(j.post) : null, seen: Boolean(j.seen),
    createdAt: j.createdAt, startedAt: j.startedAt, finishedAt: j.finishedAt, createdByName: j.createdByName, seconds: j.state?.seconds ?? null,
  };
}

const workDir = (job: any) => path.join(orgDir(job.organization), `.trabalho-${job._id}`);

async function finish(job: any, lock: string, set: Record<string, unknown>): Promise<void> {
  await StudioJob.updateOne({ _id: job._id, organization: job.organization, lockId: lock }, { $set: { ...set, lockId: "", lockedAt: null, finishedAt: new Date(nowMs()), runAfter: null } });
  await rm(workDir(job), { recursive: true, force: true });
}

/** Processa UM trabalho já travado por nós. Nunca lança. */
async function work(job: any, lock: string): Promise<void> {
  const org: Types.ObjectId = job.organization;
  const mine = { _id: job._id, organization: org, lockId: lock, status: "running" };
  const st: any = { voice: {}, image: {}, video: {}, ...(job.state || {}) };
  const beat = setInterval(() => void StudioJob.updateOne(mine, { $set: { lockedAt: new Date() } }).catch(() => {}), BEAT_MS);
  const mark = async (progress: number, step: string) => {
    const r = await StudioJob.updateOne(mine, { $set: { progress: Math.round(progress), step, state: st, lockedAt: new Date() } });
    if (!r.matchedCount) throw new Stop();
    if (job.deadlineAt && nowMs() > new Date(job.deadlineAt).getTime()) throw new FriendlyError("O trabalho passou do tempo máximo e foi encerrado. Gere de novo; se repetir, avise o suporte.", 504);
  };
  try {
    const dir = workDir(job);
    await mkdir(dir, { recursive: true });
    const { kit, logoFile } = await loadKit(org, job.project);
    const sector = sectorOf(kit.sector);
    const script: ReelScript = validateReel(job.input.script, sector);
    const n = script.cenas.length;
    const chainCtx = { org, job: job._id, project: job.project, by: job.createdByName };
    const used = new Set<string>(job.providers || []);
    await mark(3, "Preparando");

    // 1) narração (uma por cena; o que já foi pago fica guardado)
    if (job.input.voz) {
      for (const [i, c] of script.cenas.entries()) {
        if (!c.narracao || st.voice[i]) continue;
        const { result, cred } = await runChain({ ...chainCtx, purpose: "voz", what: `narração da cena ${i + 1}`, timeoutMs: 60_000 }, async (k, signal, meter) => {
          const r = await VOICE[k.service](k, c.narracao, signal);
          meter.add(c.narracao.length, "caracteres", costUsd(modelSpec(k.service, "voz", k.model), { chars: c.narracao.length }));
          const file = path.join(dir, `voz_${i}.${r.ext}`);
          await writeFile(file, r.audio);
          if (!(await probe(file).then((p) => p.hasAudio && p.duration > 0.2, () => false))) throw new Error("áudio ilegível");
          return path.basename(file);
        });
        st.voice[i] = result;
        used.add(`voz:${cred.service}`);
        await mark(5 + (20 * (i + 1)) / n, `Narração ${i + 1} de ${n}`);
      }
    }

    // 2) imagem de cada cena: enviada pelo usuário, gerada por IA (se pedido) ou nenhuma (cena só com texto)
    const images: (string | null)[] = [];
    for (const [i, c] of script.cenas.entries()) {
      if (c.imagem) {
        const a: any = await MediaAsset.findOne({ organization: org, _id: c.imagem, kind: "image" }).lean();
        if (!a) throw new FriendlyError(`A imagem da cena ${i + 1} não existe mais. Envie de novo.`, 409);
        images.push(path.join(orgDir(org), a.file));
      } else if (job.kind === "reel_montado" && job.input.imagensIA && c.prompt_visual) {
        if (!st.image[i]) {
          const { result, cred } = await runChain({ ...chainCtx, purpose: "imagem", what: `imagem da cena ${i + 1}`, timeoutMs: 120_000 }, async (k, signal, meter) => {
            const buf = await IMAGE[k.service](k, imagePrompt(kitText(kit), sector, c.prompt_visual!), signal);
            meter.add(1, "imagens", costUsd(modelSpec(k.service, "imagem", k.model), { images: 1 }));
            const file = path.join(dir, `imagem_${i}.jpg`);
            await sharp(buf, { limitInputPixels: 60_000_000 }).rotate().flatten({ background: "#000000" }).jpeg({ quality: 90 }).toFile(file); // lança se não for imagem
            return path.basename(file);
          });
          st.image[i] = result;
          used.add(`imagem:${cred.service}`);
          await mark(25 + (15 * (i + 1)) / n, `Imagem ${i + 1} de ${n}`);
        }
        images.push(path.join(dir, st.image[i]));
      } else images.push(null);
    }

    // tempos: com voz, a cena dura a fala; sem voz, o tempo de leitura das legendas
    const voiceSecs: (number | null)[] = [];
    for (let i = 0; i < n; i++) voiceSecs.push(st.voice[i] ? (await probe(path.join(dir, st.voice[i]))).duration : null);
    const durations = script.cenas.map((c, i) => sceneSeconds(c.narracao, voiceSecs[i]));

    // 3) vídeo de IA: pede, espera (o trabalho volta à fila) e baixa
    if (job.kind === "reel_ia") {
      for (const [i, c] of script.cenas.entries()) {
        if (st.video[i]) continue;
        const { result } = await runChain({ ...chainCtx, purpose: "video", what: `vídeo da cena ${i + 1}`, timeoutMs: 60_000 }, async (k, signal, meter) => {
          const spec = modelSpec(k.service, "video", k.model);
          const seconds = clipSeconds(spec, st.voice[i] ? durations[i] : Math.max(durations[i], speechSeconds(c.narracao)));
          const r = await VIDEO[k.service].submit(k, { prompt: imagePrompt(kitText(kit), sector, c.prompt_visual || c.titulo).replace("Fotografia vertical 9:16 para fundo de vídeo", "Vídeo vertical 9:16, movimento de câmera lento"), seconds }, signal);
          // o provedor cobra pelo pedido aceito: o custo estimado entra aqui
          meter.add(seconds, "segundos", costUsd(spec, { seconds }));
          return { service: k.service, model: k.model, house: k.house, id: r.id, seconds, file: "" };
        });
        st.video[i] = result;
        used.add(`video:${result.service}`);
        await StudioJob.updateOne(mine, { $set: { providers: [...used] } });
        await mark(30 + (10 * (i + 1)) / n, `Vídeo ${i + 1} de ${n} pedido`);
      }
      let pending = 0;
      const creds: Cred[] = await resolveChain(org, "video");
      for (let i = 0; i < n; i++) {
        const v = st.video[i];
        if (v.file) continue;
        const k = creds.find((c) => c.service === v.service && c.house === v.house);
        if (!k) throw new FriendlyError("A chave do provedor de vídeo foi removida com o trabalho em andamento.", 409);
        const r = await VIDEO[v.service].poll({ ...k, model: v.model }, v.id, AbortSignal.timeout(30_000));
        if (r.state === "failed") throw new FriendlyError(`O provedor de vídeo não entregou a cena ${i + 1}: ${r.error || "sem motivo informado"}. Ajuste a descrição do visual e gere de novo.`, 502);
        if (r.state === "pending") { pending++; continue; }
        const file = path.join(dir, `clipe_${i}.mp4`);
        await writeFile(file, await downloadVideo(k, r.url!, AbortSignal.timeout(120_000)));
        if (!(await probe(file).then((p) => p.hasVideo, () => false))) throw new FriendlyError(`O vídeo da cena ${i + 1} veio ilegível do provedor.`, 502);
        v.file = path.basename(file);
        await mark(40 + (30 * (i + 1 - pending)) / n, `Vídeo ${i + 1} de ${n} pronto`);
      }
      if (pending) {
        const r = await StudioJob.updateOne(mine, { $set: { status: "waiting", state: st, step: `Aguardando o provedor de vídeo (${n - pending} de ${n} cenas prontas)`, progress: Math.round(40 + (30 * (n - pending)) / n), runAfter: new Date(nowMs() + POLL_MS), lockId: "", lockedAt: null } });
        if (!r.matchedCount) throw new Stop();
        throw new Waiting();
      }
    }

    // 4) camadas de texto (motor de arte) e montagem (ffmpeg)
    await mark(72, "Desenhando os textos");
    const cenas = script.cenas.map((c, i) => ({
      tipo: c.tipo, kicker: c.kicker, titulo: c.titulo, acao: c.acao, legendas: captionChunks(c.narracao),
      fundo: job.kind === "reel_ia" ? { tipo: "video" } : images[i] ? { tipo: "foto", arquivo: images[i] } : { tipo: "cor" },
    }));
    const layers = await runEngine({ op: "reel", kit: engineKit(kit, logoFile), cenas, saida: path.join(dir, "camadas") }, 240_000);
    const scenes: SceneBuild[] = layers.cenas.map((l: any, i: number) => {
      const chunks: string[] = cenas[i].legendas;
      const total = chunks.reduce((s, c) => s + c.length, 0) || 1;
      const span = voiceSecs[i] ?? chunks.reduce((s, c) => s + readSeconds(c), 0);
      let t = voiceSecs[i] ? 0.15 : 0.35;
      const legendas = l.legendas.map((leg: any, j: number) => {
        const d = voiceSecs[i] ? (span * chunks[j].length) / total : readSeconds(chunks[j]);
        const out = { arquivo: leg.arquivo, caixa: leg.caixa, start: t, end: Math.min(durations[i], t + d - 0.04) };
        t += d;
        return out;
      });
      return { fundo: l.fundo, clip: job.kind === "reel_ia" ? path.join(dir, st.video[i].file) : null, veu: l.veu, fixo: l.fixo, titulo: l.titulo, legendas, duration: durations[i], voice: st.voice[i] ? path.join(dir, st.voice[i]) : null };
    });
    let music: string | null = null;
    if (job.input.trilha) {
      const a: any = await MediaAsset.findOne({ organization: org, _id: job.input.trilha, kind: "audio" }).lean();
      if (a) music = path.join(orgDir(org), a.file);
    }
    await assertQuota(org);
    const out = path.join(dir, "reel.mp4");
    const info = await assembleReel({ work: dir, scenes, out, music, onProgress: (d, t) => mark(74 + (22 * d) / t, `Montando a cena ${d} de ${t}`) });
    st.seconds = Math.round(info.duration * 10) / 10;
    st.captions = scenes.reduce((s, c) => s + c.legendas.length, 0);

    // 5) guarda o vídeo como mídia da organização e cria o RASCUNHO (nada é publicado sem aprovação)
    await mark(97, "Guardando o vídeo");
    const file = newName("mp4");
    const final = path.join(orgDir(org), file);
    await rename(out, final);
    const bytes = (await stat(final)).size;
    const meta = await probeVideo(final);
    const asset: any = await MediaAsset.create({ organization: org, kind: "video", file, mime: "video/mp4", bytes, width: meta.width, height: meta.height, durationMs: meta.durationMs, fps: meta.fps, videoCodec: meta.videoCodec, audioCodec: meta.audioCodec, originalName: "estudio-reel.mp4", originalFormat: "mp4", problems: videoProblems(meta, bytes), createdBy: job.createdBy });
    let post: any;
    try {
      post = await createDraft({ org, name: job.createdByName || "Estúdio" }, job.project, {
        title: script.cenas[0].titulo, format: "reel", caption: finalCaption(script, kitText(kit), sector), hashtags: script.hashtags,
        content: script.cenas.map((c, i) => `Cena ${i + 1}: ${c.titulo.replace(/\*/g, "")}${c.narracao ? `\n${c.narracao}` : ""}`).join("\n\n"),
        notes: `Gerado no Estúdio (${job.kind === "reel_ia" ? "Reel com vídeo de IA" : "Reel montado"}, ${st.seconds} s${job.input.voz ? ", com narração" : ", sem voz"}).`, media: [asset._id], blockers: kitBlockers(kit),
      });
    } catch (e) {
      await MediaAsset.deleteOne({ _id: asset._id, organization: org });
      await rm(final, { force: true });
      throw e;
    }
    await finish(job, lock, { status: "done", progress: 100, step: "Pronto: o Reel está nos rascunhos", state: st, post: post._id, asset: asset._id, providers: [...used], error: "" });
  } catch (e) {
    if (e instanceof Stop || e instanceof Waiting) return;
    const permanent = (e instanceof FriendlyError && e.status !== 500) || (e as any)?.name === "ScriptInvalid";
    if (!permanent) console.error("[estudio] trabalho", String(job._id), e instanceof Error ? `${e.name}: ${e.message.slice(0, 300)}` : "erro");
    if (permanent || job.attempts >= job.maxAttempts) {
      const msg = permanent ? (e as Error).message : "A montagem do vídeo falhou depois de várias tentativas. Tente gerar de novo; se repetir, avise o suporte.";
      await finish(job, lock, { status: "failed", step: "Não deu certo", error: msg.slice(0, 600), state: st }).catch(() => {});
    } else {
      // falha passageira: volta para a fila, mantendo o que já foi feito
      await StudioJob.updateOne({ _id: job._id, organization: org, lockId: lock }, { $set: { status: "queued", step: "Tentando de novo", state: st, lockId: "", lockedAt: null, runAfter: new Date(nowMs() + 5000 * job.attempts) } }).catch(() => {});
    }
  } finally {
    clearInterval(beat);
  }
}

let active = 0;
/**
 * Pega os trabalhos que podem rodar agora (respeitando os limites) e processa.
 * `wait: true` espera terminarem (rota do worker, testes); sem isso só dispara.
 */
export async function drain(opts: { wait?: boolean; max?: number } = {}): Promise<{ claimed: number; skipped: number }> {
  await connectDB();
  const cfg = await settings();
  const now = nowMs();
  const stale = new Date(now - STALE_MS);
  const runningNow = { status: "running", lockedAt: { $gte: stale } };
  const candidates: any[] = await StudioJob.find({ $or: [{ status: { $in: ["queued", "waiting"] }, $or: [{ runAfter: null }, { runAfter: { $lte: new Date(now) } }] }, { status: "running", lockedAt: { $lt: stale } }] })
    .setOptions(cross).sort({ createdAt: 1 }).limit(50).lean();
  const runs: Promise<void>[] = [];
  let skipped = 0;
  for (const c of candidates) {
    if (opts.max && runs.length >= opts.max) break;
    const own = { _id: c._id, organization: c.organization };
    // prazo estourado (inclusive esperando o provedor): encerra sem processar
    if (c.deadlineAt && now > new Date(c.deadlineAt).getTime()) {
      const r = await StudioJob.updateOne({ ...own, status: c.status, lockId: c.lockId }, { $set: { status: "failed", step: "Não deu certo", error: "O trabalho passou do tempo máximo e foi encerrado. Gere de novo; se repetir, avise o suporte.", finishedAt: new Date(now), lockId: "", lockedAt: null } });
      if (r.modifiedCount) await rm(workDir(c), { recursive: true, force: true });
      continue;
    }
    const resumed = c.status === "running";
    if (resumed && c.attempts >= c.maxAttempts) {
      const r = await StudioJob.updateOne({ ...own, status: "running", lockId: c.lockId }, { $set: { status: "failed", step: "Não deu certo", error: "O servidor reiniciou várias vezes durante este trabalho. Gere de novo.", finishedAt: new Date(now), lockId: "", lockedAt: null } });
      if (r.modifiedCount) await rm(workDir(c), { recursive: true, force: true });
      continue;
    }
    if ((await StudioJob.countDocuments(runningNow).setOptions(cross)) >= cfg.maxJobsGlobal) { skipped++; break; }
    if ((await StudioJob.countDocuments({ ...runningNow, organization: c.organization })) >= cfg.maxJobsPerOrg) { skipped++; continue; }
    const lock = `${WORKER}-${randomBytes(6).toString("hex")}`;
    const first = !c.startedAt;
    const job: any = await StudioJob.findOneAndUpdate(
      { ...own, status: c.status, lockId: c.lockId, ...(resumed ? { lockedAt: { $lt: stale } } : {}) },
      { $set: { status: "running", lockId: lock, lockedAt: new Date(now), runAfter: null, ...(first ? { startedAt: new Date(now), deadlineAt: new Date(now + cfg.jobMaxMinutes * 60_000) } : {}), ...(resumed ? { step: "Retomando depois de um reinício" } : {}) }, $inc: { attempts: c.status === "waiting" ? 0 : 1 } },
      { returnDocument: "after" }
    ).lean();
    if (!job) continue; // outro processo pegou primeiro
    active++;
    runs.push(work(job, lock).finally(() => { active--; }));
  }
  if (opts.wait) await Promise.all(runs);
  return { claimed: runs.length, skipped };
}

let looping = false;
let autoKick = true;
/** Os testes desligam o disparo automático para controlar a fila passo a passo. */
export function setAutoKick(on: boolean): void {
  autoKick = on;
}
/** Dispara a fila sem esperar (depois de criar um trabalho). Nunca lança. */
export function kick(): void {
  if (looping || !autoKick) return;
  looping = true;
  void drain().catch((e) => console.error("[estudio] fila:", e instanceof Error ? e.message : "erro")).finally(() => { looping = false; });
}
let timer: ReturnType<typeof setInterval> | null = null;
/** Laço interno do servidor: confere a fila a cada 10 s (é o que retoma trabalhos depois de um reinício). */
export function startLoop(everyMs = 10_000): void {
  if (timer) return;
  timer = setInterval(kick, everyMs);
  timer.unref?.();
}
export const activeJobs = () => active;
