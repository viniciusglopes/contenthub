import { type InstagramClient } from "./client";

// BASE de publicação (container -> publish). Fica DESLIGADA por padrão:
// só publica com IG_PUBLISH_ENABLED=true e post com status aprovado/agendado.
// Regras conferidas na documentação em 12/10/2026: imagem só JPEG em URL pública,
// carrossel de 2 a 10 itens, container vence em 24h, limite por 24h lido da própria API.

export function publishEnabled(): boolean {
  return process.env.IG_PUBLISH_ENABLED === "true";
}

export const PUBLISHABLE_STATUS = ["approved", "scheduled"];

export interface PublishablePost {
  title?: string;
  caption?: string;
  hashtags?: string[];
  format: string;
  platforms?: string[];
  status: string;
  mediaUrls?: string[];
  externalIds?: Map<string, string> | Record<string, string> | null;
}

export type PublishPlan =
  | { kind: "IMAGE"; imageUrl: string; caption: string }
  | { kind: "CAROUSEL"; items: { url: string; video: boolean }[]; caption: string }
  | { kind: "REELS"; videoUrl: string; caption: string };

const isVideo = (u: string) => /\.(mp4|mov)(\?|#|$)/i.test(u);
const isJpeg = (u: string) => /\.jpe?g(\?|#|$)/i.test(u);
const isOtherImage = (u: string) => /\.(png|webp|gif|heic|avif|bmp)(\?|#|$)/i.test(u);

export function buildCaption(post: PublishablePost): string {
  const caption = (post.caption || "").trim();
  const missing = (post.hashtags || [])
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .filter((h) => !caption.toLowerCase().includes(h.toLowerCase()));
  return [caption, missing.join(" ")].filter(Boolean).join("\n\n");
}

function externalId(post: PublishablePost): string | undefined {
  const e = post.externalIds;
  if (!e) return undefined;
  return e instanceof Map ? e.get("instagram") : (e as Record<string, string>).instagram;
}

/** Confere o post e devolve o plano de publicação ou a lista de problemas, em português. */
export function planPublish(post: PublishablePost): { ok: true; plan: PublishPlan } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const urls = (post.mediaUrls || []).map((u) => u.trim()).filter(Boolean);
  const caption = buildCaption(post);

  if (!PUBLISHABLE_STATUS.includes(post.status))
    errors.push("O post precisa estar Aprovado ou Agendado para ser publicado.");
  if (!(post.platforms || []).includes("instagram")) errors.push("O post não está marcado para o Instagram.");
  if (externalId(post)) errors.push("Esse post já foi publicado no Instagram.");
  if (urls.length === 0) errors.push("O post não tem mídia (falta a URL pública da imagem ou do vídeo).");
  if (urls.some((u) => !/^https:\/\//i.test(u))) errors.push("Toda mídia precisa estar em URL pública https.");
  if (caption.length > 2200) errors.push("A legenda passa de 2.200 caracteres.");
  if ((caption.match(/#[\p{L}\p{N}_]+/gu) || []).length > 30) errors.push("A legenda tem mais de 30 hashtags.");

  let plan: PublishPlan | null = null;
  if (post.format === "post") {
    if (urls.length > 1) errors.push("Post de imagem única aceita só 1 mídia. Para várias, use o formato Carrossel.");
    if (urls[0] && (isVideo(urls[0]) || isOtherImage(urls[0]))) errors.push("A imagem precisa ser JPEG (o Instagram não aceita PNG, WebP ou outros).");
    plan = { kind: "IMAGE", imageUrl: urls[0], caption };
  } else if (post.format === "carrossel") {
    if (urls.length < 2 || urls.length > 10) errors.push("Carrossel precisa de 2 a 10 mídias.");
    if (urls.some((u) => isOtherImage(u))) errors.push("As imagens do carrossel precisam ser JPEG.");
    plan = { kind: "CAROUSEL", items: urls.map((u) => ({ url: u, video: isVideo(u) })), caption };
  } else if (post.format === "reel") {
    if (urls.length > 1) errors.push("Reel aceita só 1 vídeo.");
    if (urls[0] && (isJpeg(urls[0]) || isOtherImage(urls[0]))) errors.push("Reel precisa de um vídeo (MP4 ou MOV), não de imagem.");
    plan = { kind: "REELS", videoUrl: urls[0], caption };
  } else {
    errors.push(`O formato "${post.format}" ainda não é publicado pelo ContentHub (só post, carrossel e reel).`);
  }
  return errors.length === 0 && plan ? { ok: true, plan } : { ok: false, errors };
}

export class PublishError extends Error {}

export interface PublishDeps {
  client: Pick<
    InstagramClient,
    "createContainer" | "getContainerStatus" | "publishContainer" | "getPublishingLimit"
  >;
  igUserId: string;
  enabled?: boolean;
  sleep?: (ms: number) => Promise<void>;
  pollMs?: number;
  maxPolls?: number;
}

async function waitReady(deps: PublishDeps, containerId: string): Promise<void> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const max = deps.maxPolls ?? 30; // com 10s de intervalo: até 5 minutos, como a Meta recomenda
  for (let i = 0; i < max; i++) {
    const status = await deps.client.getContainerStatus(containerId);
    if (status === "FINISHED" || status === "PUBLISHED") return;
    if (status === "ERROR") throw new PublishError("O Instagram recusou a mídia ao processar (formato, tamanho ou URL fora do padrão).");
    if (status === "EXPIRED") throw new PublishError("O Instagram expirou a mídia antes de publicar (passou de 24h).");
    await sleep(deps.pollMs ?? 10_000);
  }
  throw new PublishError("O Instagram ainda está processando a mídia. Tente publicar de novo em alguns minutos.");
}

/** Publica de verdade. Só roda com a chave ligada; quem chama grava o id e muda o status. */
export async function publishPost(post: PublishablePost, deps: PublishDeps): Promise<{ mediaId: string; kind: PublishPlan["kind"] }> {
  if (!(deps.enabled ?? publishEnabled()))
    throw new PublishError("A publicação pelo ContentHub está desligada (IG_PUBLISH_ENABLED). Nada foi publicado.");
  const check = planPublish(post);
  if (!check.ok) throw new PublishError(check.errors.join(" "));
  const { plan } = check;

  const limit = await deps.client.getPublishingLimit(deps.igUserId);
  if (limit.used >= limit.total)
    throw new PublishError(`Limite de publicações do Instagram atingido (${limit.used} de ${limit.total} em 24h). Tente mais tarde.`);

  let creationId: string;
  if (plan.kind === "IMAGE") {
    creationId = await deps.client.createContainer(deps.igUserId, { image_url: plan.imageUrl, caption: plan.caption });
  } else if (plan.kind === "REELS") {
    creationId = await deps.client.createContainer(deps.igUserId, {
      media_type: "REELS",
      video_url: plan.videoUrl,
      caption: plan.caption,
    });
  } else {
    const children: string[] = [];
    for (const item of plan.items) {
      const id = await deps.client.createContainer(
        deps.igUserId,
        item.video
          ? { media_type: "VIDEO", video_url: item.url, is_carousel_item: true }
          : { image_url: item.url, is_carousel_item: true }
      );
      if (item.video) await waitReady(deps, id);
      children.push(id);
    }
    creationId = await deps.client.createContainer(deps.igUserId, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption: plan.caption,
    });
  }
  await waitReady(deps, creationId);
  const mediaId = await deps.client.publishContainer(deps.igUserId, creationId);
  return { mediaId, kind: plan.kind };
}
