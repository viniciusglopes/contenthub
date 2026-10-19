import type { Types } from "mongoose";
import { decrypt } from "@/lib/crypto";
import { MetaApiError, MetaGraphClient, getMetaFetch } from "@/lib/ads/client";
import { ensureAdsMock } from "@/lib/ads/mock";
import type { FetchLike } from "@/lib/instagram/client";
import Organization from "@/models/Organization";
import { CapiLog } from "@/models/Tracking";
import { type PersonForMeta, buildUserData } from "./pure";

/* eslint-disable @typescript-eslint/no-explicit-any */

// API DE CONVERSÕES DA META (lado do servidor). POST /{pixel-id}/events com data=[...] e o token do pixel.
// Doc oficial (lida 19/10/2026):
//  - parâmetros da pessoa e hash: developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
//  - deduplicação com o pixel: developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events
//    (eventID do pixel = event_id do servidor E mesmo nome de evento; vale até 48 horas).
// Três chaves, todas desligadas: env CAPI_ENABLED, Organization.capiEnabled e TrackingSite.capi.enabled.
// Cada envio (ou o motivo de não enviar) fica em CapiLog com a resposta da Meta; os valores da pessoa
// nunca são gravados no log (só quais chaves foram).

type Org = Types.ObjectId;

export const capiGlobal = () => process.env.CAPI_ENABLED === "true";

export function capiSwitch(orgDoc: any, site?: any) {
  const global = capiGlobal();
  const org = orgDoc?.capiEnabled === true;
  const siteOn = site ? site.capi?.enabled === true && Boolean(site.pixelId) && Boolean(site.capi?.accessToken) : true;
  const on = global && org && siteOn;
  const message = on ? "" : !global ? "Envio à Meta desligado no servidor (CAPI_ENABLED)." : !org ? "Envio à Meta desligado para esta conta (o suporte liga em Admin › Clientes)." : "Ligue o envio no site e preencha o pixel e o token.";
  return { global, org, site: siteOn, on, message };
}

let fetchOverride: FetchLike | null = null;
export function setCapiFetch(f: FetchLike | null) {
  fetchOverride = f;
}

export interface CapiEvent {
  eventName: "Lead" | "Purchase" | "InitiateCheckout" | "PageView";
  eventId: string;
  at: Date;
  person: PersonForMeta;
  url?: string;
  value?: number | null;
  currency?: string;
  contact?: unknown;
  /** "website" quando há dados do navegador; senão "system_generated" */
  actionSource?: string;
  test?: boolean;
}

export async function sendCapi(org: Org, site: any, ev: CapiEvent): Promise<{ status: string; response?: unknown }> {
  const orgDoc: any = await Organization.findById(org).select("capiEnabled").lean();
  const sw = capiSwitch(orgDoc, site);
  const { userData, keys } = buildUserData(ev.person);
  const actionSource = ev.actionSource || (ev.person.ua ? "website" : "system_generated");
  const base = { organization: org, site: site?._id ?? null, eventName: ev.eventName, eventId: ev.eventId, keys, actionSource, value: ev.value ?? null, contact: ev.contact ?? null, at: new Date() };
  if (!sw.on) {
    await CapiLog.create({ ...base, status: "skipped", reason: sw.message });
    return { status: "skipped" };
  }
  if (ev.eventName === "InitiateCheckout" && !site.capi?.initiateCheckout) {
    await CapiLog.create({ ...base, status: "skipped", reason: "InitiateCheckout desligado neste site." });
    return { status: "skipped" };
  }
  if (!keys.some((k) => ["em", "ph", "external_id", "fbc", "fbp", "client_ip_address"].includes(k))) {
    await CapiLog.create({ ...base, status: "skipped", reason: "Sem nenhum dado da pessoa para a Meta casar." });
    return { status: "skipped" };
  }
  const event: Record<string, unknown> = {
    event_name: ev.eventName,
    event_time: Math.floor(ev.at.getTime() / 1000),
    event_id: ev.eventId,
    action_source: actionSource,
    user_data: userData,
  };
  if (actionSource === "website" && ev.url) event.event_source_url = ev.url.slice(0, 500);
  if (ev.value != null) event.custom_data = { value: ev.value, currency: ev.currency || "BRL" };
  const testCode = ev.test || site.capi?.testEventCode ? String(site.capi?.testEventCode || "") : "";
  ensureAdsMock();
  try {
    const client = new MetaGraphClient(decrypt(site.capi.accessToken), fetchOverride ?? getMetaFetch(), undefined, 2);
    const r: any = await client.post(`/${site.pixelId}/events`, { data: JSON.stringify([event]), ...(testCode ? { test_event_code: testCode } : {}) });
    const response = { events_received: r?.events_received ?? null, fbtrace_id: r?.fbtrace_id || "", messages: r?.messages || [] };
    await CapiLog.create({ ...base, status: testCode ? "test" : "sent", testEventCode: testCode, response });
    return { status: testCode ? "test" : "sent", response };
  } catch (e: any) {
    const response = e instanceof MetaApiError ? { code: e.code ?? null, message: (e.metaMessage || e.message).slice(0, 300), kind: e.kind } : { message: String(e?.message || e).slice(0, 300) };
    await CapiLog.create({ ...base, status: "failed", testEventCode: testCode, response, reason: e?.message?.slice(0, 200) || "erro" });
    return { status: "failed", response };
  }
}
