/* eslint-disable @typescript-eslint/no-explicit-any */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// SIMULADOR DOS PROVEDORES DE IA. Nenhum teste fala com provedor de verdade (não existe chave):
// toda a rede do Estúdio passa por aqui. Dá para mandar um serviço falhar, demorar ou devolver
// um texto específico, e conferir depois o que foi chamado.

export interface FakeCall { service: string; kind: string; url: string; body: any; headers: Record<string, string> }
export interface Fake {
  calls: FakeCall[];
  /** serviço (ou "serviço:tipo") -> status HTTP de erro */
  fail: Record<string, number>;
  /** serviço -> atraso em ms */
  delay: Record<string, number>;
  /** texto que o modelo de linguagem devolve (por serviço, ou "*"): string ou fila de strings */
  text: Record<string, string | string[]>;
  /** quantas consultas o vídeo fica "em andamento" antes de ficar pronto */
  videoPolls: number;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  count: (service: string, kind?: string) => number;
  reset: () => void;
}

let media: { mp3: Buffer; wav: Buffer; mp4: Buffer; jpg: Buffer } | null = null;
/** Áudio, vídeo e imagem pequenos e VÁLIDOS, feitos uma vez com o ffmpeg da máquina. */
export function fakeMedia() {
  if (media) return media;
  const dir = mkdtempSync(path.join(os.tmpdir(), "estudio-fake-"));
  const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
  ff(["-f", "lavfi", "-i", "sine=frequency=330:duration=1.6", "-ar", "44100", "-b:a", "96k", path.join(dir, "a.mp3")]);
  ff(["-f", "lavfi", "-i", "sine=frequency=330:duration=1.6", "-ar", "24000", "-ac", "1", path.join(dir, "a.wav")]);
  ff(["-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=24:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", path.join(dir, "v.mp4")]);
  ff(["-f", "lavfi", "-i", "color=c=0xC8D4D0:size=768x1376", "-frames:v", "1", path.join(dir, "i.jpg")]);
  media = { mp3: readFileSync(path.join(dir, "a.mp3")), wav: readFileSync(path.join(dir, "a.wav")), mp4: readFileSync(path.join(dir, "v.mp4")), jpg: readFileSync(path.join(dir, "i.jpg")) };
  rmSync(dir, { recursive: true, force: true });
  return media;
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const bytes = (b: Buffer) => new Response(new Uint8Array(b), { status: 200 });

export function studioFake(): Fake {
  const polls = new Map<string, number>();
  const f: Fake = {
    calls: [], fail: {}, delay: {}, text: {}, videoPolls: 0,
    count: (service, kind) => f.calls.filter((c) => c.service === service && (!kind || c.kind === kind)).length,
    reset: () => { f.calls = []; f.fail = {}; f.delay = {}; f.text = {}; f.videoPolls = 0; polls.clear(); },
    fetch: async (url, init) => {
      const u = new URL(url);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      const headers = Object.fromEntries(Object.entries((init?.headers || {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
      const host = u.hostname;
      if (host === "olinda.bcb.gov.br") return json({ value: [{ cotacaoVenda: 5, dataHoraCotacao: "2026-10-09 13:07:00.000" }] });
      const service = host.includes("anthropic") ? "anthropic" : host.includes("googleapis") ? "google" : host.includes("openai") ? "openai" : host.includes("elevenlabs") ? "elevenlabs" : host.includes("runwayml") ? "runway" : host.includes("lumalabs") ? "luma" : host.includes("klingai") ? "kling" : host === "videos.fake.test" ? "cdn" : "?";
      const p = u.pathname;
      const kind =
        service === "cdn" ? "download"
        : init?.method !== "POST" && /\/models$|\/organization$|subscription$|account\/costs$/.test(p) ? "test"
        : /messages$|generateContent$|responses$/.test(p) ? "text"
        : /text-to-speech|audio\/speech/.test(p) || body?.response_format?.type === "audio" ? "voice"
        : /images\/generations/.test(p) || body?.response_format?.type === "image" ? "image"
        : /predictLongRunning$|text_to_video$|generations$|text-to-video/.test(p) && init?.method === "POST" ? "video"
        : "poll";
      f.calls.push({ service, kind, url, body, headers });
      if (f.delay[service]) await new Promise((r) => setTimeout(r, f.delay[service]));
      if (init?.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      const status = f.fail[`${service}:${kind}`] ?? f.fail[service];
      if (status) return json({ error: { message: status === 402 ? "insufficient credit balance" : "simulated failure" } }, status);
      // a chave tem de chegar no cabeçalho certo e nunca no endereço
      const key = headers["x-api-key"] || headers["x-goog-api-key"] || headers["xi-api-key"] || headers.authorization || "";
      if (service !== "cdn" && !key) return json({ error: "sem chave" }, 401);
      if (/chave-invalida/.test(key)) return json({ error: "invalid api key" }, 401);

      if (kind === "test") return json(service === "elevenlabs" ? { tier: "creator", character_count: 1200, character_limit: 100000 } : service === "runway" ? { creditBalance: 1500 } : service === "kling" ? { code: 0, data: {} } : { data: [{ id: "m1" }, { id: "m2" }], models: [{ name: "m1" }] });
      if (kind === "text") {
        const q = f.text[service] ?? f.text["*"] ?? "{}";
        const text = Array.isArray(q) ? (q.length > 1 ? q.shift()! : q[0]) : q;
        if (service === "anthropic") return json({ content: [{ type: "thinking", thinking: "..." }, { type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 500 } });
        if (service === "google") return json({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 } });
        return json({ output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text }] }], usage: { input_tokens: 1000, output_tokens: 500 } });
      }
      const m = fakeMedia();
      if (kind === "voice") return service === "google" ? json({ steps: [{ type: "model_output", content: [{ type: "audio", data: m.wav.toString("base64") }] }] }) : bytes(m.mp3);
      if (kind === "image") return service === "google" ? json({ steps: [{ type: "model_output", content: [{ type: "image", data: m.jpg.toString("base64") }] }] }) : json({ data: [{ b64_json: m.jpg.toString("base64") }] });
      if (kind === "video") {
        const id = `${service}-${f.calls.length}`;
        polls.set(id, 0);
        return json(service === "google" ? { name: `operations/${id}` } : service === "kling" ? { code: 0, data: { id, status: "submitted" } } : service === "luma" ? { id, state: "queued" } : { id });
      }
      if (kind === "poll") {
        const id = decodeURIComponent(service === "kling" ? u.searchParams.get("task_ids") || "" : p.split("/").pop() || "");
        const n = (polls.get(id) ?? 0) + 1;
        polls.set(id, n);
        const done = n > f.videoPolls;
        const link = `https://videos.fake.test/${id}.mp4`;
        if (service === "google") return json(done ? { done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: link } }] } } } : { done: false });
        if (service === "runway") return json(done ? { status: "SUCCEEDED", output: [link] } : { status: "RUNNING", progress: 0.4 });
        if (service === "luma") return json(done ? { state: "completed", output: [{ url: link }] } : { state: "dreaming" });
        return json({ code: 0, data: [done ? { status: "succeeded", outputs: [{ type: "video", url: link }] } : { status: "processing" }] });
      }
      if (kind === "download") return bytes(m.mp4);
      return json({ error: "rota não simulada" }, 404);
    },
  };
  return f;
}

export const PALETTE = { background: "#F6F2EA", text: "#14323B", accent: "#A47C48", support: "#DCE5E2" };
export const KIT_DENTISTA = {
  name: "Dr. Waldir Lopes", handle: "@drwaldirlopes", profession: "Cirurgião-dentista", registration: "", segment: "Odontologia, estética do sorriso",
  offer: "Avaliação e tratamentos de estética do sorriso", audience: "Adultos que pensam em melhorar a estética do sorriso", city: "",
  tone: { adjectives: ["sereno", "preciso", "acolhedor"], avoid: ["promessa de resultado", "exclamações"] }, palette: PALETTE, fontPair: "serifa", sector: "odontologia",
};

const LEGENDA = "Clareamento dental é cercado de crenças, algumas verdadeiras e outras nem tanto. Separamos as mais repetidas para explicar o que a odontologia sabe sobre cada uma. Salve para consultar depois.";
export const HASHTAGS = ["#clareamentodental", "#saudebucal", "#odontologia"];
export const ROTEIRO_CURTO = {
  modelo: "editorial",
  slides: [
    { tipo: "capa", kicker: "Clareamento dental", titulo: "O que é *mito* e o que é verdade", texto: "Afirmações que todo mundo já ouviu, explicadas com calma." },
    { tipo: "conteudo", selo: "Mito", selo_tom: "vazado", titulo: "Clareamento desgasta o esmalte.", texto: "Com indicação e acompanhamento do dentista, o gel clareador age nos pigmentos, sem lixar nem remover camadas do dente." },
    { tipo: "cta", kicker: "Antes de clarear", titulo: "Primeiro, uma *avaliação*", texto: "O caminho indicado para o seu caso depende da avaliação do dentista.", acao: "Salve para reler antes da consulta" },
  ],
  legenda: LEGENDA, hashtags: HASHTAGS,
};
export const REEL_CURTO = {
  cenas: [
    { kicker: "Clareamento dental", titulo: "O que é *mito* e o que é verdade", narracao: "Duas afirmações que todo mundo já ouviu." },
    { kicker: "Mito", titulo: "Clareamento desgasta o esmalte.", narracao: "Com acompanhamento do dentista, o gel age nos pigmentos, sem lixar o dente.", prompt_visual: "bancada clara de consultório com luz natural" },
    { kicker: "Antes de clarear", titulo: "Primeiro, uma *avaliação*", narracao: "O caminho depende da avaliação do dentista.", acao: "Salve para reler depois", prompt_visual: "sala de espera clara e vazia" },
  ],
  legenda: LEGENDA, hashtags: HASHTAGS,
};
