// Limites de mídia. Os do Instagram foram conferidos na documentação OFICIAL da Meta em 12/10/2026:
//  - developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
//  - developers.facebook.com/docs/instagram-platform/content-publishing
// Este arquivo é puro (sem Node): serve ao servidor e à tela.

const MB = 1024 * 1024;

export const IG_LIMITS = {
  image: {
    /** proporção largura/altura aceita no feed: de 4:5 a 1,91:1 */
    minRatio: 4 / 5,
    maxRatio: 1.91,
    minWidth: 320,
    maxWidth: 1440,
    maxBytes: 8 * MB,
  },
  video: {
    minSeconds: 3,
    maxSeconds: 15 * 60,
    maxBytes: 300 * MB,
    maxWidth: 1920,
    minFps: 23,
    maxFps: 60,
    maxBitrate: 25_000_000,
    maxAudioHz: 48_000,
  },
  carousel: { min: 2, max: 10 },
  caption: { chars: 2200, hashtags: 30, mentions: 20 },
} as const;

/** O que aceitamos receber (antes de converter). */
export const UPLOAD_LIMITS = {
  imageMaxBytes: 30 * MB,
  videoMaxBytes: IG_LIMITS.video.maxBytes,
  /** cota padrão de disco por organização (MEDIA_QUOTA_MB muda) */
  quotaBytes: 5 * 1024 * MB,
  /** mídia enviada e não ligada a nenhum post é apagada depois deste tempo */
  orphanHours: 24,
} as const;

export const ACCEPT_ATTR = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,.jpg,.jpeg,.png,.webp,.mp4,.mov";

export type ProblemLevel = "erro" | "aviso";
export interface MediaProblem {
  code: string;
  level: ProblemLevel;
  message: string;
}

export const fmtBytes = (n: number) =>
  n >= 1024 * MB ? `${(n / (1024 * MB)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB` : n >= MB ? `${(n / MB).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export function ratioProblem(width: number, height: number): MediaProblem | null {
  const r = width / height;
  // meio por cento de folga: 1080x1350 e 1080x566 são exatamente os limites
  if (r >= IG_LIMITS.image.minRatio * 0.995 && r <= IG_LIMITS.image.maxRatio * 1.005) return null;
  return {
    code: "proporcao",
    level: "erro",
    message:
      r < IG_LIMITS.image.minRatio
        ? "A imagem é mais alta do que o Instagram aceita no feed (o limite é 4:5, como 1080 x 1350). Escolha: recortar ou ajustar com fundo."
        : "A imagem é mais larga do que o Instagram aceita no feed (o limite é 1,91:1, como 1080 x 566). Escolha: recortar ou ajustar com fundo.",
  };
}
