import type { Types } from "mongoose";
import { FriendlyError, notFound } from "@/lib/errors";
import { toObjectId } from "@/lib/tenant";
import { Contact } from "@/models/Automation";
import { Pipeline } from "@/models/Crm";
import { DEFAULT_STAGES, LIMITS, type StageDef, slugKey } from "./pure";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Org = Types.ObjectId;
const bad = (msg: string, field: string) => new FriendlyError(msg, 400, field);

/** Funil padrão da organização (cria na primeira vez, sem duplicar em corrida). */
export async function defaultPipeline(org: Org): Promise<any> {
  const found = await Pipeline.findOne({ organization: org, isDefault: true }).lean();
  if (found) return found;
  const any = await Pipeline.findOne({ organization: org }).sort({ createdAt: 1 }).lean();
  if (any) return any;
  try {
    return (await Pipeline.create({ organization: org, name: "Vendas", stages: DEFAULT_STAGES, isDefault: true })).toObject();
  } catch (e: any) {
    if (e?.code === 11000) return Pipeline.findOne({ organization: org, name: "Vendas" }).lean();
    throw e;
  }
}

export async function listPipelines(org: Org): Promise<any[]> {
  await defaultPipeline(org);
  return Pipeline.find({ organization: org }).sort({ isDefault: -1, createdAt: 1 }).lean();
}

export async function ownPipeline(org: Org, id: unknown): Promise<any> {
  if (id === undefined || id === null || id === "") return defaultPipeline(org);
  const oid = toObjectId(id);
  const p = oid ? await Pipeline.findOne({ _id: oid, organization: org }).lean() : null;
  if (!p) throw notFound("Funil");
  return p;
}

export const firstOpenStage = (p: any): StageDef => (p.stages || []).find((s: StageDef) => s.kind === "open") || p.stages?.[0];
export const stageOf = (p: any, key: string): StageDef | undefined => (p?.stages || []).find((s: StageDef) => s.key === key);

/** Funil + etapa válidos (etapa vazia = primeira etapa em andamento). */
export async function resolveStage(org: Org, pipelineId: unknown, stageKey: unknown): Promise<{ pipeline: any; stage: StageDef }> {
  const pipeline = await ownPipeline(org, pipelineId);
  const key = String(stageKey ?? "").trim();
  const stage = key ? stageOf(pipeline, key) : firstOpenStage(pipeline);
  if (!stage) throw bad("Etapa não existe neste funil.", "stage");
  return { pipeline, stage };
}

export function publicPipeline(p: any) {
  return { _id: String(p._id), name: p.name, isDefault: p.isDefault === true, stages: (p.stages || []).map((s: any) => ({ key: s.key, name: s.name, kind: s.kind, color: s.color || "" })) };
}

/** Confere as etapas que vieram da tela. Chave nova sai do nome; chave existente é mantida. */
export function cleanStages(raw: unknown): StageDef[] {
  if (!Array.isArray(raw) || !raw.length) throw bad("O funil precisa de pelo menos uma etapa.", "stages");
  if (raw.length > LIMITS.stages) throw bad(`No máximo ${LIMITS.stages} etapas.`, "stages");
  const seen = new Set<string>();
  const out: StageDef[] = raw.map((s: any, i: number) => {
    const name = String(s?.name ?? "").trim();
    if (!name) throw bad("Dê um nome para cada etapa.", `stages.${i}.name`);
    if (name.length > LIMITS.stageName) throw bad(`Nome da etapa: no máximo ${LIMITS.stageName} caracteres.`, `stages.${i}.name`);
    let key = slugKey(String(s?.key || "")) || slugKey(name) || `etapa-${i + 1}`;
    while (seen.has(key)) key = `${key}-${i + 1}`;
    seen.add(key);
    const kind = s?.kind === "won" || s?.kind === "lost" ? s.kind : "open";
    const color = /^#[0-9a-f]{6}$/i.test(String(s?.color || "")) ? String(s.color) : "";
    return { key, name, kind, color };
  });
  if (!out.some((s) => s.kind === "open")) throw bad("Deixe pelo menos uma etapa em andamento (os leads novos entram nela).", "stages");
  return out;
}

export async function createPipeline(org: Org, b: Record<string, any>) {
  const name = String(b.name ?? "").trim().slice(0, 60);
  if (name.length < 2) throw bad("Dê um nome para o funil.", "name");
  if ((await Pipeline.countDocuments({ organization: org })) >= LIMITS.pipelines) throw bad(`No máximo ${LIMITS.pipelines} funis.`, "name");
  const stages = b.stages ? cleanStages(b.stages) : DEFAULT_STAGES;
  try {
    return await Pipeline.create({ organization: org, name, stages, isDefault: false });
  } catch (e: any) {
    if (e?.code === 11000) throw bad("Já existe um funil com esse nome.", "name");
    throw e;
  }
}

/**
 * Salva nome/etapas. Etapa que some com lead dentro só sai se a tela disser para onde mover
 * (`moveTo` = { chaveRemovida: chaveDestino }); senão 409 com a contagem.
 */
export async function updatePipeline(org: Org, id: unknown, b: Record<string, any>) {
  const oid = toObjectId(id);
  const p: any = oid ? await Pipeline.findOne({ _id: oid, organization: org }) : null;
  if (!p) throw notFound("Funil");
  if (b.name !== undefined) {
    const name = String(b.name ?? "").trim().slice(0, 60);
    if (name.length < 2) throw bad("Dê um nome para o funil.", "name");
    p.name = name;
  }
  if (b.stages !== undefined) {
    const next = cleanStages(b.stages);
    const keep = new Set(next.map((s) => s.key));
    const removed = (p.stages as StageDef[]).filter((s) => !keep.has(s.key)).map((s) => s.key);
    const moveTo: Record<string, string> = b.moveTo && typeof b.moveTo === "object" ? b.moveTo : {};
    for (const key of removed) {
      const n = await Contact.countDocuments({ organization: org, pipeline: p._id, stage: key, lead: true });
      if (!n) continue;
      const dest = String(moveTo[key] || "");
      if (!keep.has(dest)) throw new FriendlyError(`A etapa "${(p.stages as StageDef[]).find((s) => s.key === key)?.name}" tem ${n} lead(s). Diga para qual etapa eles vão antes de remover.`, 409, "moveTo");
      await Contact.updateMany({ organization: org, pipeline: p._id, stage: key }, { $set: { stage: dest, stageAt: new Date() } });
    }
    p.stages = next;
  }
  if (b.isDefault === true && !p.isDefault) {
    await Pipeline.updateMany({ organization: org, isDefault: true }, { $set: { isDefault: false } });
    p.isDefault = true;
  }
  try {
    await p.save();
  } catch (e: any) {
    if (e?.code === 11000) throw bad("Já existe um funil com esse nome.", "name");
    throw e;
  }
  return p;
}

export async function deletePipeline(org: Org, id: unknown) {
  const oid = toObjectId(id);
  const p: any = oid ? await Pipeline.findOne({ _id: oid, organization: org }).lean() : null;
  if (!p) throw notFound("Funil");
  if (p.isDefault) throw bad("O funil padrão não pode ser apagado (escolha outro como padrão antes).", "isDefault");
  const n = await Contact.countDocuments({ organization: org, pipeline: p._id, lead: true });
  if (n) throw new FriendlyError(`Este funil tem ${n} lead(s). Mova os leads antes de apagar.`, 409);
  await Pipeline.deleteOne({ _id: p._id, organization: org });
}
