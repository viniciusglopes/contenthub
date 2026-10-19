import { randomBytes } from "node:crypto";
import type { Types } from "mongoose";
import { Automation, Contact, TrackedLink } from "@/models/Automation";
import { LeadEvent } from "@/models/Crm";

/* eslint-disable @typescript-eslint/no-explicit-any */

// LINK COM CLIQUE CONTADO: o botão da DM aponta para /api/r/<organização>/<código> (público),
// que soma 1 clique e redireciona para o link de verdade. Sem dado da pessoa na URL.

export function appUrl(): string {
  return (process.env.APP_URL || "").replace(/\/+$/, "");
}

export function trackedUrl(org: Types.ObjectId | string, code: string | undefined): string {
  const base = appUrl();
  if (!base || !code) return "";
  return `${base}/api/r/${String(org)}/${code}`;
}

export function safeHttpUrl(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s || s.length > 1000) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Garante um código por botão de link. Link trocado = código novo (o clique conta por link). */
export async function ensureLinks(org: Types.ObjectId, automation: any): Promise<void> {
  const buttons: any[] = automation.dm?.buttons || [];
  for (const b of buttons) {
    if (b.kind !== "url" || !b.url) {
      b.linkCode = "";
      continue;
    }
    if (b.linkCode) {
      const existing: any = await TrackedLink.findOne({ organization: org, code: b.linkCode }).lean();
      if (existing && existing.url === b.url && String(existing.automation) === String(automation._id)) continue;
    }
    const code = randomBytes(8).toString("base64url");
    await TrackedLink.create({ organization: org, automation: automation._id, code, url: b.url });
    b.linkCode = code;
  }
}

/** Clique: soma no link e na automação, devolve para onde ir (ou null). */
export async function registerClick(org: Types.ObjectId, code: string, now = Date.now(), key = ""): Promise<string | null> {
  if (!/^[\w-]{6,20}$/.test(code)) return null;
  const link: any = await TrackedLink.findOneAndUpdate({ organization: org, code }, { $inc: { clicks: 1 }, $set: { lastClickAt: new Date(now) } }, { returnDocument: "after" }).lean();
  if (!link) return null;
  await Automation.updateOne({ _id: link.automation, organization: org }, { $inc: { "stats.clicks": 1 } });
  // ?k= é a chave opaca do contato (não é dado pessoal): o clique entra na linha do tempo dele
  if (/^[\w-]{8,20}$/.test(key)) {
    const c: any = await Contact.findOne({ organization: org, clickKey: key }).select("_id").lean();
    if (c) {
      const host = (() => { try { return new URL(link.url).hostname; } catch { return ""; } })();
      await LeadEvent.create({ organization: org, contact: c._id, kind: "click", text: `Clicou no link da DM${host ? ` (${host})` : ""}.`, data: { code, automation: String(link.automation) }, at: new Date(now) }).catch(() => {});
    }
  }
  return safeHttpUrl(link.url);
}
