import path from "node:path";
import type { Types } from "mongoose";
import { FriendlyError } from "@/lib/errors";
import { mediaPath, orgDir } from "@/lib/media/store";
import { assertProject } from "@/lib/orgs";
import BrandKit from "@/models/BrandKit";
import MediaAsset from "@/models/MediaAsset";
import { DEFAULT_PALETTE, FONT_PAIRS, type KitT, PALETTE_FIELDS, type Palette, isHex, paletteProblem } from "./kitspec";
import type { KitText } from "./script";
import { SECTORS, sectorOf } from "./sectors";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Org = Types.ObjectId;
const s = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const list = (v: unknown) => (Array.isArray(v) ? v : String(v ?? "").split(/[,;\n]/)).map((x) => s(x, 40)).filter(Boolean).slice(0, 8);

/** O que falta no kit. `block` = impede aprovar o post (não a geração). */
export function kitPending(k: { name: string; handle: string; profession: string; registration: string; sector: string; offer: string; audience: string }): KitT["pending"] {
  const out: KitT["pending"] = [];
  const sector = sectorOf(k.sector);
  if (!k.name) out.push({ block: true, text: "Falta o nome que assina as peças." });
  if (!k.handle) out.push({ block: true, text: "Falta o @ do Instagram." });
  if (sector.requiresRegistration && !k.registration)
    out.push({ block: true, text: `Falta o registro profissional (${sector.registrationLabel}). As regras do setor exigem o número em toda peça: sem ele o post gerado não pode ser aprovado.` });
  if (sector.requiresRegistration && !k.profession) out.push({ block: true, text: "Falta a profissão (como o conselho registra)." });
  if (!k.offer) out.push({ block: false, text: "Diga o que a marca oferece: o roteiro por IA fica melhor." });
  if (!k.audience) out.push({ block: false, text: "Diga quem é o público." });
  return out;
}

export function publicKit(org: Org, doc: any, logo: any): KitT {
  const k = {
    _id: doc._id ? String(doc._id) : undefined, saved: Boolean(doc._id), project: String(doc.project),
    name: doc.name || "", handle: doc.handle || "", profession: doc.profession || "", registration: doc.registration || "",
    segment: doc.segment || "", offer: doc.offer || "", audience: doc.audience || "", city: doc.city || "",
    tone: { adjectives: [...(doc.tone?.adjectives || [])], avoid: [...(doc.tone?.avoid || [])] },
    palette: { ...DEFAULT_PALETTE, ...Object.fromEntries(PALETTE_FIELDS.map((f) => [f.key, doc.palette?.[f.key]]).filter(([, v]) => isHex(v))) } as Palette,
    fontPair: doc.fontPair in FONT_PAIRS ? doc.fontPair : "serifa",
    sector: doc.sector in SECTORS ? doc.sector : "geral",
    logo: logo ? { _id: String(logo._id), url: mediaPath(org, logo.file) } : null,
  };
  return { ...k, pending: kitPending(k) };
}

/** Kit do projeto (ou um kit em branco com o nome do projeto, ainda não salvo). */
export async function loadKit(org: Org, projectId: Types.ObjectId): Promise<{ kit: KitT; logoFile: string | null }> {
  const project = await assertProject(org, projectId);
  const doc: any = (await BrandKit.findOne({ organization: org, project: projectId }).lean()) || { project: projectId, name: project.name };
  const logo: any = doc.logo ? await MediaAsset.findOne({ organization: org, _id: doc.logo }).lean() : null;
  return { kit: publicKit(org, doc, logo), logoFile: logo ? path.join(orgDir(org), logo.file) : null };
}

/** Só estes campos do kit podem vir do navegador. */
export function kitInput(body: Record<string, any>): Record<string, any> {
  const palette = Object.fromEntries(PALETTE_FIELDS.map((f) => [f.key, String(body.palette?.[f.key] || "").trim()])) as Palette;
  const problem = paletteProblem(palette);
  if (problem) throw new FriendlyError(problem, 400, "palette");
  let handle = s(body.handle, 40).replace(/\s/g, "");
  if (handle && !handle.startsWith("@")) handle = `@${handle}`;
  if (handle && !/^@[A-Za-z0-9._]{1,30}$/.test(handle)) throw new FriendlyError("O @ do Instagram só tem letras, números, ponto e sublinhado.", 400, "handle");
  const out = {
    name: s(body.name, 60), handle, profession: s(body.profession, 60), registration: s(body.registration, 40), segment: s(body.segment, 120),
    offer: s(body.offer, 300), audience: s(body.audience, 300), city: s(body.city, 60),
    tone: { adjectives: list(body.tone?.adjectives), avoid: list(body.tone?.avoid) },
    palette, fontPair: body.fontPair in FONT_PAIRS ? body.fontPair : "serifa", sector: body.sector in SECTORS ? body.sector : "geral",
  };
  if (!out.name) throw new FriendlyError("Diga o nome que assina as peças.", 400, "name");
  for (const [k, v] of Object.entries(out)) if (typeof v === "string" && /[<>{}\\]/.test(v)) throw new FriendlyError("Tire os símbolos < > { } \\ do texto.", 400, k);
  return out;
}

export const kitText = (k: KitT): KitText => ({ name: k.name, handle: k.handle, profession: k.profession, registration: k.registration, segment: k.segment, offer: k.offer, audience: k.audience, city: k.city, tone: k.tone });

/** O kit como o motor de arte recebe. Sem nome ou @ não há o que assinar: erro claro. */
export function engineKit(k: Pick<KitT, "name" | "handle" | "profession" | "registration" | "palette" | "fontPair">, logoFile: string | null) {
  if (!k.name || !k.handle) throw new FriendlyError("Preencha o nome e o @ no Kit de marca antes de gerar.", 400, "kit");
  const fonts = FONT_PAIRS[k.fontPair] || FONT_PAIRS.serifa;
  return {
    nome: k.name, arroba: k.handle, profissao: k.profession, registro_profissional: k.registration || null,
    paleta: { fundo: k.palette.background, texto: k.palette.text, destaque: k.palette.accent, apoio: k.palette.support },
    fontes: { titulo: fonts.titulo, corpo: fonts.corpo }, logo: logoFile,
  };
}

/** O que impede aprovar um post gerado com este kit (vai gravado no post). */
export const kitBlockers = (k: KitT) => k.pending.filter((p) => p.block).map((p) => p.text);
