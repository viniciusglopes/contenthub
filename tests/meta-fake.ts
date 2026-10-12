/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";
import sharp from "sharp";
import type { FetchLike, FetchResponseLike } from "@/lib/instagram/client";
import { mockFetch } from "@/lib/instagram/mock";

// META SIMULADA para a publicação: guarda containers, o que foi publicado e a cota de 24h.
// O que não é publicação cai no simulador de sempre (src/lib/instagram/mock.ts).

interface Container { id: string; params: Record<string, string>; statuses: string[]; published: boolean; mediaId?: string }
export interface MetaFake {
  fetch: FetchLike;
  containers: Map<string, Container>;
  /** uma entrada por chamada a media_publish que deu certo */
  published: { id: string; creationId: string; caption: string; ts: number }[];
  publishCalls: number;
  createCalls: number;
  quota: { used: number; total: number };
  /** quantas consultas um vídeo fica "processando" antes de ficar pronto */
  videoPolls: number;
  /** erros a devolver nas próximas chamadas que casarem com o caminho */
  errors: { match: RegExp; method?: string; times: number; error: { code: number; error_subcode?: number; message: string }; status?: number }[];
  nextMediaId: string | null;
  /** media_publish publica de verdade mas a resposta se perde (queda de rede) */
  loseNextPublishResponse: boolean;
  log: string[];
}

const ok = (body: unknown): FetchResponseLike => ({ ok: true, status: 200, json: async () => body });

export function metaFake(now: () => number): MetaFake {
  const base = mockFetch(now);
  let seq = 0;
  const m: MetaFake = {
    fetch: null as any, containers: new Map(), published: [], publishCalls: 0, createCalls: 0, quota: { used: 2, total: 50 }, videoPolls: 0,
    errors: [], nextMediaId: null, loseNextPublishResponse: false, log: [],
  };
  m.fetch = async (url, init) => {
    const u = new URL(url);
    const method = init?.method || "GET";
    const params = init?.body ? new URLSearchParams(init.body) : u.searchParams;
    const path = u.pathname.replace(/^\/v\d+\.\d+/, "");
    m.log.push(`${method} ${path}`);
    const hit = m.errors.find((e) => e.times > 0 && e.match.test(path) && (!e.method || e.method === method));
    if (hit) {
      hit.times--;
      return { ok: false, status: hit.status ?? 400, json: async () => ({ error: { type: "OAuthException", ...hit.error } }) };
    }
    if (method === "POST" && /^\/\d+\/media$/.test(path)) {
      m.createCalls++;
      const id = `17900000${String(++seq).padStart(6, "0")}`;
      const video = params.get("media_type") === "REELS" || params.get("media_type") === "VIDEO";
      m.containers.set(id, { id, params: Object.fromEntries(params), statuses: video ? Array(m.videoPolls).fill("IN_PROGRESS") : [], published: false });
      return ok({ id });
    }
    if (method === "POST" && /^\/\d+\/media_publish$/.test(path)) {
      m.publishCalls++;
      const c = m.containers.get(params.get("creation_id") || "");
      if (!c) return { ok: false, status: 400, json: async () => ({ error: { code: 24, error_subcode: 2207008, message: "The media builder does not exist" } }) };
      if (c.published) throw new Error("TESTE: o mesmo container foi publicado duas vezes");
      c.published = true;
      c.mediaId = m.nextMediaId || `17950000${String(++seq).padStart(6, "0")}`;
      m.nextMediaId = null;
      m.quota.used++;
      m.published.push({ id: c.mediaId, creationId: c.id, caption: c.params.caption || "", ts: now() });
      if (m.loseNextPublishResponse) {
        m.loseNextPublishResponse = false;
        throw new Error("rede caiu depois de publicar");
      }
      return ok({ id: c.mediaId });
    }
    if (/^\/\d+\/content_publishing_limit$/.test(path))
      return ok({ data: [{ quota_usage: m.quota.used, config: { quota_total: m.quota.total, quota_duration: 86400 } }] });
    const one = /^\/(\d+)$/.exec(path)?.[1];
    if (one && m.containers.has(one)) {
      const c = m.containers.get(one)!;
      return ok({ id: one, status_code: c.published ? "PUBLISHED" : c.statuses.shift() ?? "FINISHED" });
    }
    const pub = one && m.published.find((p) => p.id === one);
    if (pub) return ok({ id: one, permalink: `https://www.instagram.com/p/TESTE${one!.slice(-4)}/` });
    if (method === "GET" && /^\/\d+\/media$/.test(path) && m.published.length) {
      const rest: any = await (await base(url, init)).json();
      const mine = m.published.map((p) => ({ id: p.id, caption: p.caption, media_type: "IMAGE", media_product_type: "FEED", permalink: `https://www.instagram.com/p/TESTE${p.id.slice(-4)}/`, timestamp: new Date(p.ts).toISOString() }));
      return ok({ ...rest, data: [...mine.reverse(), ...(rest.data || [])] });
    }
    return base(url, init);
  };
  return m;
}

export const image = (width: number, height: number, format: "jpeg" | "png" | "webp" = "jpeg", color = "#c2410c") =>
  sharp({ create: { width, height, channels: format === "png" ? 4 : 3, background: color } })[format]().toBuffer();

/** Envia um arquivo para a rota de upload, como a tela faz (o corpo é o próprio arquivo). */
export async function upload(handler: any, cookie: string, file: Buffer, name = "foto.jpg", query = "") {
  const req = new NextRequest(`http://localhost/api/uploads?name=${encodeURIComponent(name)}${query}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/octet-stream", "content-length": String(file.length), "x-forwarded-for": "10.0.0.1" },
    body: new Uint8Array(file),
  });
  const res: Response = await handler(req, { params: Promise.resolve({}) });
  const text = await res.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* vazio */ }
  return { status: res.status, data, text };
}
