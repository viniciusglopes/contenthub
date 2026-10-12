import sharp from "sharp";
import { stat } from "node:fs/promises";
import { IG_LIMITS, type MediaProblem, ratioProblem } from "./specs";

export type Fit = "" | "crop" | "pad";
export interface ImageResult { width: number; height: number; bytes: number; problems: MediaProblem[] }

const L = IG_LIMITS.image;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Converte qualquer imagem aceita em JPEG sRGB pronto para o Instagram:
 * gira conforme a câmera (EXIF), tira transparência, limita a 1440 px de largura (mínimo 320)
 * e garante menos de 8 MB. Com `fit`, traz a proporção para dentro do aceito (4:5 a 1,91:1):
 * "crop" recorta pelo centro, "pad" encaixa a imagem inteira sobre um fundo desfocado dela mesma.
 */
export async function processImage(input: string, output: string, fit: Fit = ""): Promise<ImageResult> {
  const open = () => sharp(input, { failOn: "error", limitInputPixels: 120_000_000 }).rotate().flatten({ background: "#ffffff" });
  const meta = await sharp(input, { limitInputPixels: 120_000_000 }).metadata();
  if (!meta.width || !meta.height) throw new Error("imagem sem dimensões");
  const turned = (meta.orientation || 1) >= 5;
  const ow = turned ? meta.height : meta.width;
  const oh = turned ? meta.width : meta.height;
  const ratio = ow / oh;
  const target = clamp(ratio, L.minRatio, L.maxRatio);
  const out = fit && Math.abs(target - ratio) > 0.002 ? fit : "";

  let img: sharp.Sharp;
  if (out === "crop") {
    // maior retângulo na proporção alvo que cabe na imagem
    const cw = ratio > target ? Math.round(oh * target) : ow;
    const w = clamp(cw, L.minWidth, L.maxWidth);
    img = open().resize({ width: w, height: Math.round(w / target), fit: "cover", position: "centre" });
  } else if (out === "pad") {
    // menor moldura na proporção alvo que contém a imagem inteira
    const fw = ratio > target ? ow : Math.round(oh * target);
    const w = clamp(fw, L.minWidth, L.maxWidth);
    const h = Math.round(w / target);
    const [bg, fg] = await Promise.all([
      open().resize({ width: w, height: h, fit: "cover" }).blur(40).modulate({ brightness: 0.75 }).toBuffer(),
      open().resize({ width: w, height: h, fit: "inside" }).toBuffer(),
    ]);
    img = sharp(bg).composite([{ input: fg, gravity: "centre" }]);
  } else {
    img = open().resize({ width: clamp(ow, L.minWidth, L.maxWidth) });
  }

  let info: sharp.OutputInfo | null = null;
  for (const quality of [90, 82, 72, 60]) {
    info = await img.clone().toColourspace("srgb").jpeg({ quality, chromaSubsampling: "4:2:0", progressive: false }).toFile(output);
    if (info.size <= L.maxBytes) break;
  }
  if (!info) throw new Error("falha ao converter");
  const bytes = (await stat(output)).size;
  const problems: MediaProblem[] = [];
  const rp = ratioProblem(info.width, info.height);
  if (rp) problems.push(rp);
  if (bytes > L.maxBytes) problems.push({ code: "tamanho", level: "erro", message: "A imagem ficou acima de 8 MB mesmo depois de convertida. Envie uma versão menor." });
  if (ow < L.minWidth) problems.push({ code: "pequena", level: "aviso", message: `A imagem é pequena (${ow} pixels de largura) e foi ampliada; pode ficar sem nitidez. O ideal é 1080 pixels ou mais.` });
  return { width: info.width, height: info.height, bytes, problems };
}
