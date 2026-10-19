/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac } from "node:crypto";
import type { FetchLike } from "@/lib/instagram/client";

// META SIMULADA para os formulários de cadastro (Lead Ads): só leitura.
//  GET /{page-id}?fields=id,name      -> a Página (token "pagina-<id>" é da Página <id>)
//  GET /{leadgen-id}?fields=...       -> o lead com field_data
// Qualquer POST/DELETE fica registrado em `writes` (o teste confere que é zero).

export const META_SECRET = "segredo-do-app-da-meta-de-teste";
export const signMeta = (raw: string, secret = META_SECRET) => `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;

export interface LeadAdsFake {
  fetch: FetchLike;
  leads: Map<string, any>;
  calls: string[];
  writes: string[];
  /** próximas respostas de erro para o GET do lead: { code, status } */
  errors: { code: number; status: number; message?: string }[];
}

export function leadAdsFake(): LeadAdsFake {
  const f: LeadAdsFake = { fetch: null as any, leads: new Map(), calls: [], writes: [], errors: [] };
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  const fail = (status: number, code: number, message = "erro") => ({ ok: false, status, json: async () => ({ error: { code, message } }), text: async () => "" });
  f.fetch = (async (url: string, init?: any) => {
    const u = new URL(url);
    const method = init?.method || "GET";
    const path = u.pathname.replace(/^\/v\d+\.\d+/, "");
    f.calls.push(`${method} ${path}`);
    if (method !== "GET") {
      f.writes.push(`${method} ${path}`);
      return ok({ success: true });
    }
    const token = u.searchParams.get("access_token") || "";
    if (/invalido/.test(token)) return fail(400, 190, "Error validating access token");
    const id = path.slice(1);
    if (f.leads.has(id)) {
      const e = f.errors.shift();
      if (e) return fail(e.status, e.code, e.message);
      return ok(f.leads.get(id));
    }
    const page = /^pagina-(\d+)/.exec(token);
    if (page && page[1] === id) return ok({ id, name: `Página ${id}` });
    if (page) return ok({ id: page[1], name: `Página ${page[1]}` });
    return fail(400, 100, "Unsupported get request");
  }) as any;
  return f;
}

export function leadgenPayload(pageId: string, l: { leadgenId: string; formId?: string; adId?: string; time?: number }) {
  return {
    object: "page",
    entry: [{ id: pageId, time: Math.floor((l.time ?? Date.now()) / 1000), changes: [{ field: "leadgen", value: { leadgen_id: l.leadgenId, page_id: pageId, form_id: l.formId || "555000111", adgroup_id: l.adId || "", ad_id: l.adId || "", created_time: Math.floor((l.time ?? Date.now()) / 1000) } }] }],
  };
}
