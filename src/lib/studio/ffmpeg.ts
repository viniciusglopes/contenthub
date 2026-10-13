import { writeFile } from "node:fs/promises";
import path from "node:path";
import { runProcess } from "./engine";

/* eslint-disable @typescript-eslint/no-explicit-any */

// MONTAGEM DO REEL com ffmpeg: 1080x1920, 30 quadros por segundo, H.264 (yuv420p) + AAC 48 kHz,
// moov no início (faststart), dentro do que a Meta aceita para Reels (src/lib/media/specs.ts).
// Todo texto chega pronto em PNG (motor de arte): aqui só há movimento, tempo e som. Os comandos
// são montados em lista de argumentos (sem shell) e só com caminhos e números gerados por nós.

export const REEL = { width: 1080, height: 1920, fps: 30, audioHz: 48_000 } as const;
const FF = () => process.env.FFMPEG_PATH || "ffmpeg";
const FP = () => process.env.FFPROBE_PATH || "ffprobe";

export class FfmpegError extends Error {}

async function ff(args: string[], timeoutMs = 300_000): Promise<void> {
  const r = await runProcess(FF(), ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...args], { timeoutMs });
  if (r.timedOut) throw new FfmpegError("o ffmpeg passou do tempo máximo");
  if (r.code !== 0) throw new FfmpegError(`ffmpeg saiu com ${r.code}: ${r.stderr.slice(-500)}`);
}

export interface Probe { duration: number; width: number; height: number; fps: number; videoCodec: string; pixFmt: string; audioCodec: string; audioHz: number; hasAudio: boolean; hasVideo: boolean }
export async function probe(file: string): Promise<Probe> {
  const r = await runProcess(FP(), ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { timeoutMs: 30_000 });
  if (r.code !== 0) throw new FfmpegError(`ffprobe não leu o arquivo: ${r.stderr.slice(-200)}`);
  const j: any = JSON.parse(r.stdout);
  const v = (j.streams || []).find((s: any) => s.codec_type === "video");
  const a = (j.streams || []).find((s: any) => s.codec_type === "audio");
  const [n, d] = String(v?.avg_frame_rate || "0/1").split("/").map(Number);
  return {
    duration: Number(j.format?.duration || v?.duration || a?.duration || 0), width: v?.width || 0, height: v?.height || 0, fps: d ? n / d : 0,
    videoCodec: v?.codec_name || "", pixFmt: v?.pix_fmt || "", audioCodec: a?.codec_name || "", audioHz: Number(a?.sample_rate || 0), hasAudio: Boolean(a), hasVideo: Boolean(v),
  };
}

export interface Layer { arquivo: string; caixa: [number, number, number, number] | null }
export interface SceneBuild {
  /** imagem de fundo em 2x (do motor de arte) OU um clipe de vídeo */
  fundo: string | null;
  clip?: string | null;
  veu?: { cor: string; alfa: number } | null;
  fixo: Layer;
  titulo: Layer;
  legendas: (Layer & { start: number; end: number })[];
  duration: number;
  voice?: string | null;
}

const n3 = (v: number) => (Math.round(v * 1000) / 1000).toFixed(3);

/** Uma cena: fundo com movimento suave, título que entra, legendas no tempo certo. */
async function buildScene(s: SceneBuild, k: number, total: number, out: string): Promise<void> {
  const D = s.duration;
  const frames = Math.max(1, Math.round(D * REEL.fps));
  const inputs: string[] = [];
  const img = (file: string) => inputs.push("-loop", "1", "-framerate", String(REEL.fps), "-t", n3(D), "-i", file);
  const size = `${REEL.width}x${REEL.height}`;
  let chain: string;
  if (s.clip) {
    inputs.push("-stream_loop", "-1", "-t", n3(D), "-i", s.clip);
    const veil = s.veu ? `,drawbox=x=0:y=0:w=iw:h=ih:color=0x${s.veu.cor.replace("#", "")}@${s.veu.alfa}:t=fill` : "";
    chain = `[0:v]scale=${REEL.width}:${REEL.height}:force_original_aspect_ratio=increase,crop=${REEL.width}:${REEL.height},fps=${REEL.fps},setsar=1${veil}[bg]`;
  } else {
    img(s.fundo!);
    // zoom lento: cenas pares aproximam, ímpares afastam (o fundo vem em 2x para o movimento não serrilhar)
    const z = k % 2 ? `1+0.07*on/${frames}` : `1.07-0.07*on/${frames}`;
    chain = `[0:v]zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${size}:fps=${REEL.fps},setsar=1[bg]`;
  }
  let last = "bg";
  let idx = 1;
  const parts = [chain];
  if (s.fixo.caixa) {
    img(s.fixo.arquivo);
    parts.push(`[${last}][${idx}:v]overlay=${s.fixo.caixa[0]}:${s.fixo.caixa[1]}[f${idx}]`);
    last = `f${idx++}`;
  }
  if (s.titulo.caixa) {
    img(s.titulo.arquivo);
    const [x, y] = s.titulo.caixa;
    // o título entra subindo 28 px enquanto aparece
    parts.push(`[${idx}:v]format=rgba,fade=t=in:st=0.12:d=0.45:alpha=1[t${idx}]`);
    parts.push(`[${last}][t${idx}]overlay=x=${x}:y='${y}+28*(1-min(max(t-0.12,0)/0.45,1))'[f${idx}]`);
    last = `f${idx++}`;
  }
  for (const l of s.legendas) {
    if (!l.caixa) continue;
    img(l.arquivo);
    parts.push(`[${last}][${idx}:v]overlay=${l.caixa[0]}:${l.caixa[1]}:enable='between(t,${n3(l.start)},${n3(l.end)})'[f${idx}]`);
    last = `f${idx++}`;
  }
  const fades = [k === 1 ? "fade=t=in:st=0:d=0.3" : "", k === total ? `fade=t=out:st=${n3(Math.max(0, D - 0.4))}:d=0.4` : ""].filter(Boolean);
  parts.push(`[${last}]${[...fades, "format=yuv420p"].join(",")}[v]`);
  await ff([...inputs, "-filter_complex", parts.join(";"), "-map", "[v]", "-t", n3(D), "-r", String(REEL.fps), "-an",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-profile:v", "high", "-pix_fmt", "yuv420p", "-video_track_timescale", "15360", out]);
}

async function sceneAudio(s: SceneBuild, out: string): Promise<void> {
  const tail = ["-t", n3(s.duration), "-ar", String(REEL.audioHz), "-ac", "2", "-c:a", "pcm_s16le", out];
  if (s.voice) await ff(["-i", s.voice, "-af", "adelay=150|150,apad", ...tail]);
  else await ff(["-f", "lavfi", "-i", `anullsrc=r=${REEL.audioHz}:cl=stereo`, ...tail]);
}

/**
 * Monta o Reel inteiro em `out` (MP4). `music` = trilha opcional (entra baixa, some no fim).
 * Sem voz e sem trilha o arquivo leva uma faixa de áudio em silêncio (a Meta espera AAC).
 */
export async function assembleReel(opts: { work: string; scenes: SceneBuild[]; out: string; music?: string | null; onProgress?: (done: number, total: number) => Promise<void> | void }): Promise<Probe> {
  const { work, scenes } = opts;
  const vids: string[] = [];
  const auds: string[] = [];
  for (const [i, s] of scenes.entries()) {
    const v = path.join(work, `cena_${String(i + 1).padStart(2, "0")}.mp4`);
    const a = path.join(work, `cena_${String(i + 1).padStart(2, "0")}.wav`);
    await buildScene(s, i + 1, scenes.length, v);
    await sceneAudio(s, a);
    vids.push(v);
    auds.push(a);
    await opts.onProgress?.(i + 1, scenes.length);
  }
  const total = scenes.reduce((n, s) => n + s.duration, 0);
  const lists = [path.join(work, "video.txt"), path.join(work, "audio.txt")];
  await writeFile(lists[0], vids.map((f) => `file '${f}'`).join("\n"));
  await writeFile(lists[1], auds.map((f) => `file '${f}'`).join("\n"));
  const args = ["-f", "concat", "-safe", "0", "-i", lists[0], "-f", "concat", "-safe", "0", "-i", lists[1]];
  if (opts.music) {
    args.push("-stream_loop", "-1", "-i", opts.music, "-filter_complex",
      `[2:a]aresample=${REEL.audioHz},volume=0.16,afade=t=in:st=0:d=0.6,afade=t=out:st=${n3(Math.max(0, total - 1.2))}:d=1.2[m];[1:a][m]amix=inputs=2:duration=first:normalize=0[a]`, "-map", "0:v", "-map", "[a]");
  } else args.push("-map", "0:v", "-map", "1:a");
  await ff([...args, "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-ar", String(REEL.audioHz), "-ac", "2", "-t", n3(total), "-movflags", "+faststart", opts.out]);
  return probe(opts.out);
}

/** Um quadro do vídeo em PNG (para capa e conferência). */
export async function frameAt(video: string, seconds: number, out: string): Promise<void> {
  await ff(["-ss", n3(seconds), "-i", video, "-frames:v", "1", out], 60_000);
}
