import { writeFile } from "node:fs/promises";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { json, route } from "@/lib/api";
import { FriendlyError, notFound } from "@/lib/errors";
import { deleteAssets, mediaPath, newName, orgDir } from "@/lib/media/store";
import { assertProject } from "@/lib/orgs";
import { assertQuota } from "@/lib/studio/engine";
import { probe } from "@/lib/studio/ffmpeg";
import BrandKit from "@/models/BrandKit";
import MediaAsset from "@/models/MediaAsset";

/* eslint-disable @typescript-eslint/no-explicit-any */
const MAX = 8 * 1024 * 1024;

// Arquivos do Estúdio que não são mídia de post: o LOGO do kit (?tipo=logo&project=) e a TRILHA
// de um Reel (?tipo=trilha). O corpo do pedido é o próprio arquivo, até 8 MB. O tipo é conferido
// pelo conteúdo (sharp/ffprobe), não pela extensão. Fica na pasta da organização da sessão.
export const POST = route("org", async ({ org, req, id, session }) => {
  const q = req.nextUrl.searchParams;
  const tipo = q.get("tipo");
  if (tipo !== "logo" && tipo !== "trilha") throw new FriendlyError("Tipo de arquivo não informado.", 400);
  const project = tipo === "logo" ? id(q.get("project"), "Projeto") : null;
  if (project) await assertProject(org, project);
  if (Number(req.headers.get("content-length")) > MAX) throw new FriendlyError("O arquivo é grande demais (limite de 8 MB).", 413);
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) throw new FriendlyError("Nenhum arquivo chegou. Tente de novo.", 400);
  if (buf.length > MAX) throw new FriendlyError("O arquivo é grande demais (limite de 8 MB).", 413);
  await assertQuota(org, buf.length);
  await mkdir(orgDir(org), { recursive: true });
  const name = String(q.get("name") || "").replace(/[^\p{L}\p{N} ._()-]/gu, "").slice(0, 120);
  const base = { organization: org, keep: true, originalName: name, createdBy: session!.user._id };

  if (tipo === "logo") {
    const file = newName("png");
    let info;
    try {
      info = await sharp(buf, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 900, height: 450, fit: "inside", withoutEnlargement: true }).png().toFile(path.join(orgDir(org), file));
    } catch {
      throw new FriendlyError("Não foi possível ler esse logo. Envie PNG (de preferência com fundo transparente), JPG ou WebP.", 400);
    }
    const asset: any = await MediaAsset.create({ ...base, kind: "image", file, mime: "image/png", bytes: info.size, width: info.width, height: info.height, originalFormat: "logo" });
    const old: any = await BrandKit.findOneAndUpdate({ organization: org, project }, { $set: { logo: asset._id }, $setOnInsert: { organization: org, project } }, { upsert: true }).lean();
    if (old?.logo) await deleteAssets(org, { _id: old.logo, keep: true });
    return json({ _id: String(asset._id), url: mediaPath(org, file) }, 201);
  }

  const isMp3 = buf.subarray(0, 3).toString("latin1") === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
  const isM4a = buf.subarray(4, 8).toString("latin1") === "ftyp";
  if (!isMp3 && !isM4a) throw new FriendlyError("A trilha precisa ser MP3 ou M4A.", 415);
  const file = newName(isMp3 ? "mp3" : "m4a");
  const full = path.join(orgDir(org), file);
  await writeFile(full, buf, { mode: 0o640 });
  const p = await probe(full).catch(() => null);
  if (!p || !p.hasAudio || p.hasVideo || p.duration < 1 || p.duration > 600) {
    await rm(full, { force: true });
    throw new FriendlyError("Não foi possível ler essa trilha (precisa ser um áudio de até 10 minutos).", 400);
  }
  const asset: any = await MediaAsset.create({ ...base, kind: "audio", file, mime: isMp3 ? "audio/mpeg" : "audio/mp4", bytes: buf.length, durationMs: Math.round(p.duration * 1000), audioCodec: p.audioCodec, originalFormat: "trilha" });
  return json({ _id: String(asset._id), name, seconds: Math.round(p.duration) }, 201);
});

// Apaga um logo ou uma trilha (?id=). Só o que é da organização e foi guardado por aqui.
export const DELETE = route("org", async ({ org, req, id }) => {
  const assetId = id(req.nextUrl.searchParams.get("id"), "Arquivo");
  const asset: any = await MediaAsset.findOne({ organization: org, _id: assetId, keep: true }).lean();
  if (!asset) throw notFound("Arquivo");
  await BrandKit.updateMany({ organization: org, logo: assetId }, { $set: { logo: null } });
  await deleteAssets(org, { _id: assetId, keep: true });
  return json({ ok: true });
});
