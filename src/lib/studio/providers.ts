import { type Purpose, clipSeconds, costUsd, modelSpec, tokensOf } from "./catalog";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ADAPTADORES DOS PROVEDORES DE IA. Só transportam: montam o pedido, leem a resposta e
// classificam o erro. Escritos pela documentação oficial lida em 12/10/2026
// (docs/estudio-provedores.md); até esta entrega NENHUM foi chamado de verdade, porque não
// existe chave cadastrada. Toda saída é tratada como dado e conferida por quem chama.
// A chave vai só em cabeçalho; nunca em endereço, registro ou mensagem de erro.

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
let override: FetchFn | null = null;
/** Os testes trocam a rede inteira do Estúdio por um simulador. */
export function setStudioFetch(fn: FetchFn | null): void {
  override = fn;
}
export const studioFetch: FetchFn = (url, init) => (override ? override(url, init) : fetch(url, init));

export type ErrorKind = "chave" | "saldo" | "limite" | "tempo" | "rede" | "recusado" | "invalido" | "provedor";
export class ProviderError extends Error {
  kind: ErrorKind;
  constructor(kind: ErrorKind, message: string) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
  }
}

export interface Key { service: string; apiKey: string; model: string; extra?: Record<string, string> }

async function http(url: string, init: RequestInit & { signal?: AbortSignal }, as: "json" | "bytes" = "json"): Promise<any> {
  let res: Response;
  try {
    res = await studioFetch(url, init);
  } catch (e) {
    throw new ProviderError((e as any)?.name === "AbortError" || (e as any)?.name === "TimeoutError" ? "tempo" : "rede", "sem resposta do provedor");
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 400).toLowerCase();
    const kind: ErrorKind =
      res.status === 402 || /insufficient|credit|quota|billing|balance|saldo|payment/.test(body) ? "saldo"
      : res.status === 401 || res.status === 403 ? "chave"
      : res.status === 429 ? "limite"
      : res.status === 408 ? "tempo"
      : res.status >= 500 ? "provedor"
      : "recusado";
    throw new ProviderError(kind, `HTTP ${res.status}`);
  }
  if (as === "bytes") return Buffer.from(await res.arrayBuffer());
  return res.json().catch(() => {
    throw new ProviderError("invalido", "resposta sem JSON");
  });
}
const J = { "Content-Type": "application/json" };
const post = (url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal, as: "json" | "bytes" = "json") =>
  http(url, { method: "POST", headers: { ...J, ...headers }, body: JSON.stringify(body), signal }, as);
const get = (url: string, headers: Record<string, string>, signal?: AbortSignal, as: "json" | "bytes" = "json") => http(url, { method: "GET", headers, signal }, as);

const anthropicH = (k: Key) => ({ "X-Api-Key": k.apiKey, "anthropic-version": "2023-06-01" });
const googleH = (k: Key) => ({ "x-goog-api-key": k.apiKey });
const bearer = (k: Key) => ({ Authorization: `Bearer ${k.apiKey}` });
const GOOGLE = "https://generativelanguage.googleapis.com/v1beta";
const RUNWAY = "https://api.dev.runwayml.com";
const runwayH = (k: Key) => ({ ...bearer(k), "X-Runway-Version": "2024-11-06" });
const LUMA = "https://agents.lumalabs.ai/v1";
const KLING = "https://api-singapore.klingai.com";

const need = (v: unknown, what: string) => {
  if (v === undefined || v === null || v === "") throw new ProviderError("invalido", `resposta sem ${what}`);
  return v;
};
/** conteúdo de um tipo dentro da resposta de /interactions do Gemini */
function interactionPart(r: any, type: string): any {
  for (const step of r?.steps || []) if (step?.type === "model_output") for (const c of step.content || []) if (c?.type === type) return c;
  return null;
}

// ---------- TEXTO ----------
export interface TextRequest { system: string; user: string; maxTokens: number }
export interface TextResult { text: string; inTokens: number; outTokens: number }
export const TEXT: Record<string, (k: Key, r: TextRequest, signal?: AbortSignal) => Promise<TextResult>> = {
  async anthropic(k, r, signal) {
    // sem temperature/top_p: os modelos atuais recusam valor diferente do padrão
    const d = await post("https://api.anthropic.com/v1/messages", anthropicH(k), { model: k.model, max_tokens: r.maxTokens, system: r.system, messages: [{ role: "user", content: r.user }] }, signal);
    if (d.stop_reason === "refusal") throw new ProviderError("recusado", "o modelo recusou o pedido");
    const text = (d.content || []).filter((c: any) => c?.type === "text").map((c: any) => c.text).join("");
    return { text: String(need(text, "texto")), inTokens: d.usage?.input_tokens ?? tokensOf(r.system + r.user), outTokens: d.usage?.output_tokens ?? tokensOf(text) };
  },
  async google(k, r, signal) {
    const d = await post(`${GOOGLE}/models/${encodeURIComponent(k.model)}:generateContent`, googleH(k), { contents: [{ role: "user", parts: [{ text: r.user }] }], systemInstruction: { parts: [{ text: r.system }] }, generationConfig: { maxOutputTokens: r.maxTokens * 2 } }, signal);
    const text = (d.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || "").join("");
    return { text: String(need(text, "texto")), inTokens: d.usageMetadata?.promptTokenCount ?? tokensOf(r.system + r.user), outTokens: d.usageMetadata?.candidatesTokenCount ?? tokensOf(text) };
  },
  async openai(k, r, signal) {
    const d = await post("https://api.openai.com/v1/responses", bearer(k), { model: k.model, instructions: r.system, input: r.user }, signal);
    const text = (d.output || []).filter((o: any) => o?.type === "message").flatMap((o: any) => o.content || []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text).join("");
    return { text: String(need(text, "texto")), inTokens: d.usage?.input_tokens ?? tokensOf(r.system + r.user), outTokens: d.usage?.output_tokens ?? tokensOf(text) };
  },
};

// ---------- VOZ ----------
export interface VoiceResult { audio: Buffer; ext: "mp3" | "wav" }
export const VOICE: Record<string, (k: Key, text: string, signal?: AbortSignal) => Promise<VoiceResult>> = {
  async elevenlabs(k, text, signal) {
    const voice = k.extra?.voiceId;
    if (!voice || !/^[A-Za-z0-9]{8,40}$/.test(voice)) throw new ProviderError("recusado", "falta o ID da voz na chave da ElevenLabs");
    const audio = await post(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, { "xi-api-key": k.apiKey }, { text, model_id: k.model }, signal, "bytes");
    return { audio, ext: "mp3" };
  },
  async openai(k, text, signal) {
    const voice = /^[a-z]{3,12}$/.test(k.extra?.voice || "") ? k.extra!.voice : "coral";
    const audio = await post("https://api.openai.com/v1/audio/speech", bearer(k), { model: k.model, input: text, voice, response_format: "mp3" }, signal, "bytes");
    return { audio, ext: "mp3" };
  },
  async google(k, text, signal) {
    const d = await post(`${GOOGLE}/interactions`, googleH(k), {
      model: k.model,
      input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: "narração calma e clara em português do Brasil" }] }] }],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: "Kore" }] },
    }, signal);
    return { audio: Buffer.from(String(need(interactionPart(d, "audio")?.data, "áudio")), "base64"), ext: "wav" };
  },
};

// ---------- IMAGEM (vertical, para fundo de cena) ----------
export const IMAGE: Record<string, (k: Key, prompt: string, signal?: AbortSignal) => Promise<Buffer>> = {
  async google(k, prompt, signal) {
    const d = await post(`${GOOGLE}/interactions`, googleH(k), { model: k.model, input: prompt, response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "9:16", image_size: "1K" } }, signal);
    return Buffer.from(String(need(interactionPart(d, "image")?.data, "imagem")), "base64");
  },
  async openai(k, prompt, signal) {
    const d = await post("https://api.openai.com/v1/images/generations", bearer(k), { model: k.model, prompt, size: "1024x1536", quality: "medium", n: 1 }, signal);
    return Buffer.from(String(need(d.data?.[0]?.b64_json, "imagem")), "base64");
  },
};

// ---------- VÍDEO (assíncrono: pedir, consultar, baixar) ----------
export interface VideoPoll { state: "pending" | "done" | "failed"; url?: string; error?: string }
export interface VideoAdapter {
  submit(k: Key, req: { prompt: string; seconds: number }, signal?: AbortSignal): Promise<{ id: string }>;
  poll(k: Key, id: string, signal?: AbortSignal): Promise<VideoPoll>;
  /** cabeçalhos para baixar o arquivo (o Veo exige a chave) */
  downloadHeaders?(k: Key): Record<string, string>;
}
export const VIDEO: Record<string, VideoAdapter> = {
  google: {
    async submit(k, req, signal) {
      const d = await post(`${GOOGLE}/models/${encodeURIComponent(k.model)}:predictLongRunning`, googleH(k), { instances: [{ prompt: req.prompt }], parameters: { aspectRatio: "9:16", resolution: "720p", durationSeconds: req.seconds } }, signal);
      return { id: String(need(d.name, "operação")) };
    },
    async poll(k, id, signal) {
      if (!/^[A-Za-z0-9._\-/]{3,300}$/.test(id) || id.includes("..")) throw new ProviderError("invalido", "operação inválida");
      const d = await get(`${GOOGLE}/${id}`, googleH(k), signal);
      if (d.error) return { state: "failed", error: "o provedor não gerou o vídeo" };
      if (!d.done) return { state: "pending" };
      const url = d.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      return url ? { state: "done", url } : { state: "failed", error: "o provedor terminou sem vídeo (pedido possivelmente barrado pelo filtro dele)" };
    },
    downloadHeaders: (k) => googleH(k),
  },
  runway: {
    async submit(k, req, signal) {
      const d = await post(`${RUNWAY}/v1/text_to_video`, runwayH(k), { model: k.model, promptText: req.prompt, ratio: "720:1280", duration: req.seconds }, signal);
      return { id: String(need(d.id, "tarefa")) };
    },
    async poll(k, id, signal) {
      const d = await get(`${RUNWAY}/v1/tasks/${encodeURIComponent(id)}`, runwayH(k), signal);
      if (d.status === "SUCCEEDED") return d.output?.[0] ? { state: "done", url: d.output[0] } : { state: "failed", error: "tarefa concluída sem vídeo" };
      if (d.status === "FAILED" || d.status === "CANCELLED" || d.status === "CANCELED") return { state: "failed", error: /SAFETY/i.test(String(d.failureCode)) ? "o filtro de segurança do provedor barrou a cena" : "o provedor não gerou o vídeo" };
      return { state: "pending" };
    },
  },
  luma: {
    async submit(k, req, signal) {
      const d = await post(`${LUMA}/generations`, bearer(k), { model: k.model, type: "video", prompt: req.prompt, aspect_ratio: "9:16", video: { resolution: "720p", duration: `${req.seconds}s` } }, signal);
      return { id: String(need(d.id, "geração")) };
    },
    async poll(k, id, signal) {
      const d = await get(`${LUMA}/generations/${encodeURIComponent(id)}`, bearer(k), signal);
      if (d.state === "completed") return d.output?.[0]?.url ? { state: "done", url: d.output[0].url } : { state: "failed", error: "geração concluída sem vídeo" };
      if (d.state === "failed") return { state: "failed", error: "o provedor não gerou o vídeo" };
      return { state: "pending" };
    },
  },
  kling: {
    async submit(k, req, signal) {
      const d = await post(`${KLING}/text-to-video/${encodeURIComponent(k.model)}`, bearer(k), { prompt: req.prompt, settings: { duration: req.seconds, resolution: "720p", aspect_ratio: "9:16" } }, signal);
      if (d.code !== 0) throw new ProviderError("recusado", "pedido recusado");
      return { id: String(need(d.data?.id, "tarefa")) };
    },
    async poll(k, id, signal) {
      const d = await get(`${KLING}/tasks?task_ids=${encodeURIComponent(id)}`, bearer(k), signal);
      const t = d.data?.[0];
      if (t?.status === "succeeded") {
        const url = (t.outputs || []).find((o: any) => o?.type === "video")?.url;
        return url ? { state: "done", url } : { state: "failed", error: "tarefa concluída sem vídeo" };
      }
      if (t?.status === "failed") return { state: "failed", error: "o provedor não gerou o vídeo" };
      return { state: "pending" };
    },
  },
};

const MAX_DOWNLOAD = 200 * 1024 * 1024;
/** Baixa o vídeo pronto (só https). */
export async function downloadVideo(k: Key, url: string, signal?: AbortSignal): Promise<Buffer> {
  if (!/^https:\/\//i.test(url)) throw new ProviderError("invalido", "endereço do vídeo não é https");
  const buf: Buffer = await get(url, VIDEO[k.service]?.downloadHeaders?.(k) || {}, signal, "bytes");
  if (buf.length < 1000 || buf.length > MAX_DOWNLOAD) throw new ProviderError("invalido", "arquivo de vídeo fora do tamanho esperado");
  return buf;
}

// ---------- TESTAR CHAVE: uma consulta de leitura, que não gera nada ----------
export interface TestResult { ok: boolean; message: string }
const TESTS: Record<string, (k: Key, signal: AbortSignal) => Promise<string>> = {
  anthropic: async (k, s) => { const d = await get("https://api.anthropic.com/v1/models", anthropicH(k), s); return `Chave aceita (${(d.data || []).length} modelos disponíveis).`; },
  google: async (k, s) => { const d = await get(`${GOOGLE}/models`, googleH(k), s); return `Chave aceita (${(d.models || []).length} modelos disponíveis).`; },
  openai: async (k, s) => { const d = await get("https://api.openai.com/v1/models", bearer(k), s); return `Chave aceita (${(d.data || []).length} modelos disponíveis).`; },
  elevenlabs: async (k, s) => {
    const d = await get("https://api.elevenlabs.io/v1/user/subscription", { "xi-api-key": k.apiKey }, s);
    const left = Number(d.character_limit) - Number(d.character_count);
    return `Chave aceita. Plano ${String(d.tier || "?").slice(0, 30)}${Number.isFinite(left) ? `, ${left.toLocaleString("pt-BR")} caracteres restantes` : ""}.`;
  },
  runway: async (k, s) => { const d = await get(`${RUNWAY}/v1/organization`, runwayH(k), s); return `Chave aceita. Saldo: ${Number(d.creditBalance ?? 0).toLocaleString("pt-BR")} créditos.`; },
  kling: async (k, s) => { const now = Date.now(); const d = await get(`${KLING}/account/costs?start_time=${now - 30 * 86_400_000}&end_time=${now}`, bearer(k), s); if (d.code !== 0) throw new ProviderError("chave", "recusada"); return "Chave aceita."; },
};
const TEST_FAIL: Record<ErrorKind, string> = {
  chave: "O provedor recusou a chave. Confira se copiou inteira e se ela está ativa.", saldo: "A chave é válida, mas a conta está sem saldo ou cota.", limite: "O provedor limitou os pedidos agora. Tente de novo em instantes.",
  tempo: "O provedor não respondeu a tempo. Tente de novo.", rede: "Não foi possível falar com o provedor. Tente de novo.", recusado: "O provedor recusou a consulta.", invalido: "O provedor respondeu de um jeito inesperado.", provedor: "O provedor está com erro agora. Tente mais tarde.",
};
/** Só roda quando alguém clica em "Testar chave". */
export async function testKey(k: Key): Promise<TestResult> {
  const fn = TESTS[k.service];
  if (!fn) return { ok: true, message: "Este provedor não tem consulta gratuita de teste documentada: a chave será conferida na primeira geração." };
  try {
    return { ok: true, message: await fn(k, AbortSignal.timeout(12_000)) };
  } catch (e) {
    return { ok: false, message: e instanceof ProviderError ? TEST_FAIL[e.kind] : "Não foi possível testar a chave." };
  }
}

// ---------- preço de cada chamada ----------
export const textCost = (k: Key, r: TextResult) => costUsd(modelSpec(k.service, "texto", k.model), r);
export const estimate = (service: string, purpose: Purpose, model: string, u: Parameters<typeof costUsd>[1]) => costUsd(modelSpec(service, purpose, model), u);
export { clipSeconds };
