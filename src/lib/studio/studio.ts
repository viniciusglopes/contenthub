import type { Types } from "mongoose";
import { nowMs } from "@/lib/clock";
import { FriendlyError, notFound } from "@/lib/errors";
import { attachMedia, publicAsset } from "@/lib/media/store";
import { toObjectId } from "@/lib/tenant";
import { historyEntry } from "@/lib/workflow";
import MediaAsset from "@/models/MediaAsset";
import Organization from "@/models/Organization";
import Post from "@/models/Post";
import { type Purpose, clipSeconds, costUsd, modelSpec, tokensOf } from "./catalog";
import { resolveChain, runChain } from "./chain";
import { type BudgetCheck, checkBudget, dayKeyBR } from "./cost";
import { renderCarousel } from "./engine";
import { engineKit, kitBlockers, kitText, loadKit } from "./kit";
import type { KitT } from "./kitspec";
import { TEXT } from "./providers";
import { type CarouselScript, type Prompt, type ReelScript, ScriptInvalid, VISUAL_MODELS, type VisualModel, altTexts, captionChunks, carouselPrompt, finalCaption, parseJson, readSeconds, reelPrompt, themesPrompt, validateCarousel, validateReel, validateThemes } from "./script";
import { type Sector, sectorOf } from "./sectors";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Org = Types.ObjectId;
export interface Who { org: Org; userId?: string; name: string }

/** Roteiro inválido vira mensagem de tela (422) com a lista do que corrigir. */
export function scriptError(e: unknown): never {
  if (e instanceof ScriptInvalid) throw new FriendlyError(`O roteiro precisa de ajuste: ${e.problems.slice(0, 6).join("; ")}.`, 422, "roteiro");
  throw e;
}
const guard = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (e) {
    return scriptError(e);
  }
};

export async function estimateFor(org: Org, purpose: Purpose, units: (model: ReturnType<typeof modelSpec>) => Parameters<typeof costUsd>[1]): Promise<{ usd: number; service: string; model: string; house: boolean } | null> {
  const first = (await resolveChain(org, purpose))[0];
  if (!first) return null;
  const spec = modelSpec(first.service, purpose, first.model);
  return { usd: costUsd(spec, units(spec)), service: first.service, model: first.model, house: first.house };
}

// ---------- ROTEIRO POR IA ----------
export type ScriptKind = "temas" | "carrossel" | "reel";
export interface ScriptBrief { tema?: string; objetivo?: string; modelo?: string; slides?: number; cenas?: number; visual?: boolean }
export type ScriptOutcome =
  | { needsConfirm: true; check: BudgetCheck }
  | { needsConfirm: false; kind: ScriptKind; themes?: string[]; script?: CarouselScript | ReelScript; provider: { service: string; model: string; house: boolean }; attempts: { service: string; ok: boolean; error?: string }[] };

export async function generateScript(who: Who, projectId: Types.ObjectId, kind: ScriptKind, brief: ScriptBrief, confirmed: boolean): Promise<ScriptOutcome> {
  const { kit } = await loadKit(who.org, projectId);
  const sector = sectorOf(kit.sector);
  const kt = kitText(kit);
  const tema = String(brief.tema || "").trim();
  if (kind !== "temas" && tema.length < 4) throw new FriendlyError("Diga o tema do post.", 400, "tema");
  const modelo = (brief.modelo && brief.modelo in VISUAL_MODELS ? brief.modelo : "editorial") as VisualModel;
  const slides = Math.min(10, Math.max(3, Number(brief.slides) || 7));
  const cenas = Math.min(8, Math.max(2, Number(brief.cenas) || 5));
  const build = (rejected?: string): Prompt =>
    kind === "temas" ? themesPrompt(kt, sector, tema) : kind === "carrossel" ? carouselPrompt(kt, sector, { tema, objetivo: brief.objetivo, modelo, slides }, rejected) : reelPrompt(kt, sector, { tema, objetivo: brief.objetivo, cenas, visual: Boolean(brief.visual) }, rejected);
  const check = (raw: string) => {
    const data = parseJson(raw);
    return kind === "temas" ? validateThemes(data, sector) : kind === "carrossel" ? validateCarousel(data, sector, { modelo, slides }) : validateReel(data, sector, { cenas });
  };

  const p0 = build();
  const est = await estimateFor(who.org, "texto", () => ({ inTokens: tokensOf(p0.system + p0.user), outTokens: p0.maxTokens }));
  if (!est) throw new FriendlyError("Nenhuma chave de IA para texto está cadastrada. Cadastre em Estúdio › Chaves de IA, ou escreva o roteiro à mão.", 400, "chave");
  const budget = await checkBudget(who.org, est.usd, confirmed);
  if (budget.needsConfirm) return { needsConfirm: true, check: budget };

  const what = kind === "temas" ? "sugestão de temas" : kind === "carrossel" ? "roteiro de carrossel" : "roteiro de Reel";
  const { result, cred, attempts } = await runChain({ org: who.org, purpose: "texto", what, project: projectId, by: who.name, timeoutMs: 90_000 }, async (c, signal, meter) => {
    const run = async (prompt: Prompt) => {
      const r = await TEXT[c.service](c, prompt, signal);
      meter.add(r.inTokens + r.outTokens, "tokens", costUsd(modelSpec(c.service, "texto", c.model), r));
      return r.text;
    };
    try {
      return check(await run(p0));
    } catch (e) {
      if (!(e instanceof ScriptInvalid)) throw e;
      // uma segunda chance no mesmo provedor, devolvendo o motivo da recusa
      return check(await run(build(e.message)));
    }
  });
  const provider = { service: cred.service, model: cred.model, house: cred.house };
  const tries = attempts.map((a) => ({ service: a.service, ok: a.ok, error: a.error }));
  return kind === "temas" ? { needsConfirm: false, kind, themes: result as string[], provider, attempts: tries } : { needsConfirm: false, kind, script: result as CarouselScript | ReelScript, provider, attempts: tries };
}

// ---------- CARROSSEL ----------
export async function createCarousel(who: Who, projectId: Types.ObjectId, raw: unknown) {
  const { kit, logoFile } = await loadKit(who.org, projectId);
  const sector = sectorOf(kit.sector);
  const script = guard(() => validateCarousel(raw, sector));
  const { assets, report } = await renderCarousel(who.org, engineKit(kit, logoFile), script, toObjectId(who.userId || ""));
  return { script, assets: assets.map(publicAsset), report, caption: finalCaption(script, kitText(kit), sector), alts: altTexts(script, kitText(kit)), blockers: kitBlockers(kit) };
}

const tomorrowBR = (now: number) => new Date(`${dayKeyBR(now + 86_400_000)}T12:00:00.000Z`);
const plain = (t: string) => t.replace(/\*/g, "");

/** O post nasce SEMPRE como rascunho: publicar exige a aprovação que já existe. */
export async function createDraft(who: Who, projectId: Types.ObjectId, input: { title: string; format: "carrossel" | "reel"; caption: string; hashtags: string[]; content: string; notes: string; media: unknown[]; blockers: string[] }): Promise<any> {
  const post = await Post.create({
    organization: who.org, project: projectId, title: plain(input.title).slice(0, 140) || "Post do Estúdio", format: input.format, platforms: ["instagram"],
    scheduledDate: tomorrowBR(nowMs()), scheduledTime: "09:00", status: "draft", caption: input.caption, hashtags: input.hashtags, content: input.content,
    productionNotes: input.notes, origin: "estudio", blockers: input.blockers, history: [historyEntry("criado", who.name, "Gerado no Estúdio")],
  });
  try {
    post.media = await attachMedia(who.org, post._id, input.media);
    await post.save();
  } catch (e) {
    await Post.deleteOne({ _id: post._id, organization: who.org });
    throw e;
  }
  return post;
}

export async function saveCarouselDraft(who: Who, projectId: Types.ObjectId, raw: unknown, assetIds: unknown): Promise<any> {
  const { kit } = await loadKit(who.org, projectId);
  const sector = sectorOf(kit.sector);
  const script = guard(() => validateCarousel(raw, sector));
  if (!Array.isArray(assetIds) || assetIds.length !== script.slides.length) throw new FriendlyError("Gere a arte de novo antes de salvar: os slides mudaram.", 409, "media");
  const alts = altTexts(script, kitText(kit));
  return createDraft(who, projectId, {
    title: script.slides[0].titulo, format: "carrossel", caption: finalCaption(script, kitText(kit), sector), hashtags: script.hashtags,
    content: script.slides.map((s, i) => `Slide ${i + 1}: ${plain(s.titulo)}${s.texto ? `\n${s.texto}` : ""}\nTexto alternativo: ${alts[i]}`).join("\n\n"),
    notes: `Gerado no Estúdio. Modelo visual: ${VISUAL_MODELS[script.modelo].label}.`, media: assetIds, blockers: kitBlockers(kit),
  });
}

// ---------- REEL: conferência do pedido e estimativa de custo ----------
export interface ReelInput { script: ReelScript; voz: boolean; imagensIA: boolean; trilha: string | null }

/** Sem voz: cada trecho de legenda fica na tela pelo tempo de leitura. */
export function sceneSeconds(narracao: string, voiceSeconds?: number | null): number {
  if (voiceSeconds) return Math.max(2.4, Math.round((voiceSeconds + 0.55) * 100) / 100);
  const chunks = captionChunks(narracao);
  return chunks.length ? Math.max(2.6, Math.round((chunks.reduce((n, c) => n + readSeconds(c), 0) + 0.5) * 100) / 100) : 2.8;
}
/** Estimativa da fala: cerca de 15 caracteres por segundo. */
export const speechSeconds = (text: string) => Math.max(1.2, text.length / 15);

export async function aiVisualsAllowed(org: Org, sector: Sector): Promise<boolean> {
  if (sector.aiImagesAllowed) return true;
  const o: any = await Organization.findById(org).select("studio").lean();
  return o?.studio?.aiVisuals === true;
}

export interface ReelPlan { input: ReelInput; kit: KitT; estimateUsd: number; lines: { what: string; usd: number; provider: string }[]; seconds: number; blockers: string[] }
export async function planReel(org: Org, projectId: Types.ObjectId, kind: "reel_montado" | "reel_ia", body: Record<string, any>): Promise<ReelPlan> {
  const { kit } = await loadKit(org, projectId);
  engineKit(kit, null); // nome e @ preenchidos?
  const sector = sectorOf(kit.sector);
  const script = guard(() => validateReel(body.script, sector));
  const input: ReelInput = { script, voz: Boolean(body.voz), imagensIA: Boolean(body.imagensIA), trilha: null };
  const ids = script.cenas.map((c) => c.imagem).filter(Boolean).map((id) => toObjectId(id)!);
  if (ids.length) {
    const found = await MediaAsset.find({ organization: org, _id: { $in: ids }, kind: "image" }).select("_id").lean();
    if (found.length !== new Set(ids.map(String)).size) throw notFound("Imagem da cena");
  }
  if (body.trilha) {
    const t = toObjectId(String(body.trilha));
    if (!t || !(await MediaAsset.exists({ organization: org, _id: t, kind: "audio" }))) throw notFound("Trilha");
    input.trilha = String(t);
  }
  const wantsAi = kind === "reel_ia" || (input.imagensIA && script.cenas.some((c) => c.prompt_visual && !c.imagem));
  if (wantsAi && !(await aiVisualsAllowed(org, sector)))
    throw new FriendlyError(`No setor "${sector.label}" a imagem e o vídeo gerados por IA ficam desligados: um rosto ou sorriso gerado pode ser lido como resultado de tratamento. Use as suas imagens ou o Reel só com texto; o administrador da plataforma pode liberar para esta conta.`, 400, "setor");
  if (kind === "reel_ia" && script.cenas.some((c) => !c.prompt_visual)) throw new FriendlyError("No Reel com vídeo de IA cada cena precisa da descrição do visual.", 400, "roteiro");

  const lines: ReelPlan["lines"] = [];
  const label = (e: { service: string; model: string; house: boolean }) => `${e.service} ${e.model}${e.house ? " (chave da casa)" : ""}`;
  if (input.voz) {
    const chars = script.cenas.reduce((n, c) => n + c.narracao.length, 0);
    const e = await estimateFor(org, "voz", () => ({ chars }));
    if (!e) throw new FriendlyError("Nenhuma chave de IA para voz está cadastrada. Cadastre em Estúdio › Chaves de IA, ou gere sem voz (só legenda).", 400, "chave");
    lines.push({ what: `Narração (${chars} caracteres)`, usd: e.usd, provider: label(e) });
  }
  const durations = script.cenas.map((c) => sceneSeconds(c.narracao, input.voz && c.narracao ? speechSeconds(c.narracao) : null));
  if (kind === "reel_ia") {
    let secs = 0;
    const e = await estimateFor(org, "video", (spec) => ({ seconds: (secs = durations.reduce((n, d) => n + clipSeconds(spec, d), 0)) }));
    if (!e) throw new FriendlyError("Nenhuma chave de IA para vídeo está cadastrada. Cadastre em Estúdio › Chaves de IA.", 400, "chave");
    lines.push({ what: `${script.cenas.length} cenas de vídeo (${secs} s gerados)`, usd: e.usd, provider: label(e) });
  } else if (input.imagensIA) {
    const images = script.cenas.filter((c) => c.prompt_visual && !c.imagem).length;
    if (images) {
      const e = await estimateFor(org, "imagem", () => ({ images }));
      if (!e) throw new FriendlyError("Nenhuma chave de IA para imagem está cadastrada. Cadastre em Estúdio › Chaves de IA, ou envie as suas imagens.", 400, "chave");
      lines.push({ what: `${images} imagens de fundo`, usd: e.usd, provider: label(e) });
    }
  }
  return { input, kit, estimateUsd: lines.reduce((n, l) => n + l.usd, 0), lines, seconds: Math.round(durations.reduce((n, d) => n + d, 0) * 10) / 10, blockers: kitBlockers(kit) };
}
