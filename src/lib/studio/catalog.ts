// CATÁLOGO DE PROVEDORES DE IA DO ESTÚDIO (arquivo puro: serve ao servidor e à tela).
// Modelos e preços lidos na documentação oficial em 12/10/2026 (tabela completa, fontes e o
// que NÃO foi confirmado em docs/estudio-provedores.md). O custo que o sistema mostra é
// ESTIMADO por esta tabela; o valor de verdade é o do extrato de cada provedor.

export const PRICES_CHECKED = "12/10/2026";

export const PURPOSES = {
  texto: { label: "Texto", hint: "roteiro do carrossel e do Reel, sugestão de temas" },
  voz: { label: "Voz", hint: "narração do Reel em português" },
  imagem: { label: "Imagem", hint: "imagem de fundo das cenas do Reel" },
  video: { label: "Vídeo", hint: "cenas de vídeo geradas por IA" },
  musica: { label: "Música", hint: "trilha (ainda sem provedor: envie a sua trilha)" },
} as const;
export type Purpose = keyof typeof PURPOSES;
export const PURPOSE_KEYS = Object.keys(PURPOSES) as Purpose[];

export interface ModelSpec {
  id: string;
  label: string;
  /** dólar por 1 milhão de tokens (texto), por 1.000 caracteres (voz), por imagem, por segundo (vídeo) */
  price: { in?: number; out?: number; kchars?: number; image?: number; second?: number };
  /** vídeo: durações aceitas por geração, em segundos */
  seconds?: number[];
  note?: string;
}
export interface ServiceSpec {
  label: string;
  /** onde o cliente cria a chave */
  site: string;
  pay: string;
  /** campos extras (não secretos) que o provedor exige */
  extra?: { key: string; label: string; hint: string; purpose: Purpose }[];
  /** existe chamada gratuita para testar a chave? */
  freeTest: boolean;
  purposes: Partial<Record<Purpose, ModelSpec[]>>;
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// O primeiro modelo de cada finalidade é o padrão (o mais barato que serve).
export const SERVICES: Record<string, ServiceSpec> = {
  anthropic: {
    label: "Anthropic (Claude)", site: "console.anthropic.com", pay: "créditos pré-pagos", freeTest: true,
    purposes: {
      texto: [
        { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (mais barato)", price: { in: 0.1, out: 0.5 } },
        { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", price: { in: 2, out: 10 } },
        { id: "claude-opus-5-5", label: "Claude Opus 5.5", price: { in: 4, out: 20 } },
      ],
    },
  },
  google: {
    label: "Google (Gemini e Veo)", site: "aistudio.google.com", pay: "pré-pago (mínimo US$ 5) ou pós-pago", freeTest: true,
    purposes: {
      texto: [
        { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite (mais barato)", price: { in: 0.3, out: 2.5 } },
        { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", price: { in: 0.75, out: 3.75 }, note: "preço dobra em 01/01/2027" },
      ],
      voz: [{ id: "gemini-3.8-flash-tts", label: "Gemini 3.8 Flash TTS", price: { kchars: 0.015 }, note: "cobrado por token de áudio; valor por caractere é estimativa nossa" }],
      imagem: [
        { id: "gemini-nano-banana-2.1", label: "Nano Banana 2.1 (1K)", price: { image: 0.0336 } },
        { id: "gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image (1K)", price: { image: 0.067 } },
      ],
      video: [
        { id: "veo-3.1-lite-generate-preview", label: "Veo 3.1 Lite 720p", price: { second: 0.05 }, seconds: [4, 6, 8] },
        { id: "veo-3.1-fast-generate-preview", label: "Veo 3.1 Fast 720p", price: { second: 0.1 }, seconds: [4, 6, 8] },
      ],
    },
  },
  openai: {
    label: "OpenAI", site: "platform.openai.com", pay: "não confirmado (a página de cobrança não abriu)", freeTest: true,
    extra: [{ key: "voice", label: "Voz", hint: "nome da voz (padrão: coral)", purpose: "voz" }],
    purposes: {
      texto: [
        { id: "gpt-6-luna", label: "GPT-6 Luna (mais barato)", price: { in: 0.1, out: 0.5 } },
        { id: "gpt-6.1-sol", label: "GPT-6.1 Sol", price: { in: 2, out: 10 } },
      ],
      voz: [
        { id: "tts-1", label: "TTS-1", price: { kchars: 0.015 } },
        { id: "tts-1-hd", label: "TTS-1 HD", price: { kchars: 0.03 } },
      ],
      imagem: [{ id: "gpt-image-2", label: "GPT Image 2 (média, 1024x1536)", price: { image: 0.041 }, note: "exige organização verificada na OpenAI" }],
    },
  },
  elevenlabs: {
    label: "ElevenLabs", site: "elevenlabs.io", pay: "assinatura ou uso avulso; uso comercial só em plano pago", freeTest: true,
    extra: [{ key: "voiceId", label: "ID da voz", hint: "copie em Voices no painel da ElevenLabs (obrigatório)", purpose: "voz" }],
    purposes: {
      voz: [
        { id: "eleven_flash_v2_5", label: "Flash v2.5 (mais barato)", price: { kchars: 0.04 } },
        { id: "eleven_multilingual_v2", label: "Multilingual v2", price: { kchars: 0.08 } },
      ],
    },
  },
  runway: {
    label: "Runway", site: "dev.runwayml.com", pay: "créditos pré-pagos (US$ 0,01 por crédito)", freeTest: true,
    purposes: { video: [{ id: "gen4.5", label: "Gen-4.5 720p", price: { second: 0.12 }, seconds: range(2, 10) }] },
  },
  luma: {
    label: "Luma", site: "lumalabs.ai", pay: "por geração, sem mínimo", freeTest: false,
    purposes: { video: [{ id: "ray-3.2", label: "Ray 3.2 720p (5 s)", price: { second: 0.06 }, seconds: [5] }] },
  },
  kling: {
    label: "Kling", site: "klingai.com", pay: "saldo ou pacotes pré-pagos", freeTest: true,
    purposes: { video: [{ id: "kling-3.0-turbo", label: "Kling 3.0 Turbo 720p", price: { second: 0.112 }, seconds: range(3, 15) }] },
  },
};

export const isService = (s: unknown): s is string => typeof s === "string" && s in SERVICES;
export const isPurpose = (p: unknown): p is Purpose => typeof p === "string" && p in PURPOSES;
export const defaultModel = (service: string, purpose: Purpose) => SERVICES[service]?.purposes[purpose]?.[0]?.id || "";
export function modelSpec(service: string, purpose: Purpose, model?: string): ModelSpec | null {
  const list = SERVICES[service]?.purposes[purpose] || [];
  return list.find((m) => m.id === model) || list[0] || null;
}

export interface Units { inTokens?: number; outTokens?: number; chars?: number; images?: number; seconds?: number }
/** Custo estimado em dólar de uma chamada. */
export function costUsd(spec: ModelSpec | null, u: Units): number {
  if (!spec) return 0;
  const p = spec.price;
  return ((u.inTokens || 0) * (p.in || 0) + (u.outTokens || 0) * (p.out || 0)) / 1e6 + ((u.chars || 0) * (p.kchars || 0)) / 1000 + (u.images || 0) * (p.image || 0) + (u.seconds || 0) * (p.second || 0);
}
/** Tokens aproximados de um texto em português (cerca de 3 caracteres por token, arredondado para cima). */
export const tokensOf = (text: string) => Math.ceil(text.length / 3);
/** Vídeo: a menor duração aceita pelo modelo que cobre a cena (ou a maior que ele faz). */
export function clipSeconds(spec: ModelSpec | null, wanted: number): number {
  const list = [...(spec?.seconds || [5])].sort((a, b) => a - b);
  return list.find((s) => s >= wanted - 0.25) ?? list[list.length - 1];
}
