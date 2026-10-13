import { createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Types } from "mongoose";
import { FriendlyError, notFound } from "@/lib/errors";
import { toObjectId } from "@/lib/tenant";
import MediaAsset from "@/models/MediaAsset";
import Post from "@/models/Post";
import { type Fit, processImage } from "./image";
import { VideoParseError, probeVideo, videoProblems } from "./mp4";
import { IG_LIMITS, UPLOAD_LIMITS, fmtBytes } from "./specs";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ARMAZENAMENTO DE MÍDIA: disco do próprio app (volume persistente em produção).
//   <MEDIA_DIR>/<id da organização>/<48 letras e números sorteados>.<jpg|mp4|mov>
// O nome é sorteado (192 bits): não dá para adivinhar nem listar. A pasta é a da organização
// da SESSÃO; nenhum caminho vem do navegador. Quem serve é GET /api/media/[org]/[file].

type Org = Types.ObjectId;

export function mediaDir(): string {
  return process.env.MEDIA_DIR || (process.env.NODE_ENV === "production" ? "/data/media" : path.join(process.cwd(), ".media"));
}
export const FILE_RE = /^[a-f0-9]{48}\.(jpg|mp4|mov|png|mp3|m4a)$/;
const ORG_RE = /^[a-f0-9]{24}$/;

/** Caminho no disco de um arquivo público, ou null se o pedido não tem a forma exata esperada. */
export function resolveMedia(org: string, file: string): string | null {
  if (!ORG_RE.test(org) || !FILE_RE.test(file)) return null;
  return path.join(mediaDir(), org, file);
}
export const orgDir = (org: Org) => path.join(mediaDir(), String(org));
export const newName = (ext: string) => `${randomBytes(24).toString("hex")}.${ext}`;

export const mediaPath = (org: unknown, file: string) => `/api/media/${String(org)}/${file}`;
/** Endereço público completo (o que a Meta baixa). Sem APP_URL https não há como publicar. */
export function mediaPublicUrl(org: unknown, file: string): string | null {
  const base = (process.env.APP_URL || "").replace(/\/+$/, "");
  return /^https:\/\//i.test(base) ? `${base}${mediaPath(org, file)}` : null;
}

export function quotaBytes(): number {
  const mb = Number(process.env.MEDIA_QUOTA_MB);
  return Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : UPLOAD_LIMITS.quotaBytes;
}
export async function usedBytes(org: Org): Promise<number> {
  const r = await MediaAsset.aggregate([{ $match: { organization: org } }, { $group: { _id: null, n: { $sum: "$bytes" } } }]);
  return r[0]?.n ?? 0;
}

export type Sniffed = "jpeg" | "png" | "webp" | "heic" | "gif" | "mp4" | "mov" | null;
/** Tipo de verdade, pelos primeiros bytes do arquivo (a extensão e o Content-Type não contam). */
export function sniff(head: Buffer): Sniffed {
  if (head.length < 12) return null;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (head.toString("latin1", 0, 3) === "GIF") return "gif";
  if (head.toString("latin1", 4, 8) === "ftyp") {
    const brand = head.toString("latin1", 8, 12);
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif)$/.test(brand)) return "heic";
    return brand.startsWith("qt") ? "mov" : "mp4";
  }
  const t = head.toString("latin1", 4, 8);
  if (t === "moov" || t === "mdat" || t === "wide" || t === "free") return "mov";
  return null;
}

/** Grava o corpo do pedido num arquivo temporário da organização, cortando no limite de bytes. */
async function receive(body: ReadableStream<Uint8Array> | null, org: Org, maxBytes: number): Promise<{ tmp: string; bytes: number }> {
  if (!body) throw new FriendlyError("Nenhum arquivo chegou. Tente de novo.", 400);
  await mkdir(orgDir(org), { recursive: true });
  const tmp = path.join(orgDir(org), `.envio-${randomBytes(12).toString("hex")}`);
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, _enc, cb) {
      bytes += chunk.length;
      cb(bytes > maxBytes ? new FriendlyError("grande", 413) : null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body as any), meter, createWriteStream(tmp, { mode: 0o640 }));
  } catch (e) {
    await rm(tmp, { force: true });
    if (e instanceof FriendlyError) throw e;
    throw new FriendlyError("O envio foi interrompido. Confira a conexão e tente de novo.", 400);
  }
  return { tmp, bytes };
}

export function publicAsset(a: any) {
  return {
    _id: String(a._id),
    kind: a.kind,
    url: mediaPath(a.organization, a.file),
    bytes: a.bytes,
    width: a.width,
    height: a.height,
    durationMs: a.durationMs,
    originalName: a.originalName || "",
    fit: a.fit || "",
    problems: (a.problems || []).map((p: any) => ({ code: p.code, level: p.level, message: p.message })),
  };
}

/** Recebe um arquivo, confere o tipo de verdade, converte/analisa e guarda. */
export async function storeUpload(
  org: Org,
  input: { body: ReadableStream<Uint8Array> | null; name?: string; declaredLength?: number; fit?: Fit; userId?: unknown }
): Promise<any> {
  const quota = quotaBytes();
  const used = await usedBytes(org);
  const bigMsg = `O arquivo é grande demais. O limite é ${fmtBytes(UPLOAD_LIMITS.imageMaxBytes)} para imagem e ${fmtBytes(UPLOAD_LIMITS.videoMaxBytes)} para vídeo.`;
  const fullMsg = `O espaço de mídia desta conta está cheio (${fmtBytes(used)} de ${fmtBytes(quota)}). Apague posts ou mídias antigas, ou fale com o suporte.`;
  if (used >= quota) throw new FriendlyError(fullMsg, 413);
  if (input.declaredLength && input.declaredLength > UPLOAD_LIMITS.videoMaxBytes) throw new FriendlyError(bigMsg, 413);
  if (input.declaredLength && used + input.declaredLength > quota) throw new FriendlyError(fullMsg, 413);
  await cleanupOrphans(org).catch(() => {});

  let received;
  try {
    received = await receive(input.body, org, Math.min(UPLOAD_LIMITS.videoMaxBytes, quota - used));
  } catch (e) {
    if (e instanceof FriendlyError && e.message === "grande")
      throw new FriendlyError(used + UPLOAD_LIMITS.videoMaxBytes > quota ? fullMsg : bigMsg, 413);
    throw e;
  }
  const { tmp, bytes } = received;
  let final = "";
  try {
    if (bytes === 0) throw new FriendlyError("O arquivo chegou vazio. Tente de novo.", 400);
    const head = Buffer.alloc(32);
    const fh = await open(tmp, "r");
    await fh.read(head, 0, 32, 0).finally(() => fh.close());
    const type = sniff(head);
    const originalName = String(input.name || "").replace(/[^\p{L}\p{N} ._()-]/gu, "").slice(0, 120);
    const base = { organization: org, originalName, originalFormat: type || "", createdBy: toObjectId(String(input.userId || "")) };

    if (type === "heic")
      throw new FriendlyError("Foto em HEIC (iPhone) ainda não é aceita aqui. No iPhone: Ajustes › Câmera › Formatos › Mais compatível, ou envie a foto como JPG.", 415);
    if (type === "gif") throw new FriendlyError("GIF não é aceito pelo Instagram. Envie JPG, PNG ou WebP, ou um vídeo MP4.", 415);
    if (!type) throw new FriendlyError("Esse arquivo não é uma imagem nem um vídeo que o Instagram aceite. Envie JPG, PNG, WebP, MP4 ou MOV.", 415);

    if (type === "jpeg" || type === "png" || type === "webp") {
      if (bytes > UPLOAD_LIMITS.imageMaxBytes) throw new FriendlyError(bigMsg, 413);
      const file = newName("jpg");
      final = path.join(orgDir(org), file);
      let r;
      try {
        r = await processImage(tmp, final, input.fit || "");
      } catch {
        throw new FriendlyError("Não foi possível ler essa imagem (arquivo corrompido ou grande demais). Envie outra.", 400);
      }
      return await MediaAsset.create({ ...base, kind: "image", file, mime: "image/jpeg", bytes: r.bytes, width: r.width, height: r.height, fit: r.problems.some((p) => p.code === "proporcao") ? "" : input.fit || "", problems: r.problems });
    }

    let info;
    try {
      info = await probeVideo(tmp);
    } catch (e) {
      if (e instanceof VideoParseError) throw new FriendlyError("Não foi possível ler esse vídeo (arquivo incompleto ou em formato diferente de MP4/MOV). Exporte de novo e envie.", 400);
      throw e;
    }
    const ext = type === "mov" ? "mov" : "mp4";
    const file = newName(ext);
    final = path.join(orgDir(org), file);
    await rename(tmp, final);
    return await MediaAsset.create({
      ...base, kind: "video", file, mime: ext === "mov" ? "video/quicktime" : "video/mp4", bytes,
      width: info.width, height: info.height, durationMs: info.durationMs, fps: info.fps, videoCodec: info.videoCodec, audioCodec: info.audioCodec,
      problems: videoProblems(info, bytes),
    });
  } catch (e) {
    if (final) await rm(final, { force: true });
    throw e;
  } finally {
    await rm(tmp, { force: true });
  }
}

/** Recorta ou ajusta com fundo uma imagem fora da proporção. Gera arquivo novo (nome novo). */
export async function refitAsset(org: Org, assetId: Types.ObjectId, fit: Fit): Promise<any> {
  const asset: any = await MediaAsset.findOne({ _id: assetId, organization: org });
  if (!asset) throw notFound("Mídia");
  if (asset.kind !== "image") throw new FriendlyError("O ajuste automático só existe para imagem. Para vídeo, exporte de novo no formato certo.", 400);
  if (fit !== "crop" && fit !== "pad") throw new FriendlyError("Escolha recortar ou ajustar com fundo.", 400, "fit");
  if (!asset.problems.some((p: any) => p.code === "proporcao")) return asset;
  const oldPath = path.join(orgDir(org), asset.file);
  const file = newName("jpg");
  const r = await processImage(oldPath, path.join(orgDir(org), file), fit).catch(() => {
    throw new FriendlyError("Não foi possível ajustar essa imagem. Envie outra.", 400);
  });
  const old = asset.file;
  asset.set({ file, bytes: r.bytes, width: r.width, height: r.height, fit, problems: r.problems });
  await asset.save();
  await rm(path.join(orgDir(org), old), { force: true });
  return asset;
}

/** Apaga registros e arquivos. Só encontra o que é da organização informada. */
export async function deleteAssets(org: Org, filter: Record<string, unknown>): Promise<number> {
  const assets: any[] = await MediaAsset.find({ ...filter, organization: org }).lean();
  for (const a of assets) {
    await MediaAsset.deleteOne({ _id: a._id, organization: org });
    if (FILE_RE.test(a.file)) await rm(path.join(orgDir(org), a.file), { force: true });
  }
  return assets.length;
}

/** Mídia enviada e nunca ligada a um post (a pessoa desistiu do formulário): some depois de 24h. */
export async function cleanupOrphans(org: Org, now: number = Date.now()): Promise<number> {
  return deleteAssets(org, { post: null, keep: { $ne: true }, createdAt: { $lt: new Date(now - UPLOAD_LIMITS.orphanHours * 3_600_000) } });
}

/**
 * Liga ao post a lista de mídias que veio do formulário (na ordem), e apaga as que saíram.
 * Cada id tem de ser da organização e estar livre ou já ser deste post.
 */
export async function attachMedia(org: Org, postId: Types.ObjectId, ids: unknown): Promise<Types.ObjectId[]> {
  if (!Array.isArray(ids)) throw new FriendlyError("Lista de mídias inválida.", 400, "media");
  if (ids.length > IG_LIMITS.carousel.max) throw new FriendlyError(`No máximo ${IG_LIMITS.carousel.max} mídias por post.`, 400, "media");
  const wanted: Types.ObjectId[] = [];
  for (const raw of ids) {
    const oid = toObjectId(typeof raw === "object" && raw ? String((raw as any)._id) : String(raw));
    if (!oid) throw notFound("Mídia");
    if (!wanted.some((w) => w.equals(oid))) wanted.push(oid);
  }
  const found: any[] = await MediaAsset.find({ organization: org, _id: { $in: wanted } }).select("post").lean();
  if (found.length !== wanted.length) throw notFound("Mídia");
  if (found.some((a) => a.post && String(a.post) !== String(postId)))
    throw new FriendlyError("Essa mídia já está em outro post. Envie o arquivo de novo.", 409, "media");
  await MediaAsset.updateMany({ organization: org, _id: { $in: wanted } }, { $set: { post: postId } });
  await deleteAssets(org, { post: postId, _id: { $nin: wanted } });
  return wanted;
}

export async function assetExists(org: Org, file: string): Promise<boolean> {
  return stat(path.join(orgDir(org), file)).then((s) => s.isFile(), () => false);
}

/** Posts que citam a mídia (para não apagar algo em uso por engano). */
export async function assetInUse(org: Org, assetId: Types.ObjectId): Promise<boolean> {
  return Boolean(await Post.exists({ organization: org, media: assetId }));
}
