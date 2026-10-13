import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { Types } from "mongoose";
import { FriendlyError } from "@/lib/errors";
import { processImage } from "@/lib/media/image";
import { newName, orgDir, quotaBytes, usedBytes } from "@/lib/media/store";
import { fmtBytes } from "@/lib/media/specs";
import MediaAsset from "@/models/MediaAsset";
import type { CarouselScript, Slide } from "./script";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Org = Types.ObjectId;

// MOTOR DE ARTE: Python + Pillow (pasta /estudio do repositório, copiada para a imagem do app).
// Roda como processo filho, sem rede e sem porta: recebe UM JSON pela entrada padrão e devolve
// UM JSON. Nenhum texto do usuário vira argumento de linha de comando.

export const studioDir = () => process.env.ESTUDIO_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "estudio");

export interface ProcResult { code: number | null; stdout: string; stderr: string; timedOut: boolean }
/** Roda um programa (sem shell) com entrada opcional e tempo máximo. Encerra pelo PID do filho. */
export function runProcess(cmd: string, args: string[], opts: { input?: string; timeoutMs?: number; cwd?: string } = {}): Promise<ProcResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"], env: { PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin", HOME: "/tmp", LANG: "C.UTF-8", PYTHONDONTWRITEBYTECODE: "1" } as unknown as NodeJS.ProcessEnv });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs ?? 120_000);
    child.stdout.on("data", (d) => { if (stdout.length < 4_000_000) stdout += d; });
    child.stderr.on("data", (d) => { stderr = (stderr + d).slice(-6000); });
    child.on("error", (e) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: String(e.message), timedOut }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr, timedOut }); });
    child.stdin.on("error", () => {});
    child.stdin.end(opts.input ?? "");
  });
}

const LAYOUT_MSG: Record<string, (d: string) => string> = {
  TextoNaoCabe: (d) => `Um texto não coube na arte (${d}). Encurte esse trecho e gere de novo.`,
  ContrasteInsuficiente: (d) => `As cores do kit não dão leitura (${d}). Ajuste a paleta no Kit de marca.`,
  GlifoAusente: (d) => `A fonte não tem um dos caracteres usados (${d}). Tire emoji e símbolos especiais.`,
  ErroLayout: (d) => `A arte não fechou (${d}). Ajuste o texto ou a paleta.`,
};

export async function runEngine(payload: Record<string, unknown>, timeoutMs = 180_000): Promise<any> {
  const r = await runProcess(process.env.ESTUDIO_PYTHON || "python3", [path.join(studioDir(), "render.py")], { input: JSON.stringify(payload), timeoutMs });
  if (r.timedOut) throw new FriendlyError("A geração da arte demorou demais e foi interrompida. Tente de novo.", 504);
  let out: any = null;
  try {
    out = JSON.parse(r.stdout);
  } catch {
    console.error("[estudio] motor de arte:", r.code, r.stderr.slice(-400));
    throw new Error("motor de arte indisponível");
  }
  if (!out.ok && out.tipo === "Interno") {
    console.error("[estudio] motor de arte:", String(out.erro).slice(0, 300));
    throw new Error("motor de arte falhou");
  }
  if (!out.ok) throw new FriendlyError((LAYOUT_MSG[out.tipo] || LAYOUT_MSG.ErroLayout)(String(out.erro || "").slice(0, 260)), 422, "arte");
  return out;
}

export async function tempDir(org: Org, prefix = ".estudio-"): Promise<string> {
  const dir = path.join(orgDir(org), `${prefix}${randomBytes(10).toString("hex")}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function assertQuota(org: Org, extraBytes = 0): Promise<void> {
  const [used, quota] = [await usedBytes(org), quotaBytes()];
  if (used + extraBytes >= quota)
    throw new FriendlyError(`O espaço de mídia desta conta está cheio (${fmtBytes(used)} de ${fmtBytes(quota)}). Apague posts ou mídias antigas, ou fale com o suporte.`, 413);
}

/** Gera os slides (1080x1350) e guarda como mídias soltas da organização (JPEG, prontas para o Instagram). */
export async function renderCarousel(org: Org, kit: Record<string, unknown>, script: CarouselScript, userId?: unknown): Promise<{ assets: any[]; report: any }> {
  await assertQuota(org);
  const dir = await tempDir(org);
  const created: any[] = [];
  try {
    const out = await runEngine({ op: "carrossel", kit, roteiro: script, saida: dir });
    for (const [i, s] of (out.slides as any[]).entries()) {
      const file = newName("jpg");
      const r = await processImage(s.arquivo, path.join(orgDir(org), file));
      created.push(await MediaAsset.create({ organization: org, kind: "image", file, mime: "image/jpeg", bytes: r.bytes, width: r.width, height: r.height, originalName: `estudio-slide-${String(i + 1).padStart(2, "0")}.jpg`, originalFormat: "png", problems: r.problems, createdBy: userId || null }));
    }
    return { assets: created, report: { seconds: out.tempo_s, colorFixes: out.ajustes_de_cor, slides: out.slides.map((s: any) => ({ tipo: s.tipo, minContrast: s.menor_contraste, minSize: s.menor_corpo, fill: s.ocupacao })) } };
  } catch (e) {
    for (const a of created) {
      await MediaAsset.deleteOne({ _id: a._id, organization: org });
      await rm(path.join(orgDir(org), a.file), { force: true });
    }
    throw e;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Um slide só, para a pré-visualização ao vivo do kit (PNG na memória; nada é guardado). */
export async function renderPreview(org: Org, kit: Record<string, unknown>, modelo: string, slide: Slide, i = 1, n = 5): Promise<Buffer> {
  const dir = await tempDir(org);
  try {
    const file = path.join(dir, "previa.png");
    await runEngine({ op: "slide", kit, modelo, slide, i, n, saida: file }, 60_000);
    return await readFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
