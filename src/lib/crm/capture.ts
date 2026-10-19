import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Types } from "mongoose";
import { FriendlyError, notFound } from "@/lib/errors";
import { toObjectId } from "@/lib/tenant";
import { consentVersion } from "@/lib/automations/match";
import { appUrl, safeHttpUrl } from "@/lib/automations/links";
import Organization from "@/models/Organization";
import { CaptureRate, LeadCapture } from "@/models/Crm";
import { ownUser, upsertLead } from "./leads";
import { resolveStage } from "./pipelines";
import { cleanTags, pickUtm, hasUtm, utmFromUrl } from "./pure";

/* eslint-disable @typescript-eslint/no-explicit-any */

// CAPTURA DE LEAD (página própria do cliente ou link rastreado de um post).
// Endereço público /api/captura/<organização>/<código sorteado>:
//   GET  devolve a ficha anti-robô (carimbo de tempo assinado) e o texto de consentimento;
//   POST recebe o formulário (JSON ou formulário HTML comum).
// Defesas: código de 64 bits, ficha assinada que vale de 2 s a 2 h depois de emitida (robô que posta
// direto não tem; quem posta rápido demais é robô), campo-isca "website" que gente não vê,
// teto por IP (5 a cada 10 min por formulário, só o hash do IP é guardado) e por organização
// (300 por hora), consentimento obrigatório, corpo até 16 KB.

type Org = Types.ObjectId;
const bad = (msg: string, field: string) => new FriendlyError(msg, 400, field);

export const TOKEN_MIN_MS = 2_000;
export const TOKEN_MAX_MS = 2 * 3_600_000;
export const PER_IP_10MIN = 5;
export const PER_ORG_HOUR = 300;
export const MAX_BODY = 16 * 1024;

const secret = () => process.env.AUTH_SECRET || "";
const sig = (org: string, code: string, ts: number) => createHmac("sha256", secret()).update(`captura|${org}|${code}|${ts}`).digest("base64url").slice(0, 32);

export function issueToken(org: string, code: string, now = Date.now()): string {
  return `${now}.${sig(org, code, now)}`;
}

export function checkToken(org: string, code: string, token: unknown, now = Date.now()): "ok" | "missing" | "fast" | "expired" {
  const m = /^(\d{12,14})\.([\w-]{32})$/.exec(String(token || ""));
  if (!m || !secret()) return "missing";
  const ts = Number(m[1]);
  const a = Buffer.from(sig(org, code, ts));
  const b = Buffer.from(m[2]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return "missing";
  if (now - ts < TOKEN_MIN_MS) return "fast";
  if (now - ts > TOKEN_MAX_MS) return "expired";
  return "ok";
}

const ipHash = (ip: string) => createHash("sha256").update(`${secret()}|${ip}`).digest("hex").slice(0, 20);

async function bump(org: Org, key: string, max: number, ttlMs: number): Promise<boolean> {
  const expiresAt = new Date(Date.now() + ttlMs);
  const r: any = await CaptureRate.findOneAndUpdate({ organization: org, key }, { $inc: { count: 1 }, $setOnInsert: { expiresAt } }, { upsert: true, returnDocument: "after" }).lean();
  return (r?.count ?? 1) <= max;
}

export async function underLimit(org: Org, code: string, ip: string, now = Date.now()): Promise<boolean> {
  const tenMin = Math.floor(now / 600_000);
  const hour = Math.floor(now / 3_600_000);
  if (!(await bump(org, `ip:${code}:${ipHash(ip)}:${tenMin}`, PER_IP_10MIN, 20 * 60_000))) return false;
  return bump(org, `org:${hour}`, PER_ORG_HOUR, 2 * 3_600_000);
}

export const defaultCaptureConsent = (orgName: string) =>
  `Autorizo a ${orgName} a guardar meus dados deste formulário e entrar em contato comigo sobre este assunto. Posso pedir para apagar quando quiser.`;

async function captureByCode(orgRaw: unknown, codeRaw: unknown) {
  const org = toObjectId(orgRaw);
  const code = String(codeRaw || "");
  if (!org || !/^[\w-]{8,20}$/.test(code)) return null;
  const cap: any = await LeadCapture.findOne({ organization: org, code, active: true }).lean();
  if (!cap) return null;
  const o: any = await Organization.findOne({ _id: org, active: true }).select("name brand").lean();
  if (!o) return null;
  return { org, cap, orgName: o.brand?.displayName || o.name };
}

export async function captureInfo(orgRaw: unknown, codeRaw: unknown, now = Date.now()) {
  const found = await captureByCode(orgRaw, codeRaw);
  if (!found) return null;
  const { cap, orgName, org } = found;
  return { token: issueToken(String(org), cap.code, now), ask: cap.ask, consentText: cap.consentText || defaultCaptureConsent(orgName), name: orgName };
}

const yes = (v: unknown) => v === true || v === "true" || v === "on" || v === "1" || v === "sim";

/** Recebe o formulário. Resposta sem dado nenhum do cliente (só ok / erro / para onde ir). */
export async function submitCapture(orgRaw: unknown, codeRaw: unknown, body: Record<string, any>, ip: string, now = Date.now()): Promise<{ status: number; error?: string; field?: string; redirect?: string }> {
  const found = await captureByCode(orgRaw, codeRaw);
  if (!found) return { status: 404, error: "Formulário não encontrado." };
  const { org, cap, orgName } = found;
  // campo-isca preenchido = robô: finge que deu certo e não guarda nada
  if (String(body.website ?? "").trim()) return { status: 200, redirect: cap.redirectUrl || "" };
  const tk = checkToken(String(org), cap.code, body._t, now);
  if (tk !== "ok") return { status: 400, error: tk === "fast" ? "Envio rápido demais. Confira os dados e envie de novo." : "O formulário expirou. Recarregue a página e envie de novo.", field: "_t" };
  if (!(await underLimit(org, cap.code, ip, now))) return { status: 429, error: "Muitos envios seguidos. Tente de novo daqui a alguns minutos." };
  if (!yes(body.consent)) return { status: 400, error: "Marque a autorização para enviarmos o contato.", field: "consent" };
  const email = String(body.email ?? "").trim().slice(0, 254);
  const phone = String(body.phone ?? body.telefone ?? "").trim().slice(0, 40);
  const name = String(body.name ?? body.nome ?? "").trim().slice(0, 120);
  if (cap.ask === "email" && !email) return { status: 400, error: "Informe o e-mail.", field: "email" };
  if (cap.ask === "phone" && !phone) return { status: 400, error: "Informe o telefone com DDD.", field: "phone" };
  if (cap.ask === "both" && !email && !phone) return { status: 400, error: "Informe o e-mail ou o telefone.", field: "email" };
  const page = safeHttpUrl(body.page) || "";
  const utm = hasUtm(pickUtm(body)) ? pickUtm(body) : utmFromUrl(page);
  const consentText = cap.consentText || defaultCaptureConsent(orgName);
  try {
    await upsertLead(
      org,
      {
        name, email, phone,
        tags: [...(cap.tags || []), ...cleanTags(body.tags)].slice(0, 30),
        pipeline: cap.pipeline, stage: cap.stage, owner: cap.owner,
        source: "landing",
        origin: { label: cap.name, capture: cap._id, url: page.slice(0, 300), postIgId: cap.postIgId || "", campaignId: "" },
        touch: { at: new Date(now), kind: cap.postIgId ? "link" : "landing", label: cap.name, capture: cap._id, postIgId: cap.postIgId || "", campaignId: String(body.campaign_id ?? "").replace(/\D/g, "").slice(0, 30), adId: String(body.ad_id ?? "").replace(/\D/g, "").slice(0, 30), utm },
        utm,
        consent: { given: true, channel: "landing", text: consentText, version: await consentVersion(consentText), basis: `formulário "${cap.name}"`, at: new Date(now) },
        eventKind: "capture",
        eventText: `Enviou o formulário "${cap.name}"${utm.campaign ? ` (utm_campaign ${utm.campaign})` : ""}.`,
      },
      null,
      new Date(now)
    );
  } catch (e) {
    if (e instanceof FriendlyError && e.status === 400) return { status: 400, error: e.message, field: e.field };
    throw e;
  }
  await LeadCapture.updateOne({ _id: cap._id, organization: org }, { $inc: { submissions: 1 }, $set: { lastAt: new Date(now) } });
  return { status: 200, redirect: cap.redirectUrl || "" };
}

// ---------- cadastro dos formulários (tela) ----------

export function captureUrl(org: Org | string, code: string) {
  const base = appUrl();
  return `${base || ""}/api/captura/${String(org)}/${code}`;
}

/** HTML pronto para colar na página do cliente (formulário comum, sem biblioteca). */
export function embedSnippet(org: Org | string, cap: any, consentText: string): string {
  const url = captureUrl(org, cap.code);
  const fields = [
    `<input name="name" placeholder="Seu nome" autocomplete="name">`,
    cap.ask !== "phone" ? `<input name="email" type="email" placeholder="Seu e-mail" autocomplete="email"${cap.ask === "email" ? " required" : ""}>` : "",
    cap.ask !== "email" ? `<input name="phone" type="tel" placeholder="WhatsApp com DDD" autocomplete="tel"${cap.ask === "phone" ? " required" : ""}>` : "",
  ].filter(Boolean);
  return [
    `<form method="post" action="${url}" id="ch-captura">`,
    ...fields.map((f) => `  ${f}`),
    `  <label><input type="checkbox" name="consent" value="on" required> ${consentText.replace(/</g, "&lt;")}</label>`,
    `  <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">`,
    `  <input type="hidden" name="_t"><input type="hidden" name="page">`,
    `  <button type="submit">Enviar</button>`,
    `</form>`,
    `<script>(function(){var f=document.getElementById("ch-captura");f.page.value=location.href;`,
    `var q=new URLSearchParams(location.search);["utm_source","utm_medium","utm_campaign","utm_term","utm_content"].forEach(function(k){if(q.get(k)){var i=document.createElement("input");i.type="hidden";i.name=k;i.value=q.get(k);f.appendChild(i);}});`,
    `fetch("${url}").then(function(r){return r.json()}).then(function(d){f._t.value=d.token;});})();</script>`,
  ].join("\n");
}

export async function publicCapture(org: Org, c: any, orgName: string) {
  const consentText = c.consentText || defaultCaptureConsent(orgName);
  return {
    _id: String(c._id), name: c.name, code: c.code, url: captureUrl(org, c.code), pipeline: c.pipeline ? String(c.pipeline) : "", stage: c.stage || "", owner: c.owner ? String(c.owner) : "",
    tags: c.tags || [], ask: c.ask, consentText: c.consentText || "", defaultConsent: defaultCaptureConsent(orgName), redirectUrl: c.redirectUrl || "", postIgId: c.postIgId || "",
    active: c.active === true, submissions: c.submissions || 0, lastAt: c.lastAt || null, snippet: embedSnippet(org, c, consentText),
  };
}

async function cleanCapture(org: Org, b: Record<string, any>, current?: any) {
  const name = String(b.name ?? current?.name ?? "").trim().slice(0, 80);
  if (name.length < 2) throw bad("Dê um nome para o formulário (ex.: Página do ebook).", "name");
  const { pipeline, stage } = await resolveStage(org, b.pipeline ?? current?.pipeline ?? null, b.stage ?? current?.stage ?? "");
  const ownerRaw = b.owner !== undefined ? b.owner : current?.owner;
  const owner = ownerRaw ? await ownUser(org, ownerRaw) : null;
  const ask = ["email", "phone", "both"].includes(b.ask) ? b.ask : current?.ask || "both";
  const consentText = String(b.consentText ?? current?.consentText ?? "").trim();
  if (consentText.length > 600) throw bad("Texto de consentimento: no máximo 600 caracteres.", "consentText");
  const redirectRaw = String(b.redirectUrl ?? current?.redirectUrl ?? "").trim();
  const redirectUrl = redirectRaw ? safeHttpUrl(redirectRaw) : "";
  if (redirectRaw && !redirectUrl) throw bad("Endereço de obrigado inválido: use https://...", "redirectUrl");
  const postIgId = String(b.postIgId ?? current?.postIgId ?? "").trim();
  if (postIgId && !/^\d{5,30}$/.test(postIgId)) throw bad("Post inválido.", "postIgId");
  return { name, pipeline: pipeline._id, stage: stage.key, owner: owner?._id ?? null, ask, consentText, redirectUrl, postIgId, tags: cleanTags(b.tags ?? current?.tags ?? []), active: b.active === undefined ? (current ? current.active : true) : b.active === true };
}

export async function createCapture(org: Org, b: Record<string, any>) {
  if ((await LeadCapture.countDocuments({ organization: org })) >= 50) throw bad("No máximo 50 formulários.", "name");
  return LeadCapture.create({ organization: org, code: randomBytes(8).toString("base64url"), ...(await cleanCapture(org, b)) });
}

export async function updateCapture(org: Org, id: unknown, b: Record<string, any>) {
  const oid = toObjectId(id);
  const c: any = oid ? await LeadCapture.findOne({ _id: oid, organization: org }) : null;
  if (!c) throw notFound("Formulário");
  Object.assign(c, await cleanCapture(org, b, c.toObject()));
  await c.save();
  return c;
}

export async function deleteCapture(org: Org, id: unknown) {
  const oid = toObjectId(id);
  const c: any = oid ? await LeadCapture.findOne({ _id: oid, organization: org }).lean() : null;
  if (!c) throw notFound("Formulário");
  await LeadCapture.deleteOne({ _id: c._id, organization: org });
}
