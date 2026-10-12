import type { RawInsight, RawMedia } from "./client";

// Métricas válidas por tipo de mídia (referência "IG Media Insights", conferida em 12/10/2026).
// impressions/plays/video_views foram aposentadas: o que vale hoje é `views`.
// Mídia dentro de carrossel não tem insights; o carrossel em si (FEED) tem.

export type ProductType = "FEED" | "REELS" | "STORY";
export type MediaKind = "reel" | "carrossel" | "imagem" | "video" | "story";

export interface MediaMetrics {
  reach?: number;
  views?: number;
  likes?: number;
  comments?: number;
  saved?: number;
  shares?: number;
  totalInteractions?: number;
  /** Reels: tempo médio assistido, em milissegundos. */
  avgWatchTimeMs?: number;
  /** Reels: tempo total assistido, em milissegundos. */
  totalWatchTimeMs?: number;
}

const BASE = ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions"];

export const METRICS_BY_TYPE: Record<ProductType, string[]> = {
  FEED: BASE,
  REELS: [...BASE, "ig_reels_avg_watch_time", "ig_reels_video_view_total_time"],
  STORY: ["reach", "views", "shares", "replies", "total_interactions"],
};

/** Conjunto antigo e estável, usado se a Meta recusar alguma métrica do conjunto completo. */
export const FALLBACK_METRICS = ["reach", "likes", "comments", "saved", "shares"];

export function metricsFor(type: ProductType): string[] {
  return METRICS_BY_TYPE[type];
}

export function resolveProductType(m: Pick<RawMedia, "media_type" | "media_product_type" | "permalink">): ProductType {
  const p = (m.media_product_type || "").toUpperCase();
  if (p === "REELS" || p === "STORY" || p === "FEED") return p;
  if (/\/reels?\//.test(m.permalink || "")) return "REELS";
  // Sem o campo: vídeo publicado hoje no Instagram é reel.
  return (m.media_type || "").toUpperCase() === "VIDEO" ? "REELS" : "FEED";
}

export function resolveKind(m: Pick<RawMedia, "media_type" | "media_product_type" | "permalink">): MediaKind {
  const product = resolveProductType(m);
  if (product === "STORY") return "story";
  if (product === "REELS") return "reel";
  const t = (m.media_type || "").toUpperCase();
  if (t === "CAROUSEL_ALBUM") return "carrossel";
  return t === "VIDEO" ? "video" : "imagem";
}

export const KIND_LABEL: Record<MediaKind, string> = {
  reel: "Reel",
  carrossel: "Carrossel",
  imagem: "Imagem",
  video: "Vídeo",
  story: "Story",
};

const MAP: Record<string, keyof MediaMetrics> = {
  reach: "reach",
  views: "views",
  likes: "likes",
  comments: "comments",
  saved: "saved",
  shares: "shares",
  total_interactions: "totalInteractions",
  ig_reels_avg_watch_time: "avgWatchTimeMs",
  ig_reels_video_view_total_time: "totalWatchTimeMs",
};

export function insightValue(i: RawInsight): number | undefined {
  const v = i.total_value?.value ?? i.values?.[0]?.value;
  return typeof v === "number" ? v : undefined;
}

/** A Meta devolve conjunto vazio (e não zero) quando não tem o dado: o campo fica ausente. */
export function parseMediaInsights(insights: RawInsight[]): MediaMetrics {
  const out: MediaMetrics = {};
  for (const i of insights) {
    const key = MAP[i.name];
    const v = insightValue(i);
    if (key && v !== undefined) out[key] = v;
  }
  return out;
}

/** Completa curtidas/comentários com os contadores da própria mídia quando o insight não veio. */
export function withMediaCounters(metrics: MediaMetrics, m: Pick<RawMedia, "like_count" | "comments_count">): MediaMetrics {
  return {
    ...metrics,
    likes: metrics.likes ?? m.like_count,
    comments: metrics.comments ?? m.comments_count,
  };
}

export function parseAccountTotals(insights: RawInsight[]): { reach?: number; views?: number } {
  const out: { reach?: number; views?: number } = {};
  for (const i of insights) {
    const v = insightValue(i);
    if (v === undefined) continue;
    if (i.name === "reach") out.reach = v;
    if (i.name === "views") out.views = v;
  }
  return out;
}

/** Nota de engajamento usada para ordenar: salvamentos + compartilhamentos. */
export function savesPlusShares(m: MediaMetrics | undefined): number {
  return (m?.saved ?? 0) + (m?.shares ?? 0);
}
