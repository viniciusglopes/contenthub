/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac } from "node:crypto";
import type { FetchLike, FetchResponseLike } from "@/lib/instagram/client";
import { mockFetch } from "@/lib/instagram/mock";

// META SIMULADA para as automações: guarda cada resposta pública, cada mensagem (com o destinatário
// e o corpo) e as assinaturas de webhook. Erros podem ser injetados por caminho. O resto (perfil,
// mídias, comentários) cai no simulador de sempre (src/lib/instagram/mock.ts).

export interface Sent { path: string; recipient: any; message: any; params: Record<string, string> }
export interface AutomationFake {
  fetch: FetchLike;
  replies: { commentId: string; message: string }[];
  messages: Sent[];
  subscribed: string[];
  reads: string[];
  errors: { match: RegExp; times: number; error: { code: number; message: string }; status?: number }[];
  mediaTimestamps: Record<string, string>;
}

const ok = (body: unknown): FetchResponseLike => ({ ok: true, status: 200, json: async () => body });

export function automationFake(now: () => number): AutomationFake {
  const base = mockFetch(now);
  let seq = 0;
  const f: AutomationFake = { fetch: null as any, replies: [], messages: [], subscribed: [], reads: [], errors: [], mediaTimestamps: {} };
  f.fetch = async (url, init) => {
    const u = new URL(url);
    const method = init?.method || "GET";
    const params = init?.body ? new URLSearchParams(init.body) : u.searchParams;
    const path = u.pathname.replace(/^\/v\d+\.\d+/, "");
    const hit = f.errors.find((e) => e.times > 0 && e.match.test(path));
    if (hit) {
      hit.times--;
      return { ok: false, status: hit.status ?? 400, json: async () => ({ error: { type: "OAuthException", ...hit.error } }) };
    }
    if (method === "POST" && /^\/\d+\/replies$/.test(path)) {
      f.replies.push({ commentId: path.split("/")[1], message: params.get("message") || "" });
      return ok({ id: `1799${String(++seq).padStart(10, "0")}` });
    }
    if (method === "POST" && /^\/\d+\/messages$/.test(path)) {
      const recipient = JSON.parse(params.get("recipient") || "{}");
      f.messages.push({ path, recipient, message: JSON.parse(params.get("message") || "{}"), params: Object.fromEntries(params) });
      return ok({ recipient_id: recipient.id || "9000000000000001", message_id: `mid.${++seq}` });
    }
    if (method === "POST" && path === "/me/subscribed_apps") {
      f.subscribed.push(params.get("subscribed_fields") || "");
      return ok({ success: true });
    }
    const one = /^\/(\d+)$/.exec(path)?.[1];
    if (one && (params.get("fields") || "") === "timestamp") {
      f.reads.push(path);
      return ok({ id: one, timestamp: f.mediaTimestamps[one] || "" });
    }
    return base(url, init);
  };
  return f;
}

export const SECRET = "segredo-do-app-de-teste";
export const sign = (raw: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;

export function commentPayload(igUserId: string, c: { id: string; text: string; mediaId: string; fromId: string; username?: string; parentId?: string; time?: number }) {
  return {
    object: "instagram",
    entry: [{ id: igUserId, time: Math.floor((c.time ?? Date.now()) / 1000), changes: [{ field: "comments", value: { id: c.id, text: c.text, parent_id: c.parentId, from: { id: c.fromId, username: c.username || "fulana" }, media: { id: c.mediaId, media_product_type: "FEED" } } }] }],
  };
}

export function messagePayload(igUserId: string, m: { mid: string; fromId: string; text?: string; quickReply?: string; postback?: string; echo?: boolean; time?: number }) {
  const ev: any = { sender: { id: m.fromId }, recipient: { id: igUserId }, timestamp: m.time ?? Date.now() };
  if (m.postback) ev.postback = { mid: m.mid, title: "botão", payload: m.postback };
  else ev.message = { mid: m.mid, text: m.text, ...(m.quickReply ? { quick_reply: { payload: m.quickReply } } : {}), ...(m.echo ? { is_echo: true } : {}) };
  return { object: "instagram", entry: [{ id: igUserId, time: m.time ?? Date.now(), messaging: [ev] }] };
}
