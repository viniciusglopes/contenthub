import { open } from "node:fs/promises";
import { IG_LIMITS, type MediaProblem } from "./specs";

// Leitor mínimo de MP4/MOV (ISO BMFF): acha duração, tamanho, codec e quadros por segundo
// lendo só os cabeçalhos (ftyp + moov), sem carregar o vídeo e sem depender de ffmpeg.

export interface VideoInfo {
  brand: string;
  durationMs: number;
  width: number;
  height: number;
  fps: number | null;
  videoCodec: string;
  audioCodec: string;
  audioHz: number | null;
  audioChannels: number | null;
  /** o índice (moov) vem antes dos dados (mdat): o que a Meta pede */
  moovFirst: boolean;
  hasEditList: boolean;
}

export class VideoParseError extends Error {}

interface Box { type: string; start: number; size: number; header: number }

function boxAt(buf: Buffer, pos: number, end: number): Box | null {
  if (pos + 8 > end) return null;
  let size = buf.readUInt32BE(pos);
  const type = buf.toString("latin1", pos + 4, pos + 8);
  let header = 8;
  if (size === 1) {
    if (pos + 16 > end) return null;
    size = Number(buf.readBigUInt64BE(pos + 8));
    header = 16;
  } else if (size === 0) size = end - pos;
  if (size < header || pos + size > end) return null;
  return { type, start: pos, size, header };
}

function children(buf: Buffer, parent: Box, skip = 0): Box[] {
  const out: Box[] = [];
  let pos = parent.start + parent.header + skip;
  const end = parent.start + parent.size;
  while (pos < end) {
    const b = boxAt(buf, pos, end);
    if (!b) break;
    out.push(b);
    pos += b.size;
  }
  return out;
}
const child = (buf: Buffer, parent: Box, type: string) => children(buf, parent).find((b) => b.type === type);

const VIDEO_CODECS: Record<string, string> = { avc1: "h264", avc3: "h264", hvc1: "hevc", hev1: "hevc", mp4v: "mpeg4", vp09: "vp9", av01: "av1", "apch": "prores", "apcn": "prores", "apcs": "prores", "ap4h": "prores" };
const AUDIO_CODECS: Record<string, string> = { mp4a: "aac", "ac-3": "ac3", "ec-3": "eac3", Opus: "opus", "sowt": "pcm", "twos": "pcm", lpcm: "pcm", alac: "alac", ".mp3": "mp3" };

/** Lê os cabeçalhos de um arquivo MP4/MOV. Não é vídeo de verdade -> VideoParseError. */
export async function probeVideo(file: string): Promise<VideoInfo> {
  const fh = await open(file, "r");
  try {
    const { size: fileSize } = await fh.stat();
    const head = Buffer.alloc(16);
    let pos = 0;
    let brand = "";
    let moov: Buffer | null = null;
    let moovPos = -1;
    let mdatPos = -1;
    for (let guard = 0; pos + 8 <= fileSize && guard < 10_000; guard++) {
      await fh.read(head, 0, 16, pos);
      let size = head.readUInt32BE(0);
      const type = head.toString("latin1", 4, 8);
      let header = 8;
      if (size === 1) {
        size = Number(head.readBigUInt64BE(8));
        header = 16;
      } else if (size === 0) size = fileSize - pos;
      if (size < header) throw new VideoParseError("estrutura inválida");
      if (pos + size > fileSize) throw new VideoParseError("arquivo cortado: faltam dados no fim");
      if (guard === 0 && type !== "ftyp" && type !== "moov" && type !== "mdat" && type !== "free" && type !== "wide" && type !== "skip")
        throw new VideoParseError("não é MP4/MOV");
      if (type === "ftyp") {
        const b = Buffer.alloc(4);
        await fh.read(b, 0, 4, pos + header);
        brand = b.toString("latin1").trim();
      } else if (type === "moov") {
        if (size > 64 * 1024 * 1024) throw new VideoParseError("índice do vídeo grande demais");
        moov = Buffer.alloc(size);
        await fh.read(moov, 0, size, pos);
        moovPos = pos;
      } else if (type === "mdat" && mdatPos < 0) mdatPos = pos;
      pos += size;
    }
    if (!moov) throw new VideoParseError("vídeo incompleto (sem índice)");
    const root = boxAt(moov, 0, moov.length);
    if (!root) throw new VideoParseError("índice do vídeo inválido");

    const info: VideoInfo = {
      brand, durationMs: 0, width: 0, height: 0, fps: null, videoCodec: "", audioCodec: "", audioHz: null, audioChannels: null,
      moovFirst: mdatPos < 0 || moovPos < mdatPos, hasEditList: false,
    };
    const mvhd = child(moov, root, "mvhd");
    if (mvhd) {
      const p = mvhd.start + mvhd.header;
      const v = moov[p];
      const timescale = moov.readUInt32BE(p + (v === 1 ? 20 : 12));
      const duration = v === 1 ? Number(moov.readBigUInt64BE(p + 24)) : moov.readUInt32BE(p + 16);
      if (timescale > 0) info.durationMs = Math.round((duration / timescale) * 1000);
    }
    for (const trak of children(moov, root).filter((b) => b.type === "trak")) {
      const mdia = child(moov, trak, "mdia");
      if (!mdia) continue;
      const hdlr = child(moov, mdia, "hdlr");
      const handler = hdlr ? moov.toString("latin1", hdlr.start + hdlr.header + 8, hdlr.start + hdlr.header + 12) : "";
      const mdhd = child(moov, mdia, "mdhd");
      let trackSeconds = 0;
      if (mdhd) {
        const p = mdhd.start + mdhd.header;
        const v = moov[p];
        const ts = moov.readUInt32BE(p + (v === 1 ? 20 : 12));
        const dur = v === 1 ? Number(moov.readBigUInt64BE(p + 24)) : moov.readUInt32BE(p + 16);
        if (ts > 0) trackSeconds = dur / ts;
      }
      const minf = child(moov, mdia, "minf");
      const stbl = minf && child(moov, minf, "stbl");
      const stsd = stbl && child(moov, stbl, "stsd");
      if (!stsd) continue;
      const entry = boxAt(moov, stsd.start + stsd.header + 8, stsd.start + stsd.size);
      if (!entry) continue;
      const e = entry.start + entry.header;
      if (handler === "vide" && !info.videoCodec) {
        info.videoCodec = VIDEO_CODECS[entry.type] || entry.type.trim().toLowerCase();
        let w = moov.readUInt16BE(e + 24);
        let h = moov.readUInt16BE(e + 26);
        const tkhd = child(moov, trak, "tkhd");
        if (tkhd) {
          // matriz de rotação: vídeo de celular gravado em pé vem "deitado" + rotação de 90°
          const m = tkhd.start + tkhd.size - 8 - 36;
          const a = moov.readInt32BE(m);
          const b = moov.readInt32BE(m + 4);
          if (a === 0 && Math.abs(b) === 0x10000) [w, h] = [h, w];
        }
        info.width = w;
        info.height = h;
        const stts = child(moov, stbl!, "stts");
        if (stts && trackSeconds > 0) {
          const p = stts.start + stts.header;
          const n = moov.readUInt32BE(p + 4);
          let samples = 0;
          for (let i = 0; i < n && p + 8 + i * 8 + 8 <= stts.start + stts.size; i++) samples += moov.readUInt32BE(p + 8 + i * 8);
          if (samples > 0) info.fps = Math.round((samples / trackSeconds) * 100) / 100;
        }
        const edts = child(moov, trak, "edts");
        const elst = edts && child(moov, edts, "elst");
        // uma lista de edição com mais de um trecho é a que a Meta recusa; a de um trecho só é comum e inofensiva
        if (elst && moov.readUInt32BE(elst.start + elst.header + 4) > 1) info.hasEditList = true;
        if (!info.durationMs && trackSeconds) info.durationMs = Math.round(trackSeconds * 1000);
      } else if (handler === "soun" && !info.audioCodec) {
        info.audioCodec = AUDIO_CODECS[entry.type] || entry.type.trim().toLowerCase();
        info.audioChannels = moov.readUInt16BE(e + 16);
        info.audioHz = moov.readUInt32BE(e + 24) >>> 16;
      }
    }
    if (!info.videoCodec || !info.width || !info.height) throw new VideoParseError("o arquivo não tem faixa de vídeo");
    return info;
  } finally {
    await fh.close();
  }
}

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}`;

/** Confere o vídeo contra as regras de Reels da Meta. "erro" impede aprovar; "aviso" não. */
export function videoProblems(v: VideoInfo, bytes: number): MediaProblem[] {
  const L = IG_LIMITS.video;
  const out: MediaProblem[] = [];
  const err = (code: string, message: string) => out.push({ code, level: "erro", message });
  const warn = (code: string, message: string) => out.push({ code, level: "aviso", message });
  if (v.videoCodec !== "h264" && v.videoCodec !== "hevc")
    err("codec_video", `O vídeo está em um formato que o Instagram não aceita (${v.videoCodec || "desconhecido"}). Exporte de novo em MP4 (H.264).`);
  if (v.audioCodec && v.audioCodec !== "aac")
    err("codec_audio", `O som do vídeo está em um formato que o Instagram não aceita (${v.audioCodec}). Exporte de novo em MP4 com áudio AAC.`);
  if (v.durationMs < L.minSeconds * 1000) err("duracao", `O vídeo tem ${mmss(v.durationMs)}. O Instagram pede no mínimo ${L.minSeconds} segundos.`);
  if (v.durationMs > L.maxSeconds * 1000) err("duracao", `O vídeo tem ${mmss(v.durationMs)}. O Instagram aceita no máximo 15 minutos.`);
  if (bytes > L.maxBytes) err("tamanho", "O vídeo passa de 300 MB, o máximo que o Instagram aceita.");
  if (Math.min(v.width, v.height) > 0 && v.width > L.maxWidth)
    err("largura", `O vídeo tem ${v.width} pixels de largura. O Instagram aceita até ${L.maxWidth}. Exporte em 1080p.`);
  if (v.fps != null && (v.fps < L.minFps - 0.5 || v.fps > L.maxFps + 0.5))
    err("fps", `O vídeo tem ${String(v.fps).replace(".", ",")} quadros por segundo. O Instagram aceita de ${L.minFps} a ${L.maxFps}.`);
  if (v.audioHz && v.audioHz > L.maxAudioHz) warn("audio_hz", "O som do vídeo está acima de 48 kHz; o Instagram pode recusar.");
  if (v.durationMs > 0 && (bytes * 8) / (v.durationMs / 1000) > L.maxBitrate)
    warn("bitrate", "O vídeo está muito pesado para a duração (acima de 25 Mbps); o Instagram pode recusar. Exporte com qualidade um pouco menor.");
  if (!v.moovFirst) warn("moov", "O vídeo não foi exportado para internet (início rápido). Costuma funcionar, mas o Instagram pode demorar ou recusar.");
  if (v.hasEditList) warn("edicao", "O vídeo tem cortes guardados no arquivo; se o Instagram recusar, exporte de novo.");
  const r = v.width / v.height;
  if (r > 0.6 || r < 0.5) warn("proporcao_reel", "O ideal para Reels é vídeo em pé (9:16, como 1080 x 1920). Fora disso o Instagram mostra com faixas ou corta.");
  return out;
}
