/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Types } from "mongoose";
import { decrypt } from "@/lib/crypto";
import { FriendlyError } from "@/lib/errors";
import type { FetchLike, FetchResponseLike } from "@/lib/instagram/client";
import ApiCredential from "@/models/ApiCredential";
import { HouseCredential } from "@/models/Platform";

// YOUTUBE DATA API v3 (só leitura, dados públicos de canal). Cota gratuita: 10.000 unidades/dia
// por projeto do Google. Cada atualização de concorrente gasta 3 unidades (channels.list,
// playlistItems.list e videos.list custam 1 cada). A chave nunca vai para a tela nem para o log.

export const YT_API = "https://www.googleapis.com/youtube/v3";
export const YT_SERVICE = "youtube";

let override: FetchLike | null = null;
export function setYoutubeFetch(f: FetchLike | null) {
  override = f;
}
const doFetch = (): FetchLike => override || ((url) => fetch(url, { cache: "no-store" }) as Promise<FetchResponseLike>);

/** Chave do cliente (Configurações › APIs, serviço "youtube") ou, na falta, a da casa. */
export async function youtubeKey(org: Types.ObjectId): Promise<{ key: string; house: boolean } | null> {
  const own: any = await ApiCredential.findOne({ organization: org, service: YT_SERVICE, active: true }).lean();
  const ownKey = own?.credentials?.apiKey;
  if (ownKey) return { key: decrypt(String(ownKey)), house: false };
  const house: any = await HouseCredential.findOne({ service: YT_SERVICE, active: true }).lean();
  const houseKey = house?.credentials?.apiKey;
  if (houseKey) return { key: decrypt(String(houseKey)), house: true };
  return null;
}

async function call(path: string, params: Record<string, string>, key: string): Promise<any> {
  const u = new URL(`${YT_API}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("key", key);
  let res: FetchResponseLike;
  try {
    res = await doFetch()(u.toString());
  } catch {
    throw new FriendlyError("Não foi possível falar com o YouTube agora. Tente de novo.", 502);
  }
  const body: any = await res.json().catch(() => null);
  if (!res.ok || body?.error) {
    const reason = body?.error?.errors?.[0]?.reason || "";
    const msg = String(body?.error?.message || "");
    if (/quota/i.test(reason) || /quota/i.test(msg)) throw new FriendlyError("A cota diária gratuita do YouTube acabou. Volta amanhã (o Google zera à meia-noite do horário do Pacífico).", 429);
    if (res.status === 400 && /key/i.test(msg)) throw new FriendlyError("A chave do YouTube foi recusada. Confira a chave em Configurações › APIs.", 400, "key");
    if (res.status === 403) throw new FriendlyError("O YouTube recusou a chave (API não ativada no projeto do Google ou chave restrita).", 400, "key");
    throw new FriendlyError("O YouTube devolveu um erro inesperado.", 502);
  }
  return body;
}

export function parseYoutubeRef(raw: string): { id?: string; handle?: string } | null {
  const v = String(raw || "").trim();
  if (!v) return null;
  const fromUrl = v.match(/youtube\.com\/(?:channel\/(UC[\w-]{22})|@([\w.-]{3,30}))/i);
  if (fromUrl) return fromUrl[1] ? { id: fromUrl[1] } : { handle: fromUrl[2] };
  if (/^UC[\w-]{22}$/.test(v)) return { id: v };
  const h = v.replace(/^@/, "");
  return /^[\w.-]{3,30}$/.test(h) ? { handle: h } : null;
}

export interface YoutubeSnapshot {
  channelId: string;
  title: string;
  handle: string;
  subscribers: number | null;
  videoCount: number | null;
  viewCount: number | null;
  videos: { id: string; title: string; publishedAt: string; views: number; likes: number | null; comments: number | null; short: boolean }[];
  units: number;
}

const iso8601Seconds = (d: string) => {
  const m = String(d || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : 0;
};

export async function fetchYoutubeChannel(ref: string, key: string): Promise<YoutubeSnapshot> {
  const r = parseYoutubeRef(ref);
  if (!r) throw new FriendlyError("Confira o canal do YouTube: use o @ do canal ou o link dele.", 400, "youtube");
  const ch = await call("channels", { part: "snippet,statistics,contentDetails", ...(r.id ? { id: r.id } : { forHandle: `@${r.handle}` }) }, key);
  const c = ch.items?.[0];
  if (!c) throw new FriendlyError("Não achei esse canal no YouTube. Confira o @.", 404, "youtube");
  const hidden = c.statistics?.hiddenSubscriberCount === true;
  const snap: YoutubeSnapshot = {
    channelId: c.id,
    title: c.snippet?.title || "",
    handle: c.snippet?.customUrl || (r.handle ? `@${r.handle}` : ""),
    subscribers: hidden ? null : Number(c.statistics?.subscriberCount ?? NaN) || 0,
    videoCount: Number(c.statistics?.videoCount ?? 0),
    viewCount: Number(c.statistics?.viewCount ?? 0),
    videos: [],
    units: 1,
  };
  const uploads = c.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return snap;
  const pl = await call("playlistItems", { part: "contentDetails", playlistId: uploads, maxResults: "10" }, key);
  snap.units++;
  const ids = (pl.items || []).map((i: any) => i.contentDetails?.videoId).filter(Boolean);
  if (!ids.length) return snap;
  const vids = await call("videos", { part: "snippet,statistics,contentDetails", id: ids.join(",") }, key);
  snap.units++;
  snap.videos = (vids.items || []).map((v: any) => ({
    id: v.id,
    title: v.snippet?.title || "",
    publishedAt: v.snippet?.publishedAt || "",
    views: Number(v.statistics?.viewCount ?? 0),
    likes: v.statistics?.likeCount == null ? null : Number(v.statistics.likeCount),
    comments: v.statistics?.commentCount == null ? null : Number(v.statistics.commentCount),
    short: iso8601Seconds(v.contentDetails?.duration) <= 180,
  }));
  return snap;
}
