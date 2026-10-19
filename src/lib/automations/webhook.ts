import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import Organization from "@/models/Organization";
import SocialAccount from "@/models/SocialAccount";
import { AutomationEvent, WebhookDaily } from "@/models/Automation";
import { automationsGlobal } from "./switches";

/* eslint-disable @typescript-eslint/no-explicit-any */

// WEBHOOK DO INSTAGRAM (rota pública /api/instagram/webhook).
// Documentação oficial lida em 18/10/2026 (https://developers.facebook.com/docs/instagram-platform/webhooks):
//  - verificação: GET com hub.mode=subscribe, hub.verify_token e hub.challenge (devolver o challenge);
//  - cada POST vem assinado: cabeçalho X-Hub-Signature-256 = "sha256=" + HMAC-SHA256 do CORPO CRU
//    com o segredo do app. Corpo é conferido ANTES de ler o JSON;
//  - campos assinados por conta: POST /me/subscribed_apps?subscribed_fields=comments,messages,messaging_postbacks.
// Aqui só se confere, separa e GUARDA (idempotente pela chave do evento). Quem processa é o motor
// (engine.ts), no laço do servidor, com atraso aleatório: a resposta à Meta sai rápido.

export const WEBHOOK_FIELDS = ["comments", "messages", "messaging_postbacks", "messaging_referral"] as const;
export const MAX_BODY_BYTES = 512 * 1024;

export function webhookSecret(): string {
  return process.env.IG_WEBHOOK_SECRET || process.env.IG_APP_SECRET || "";
}
export function verifyToken(): string {
  return process.env.IG_WEBHOOK_VERIFY_TOKEN || "";
}

/** Confere a assinatura do corpo cru. Sem segredo configurado, nada passa. */
export function checkSignature(raw: string | Buffer, header: string | null, secret = webhookSecret()): boolean {
  if (!secret || !header) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!m) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  const got = Buffer.from(m[1].toLowerCase(), "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Resposta ao "verificar e salvar" do painel da Meta: o challenge, só com o token certo. */
export function verifyChallenge(params: URLSearchParams): string | null {
  const token = verifyToken();
  if (token.length < 16) return null;
  if (params.get("hub.mode") !== "subscribe") return null;
  const got = params.get("hub.verify_token") || "";
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(token).digest();
  if (!timingSafeEqual(a, b)) return null;
  const challenge = params.get("hub.challenge") || "";
  return /^[\w.-]{1,128}$/.test(challenge) ? challenge : null;
}

export interface ParsedEvent {
  igUserId: string;
  field: "comments" | "messages" | "messaging_postbacks";
  key: string;
  eventAt: number;
  data: Record<string, unknown>;
}

const ms = (t: unknown, fallback: number) => {
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n < 1e12 ? n * 1000 : n;
};
const str = (v: unknown, n = 2000) => (v == null ? "" : String(v).slice(0, n));
const hash = (o: unknown) => createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 24);

/**
 * Indicação de anúncio "clique para o direct" (message.referral: source ADS, ad_id, ads_context_data)
 * ou de link ig.me (messaging[].referral: ref, source, type). Doc oficial lida em 19/10/2026:
 * https://developers.facebook.com/docs/instagram-platform/webhooks/examples
 */
export function slimReferral(r: any): Record<string, string> | null {
  if (!r || typeof r !== "object") return null;
  const out = { source: str(r.source, 200), type: str(r.type, 40), ref: str(r.ref, 200), adId: str(r.ad_id, 40), adTitle: str(r.ads_context_data?.ad_title, 160) };
  if (out.adId && !/^\d{3,30}$/.test(out.adId)) out.adId = "";
  return out.source || out.ref || out.adId ? out : null;
}

function messaging(igUserId: string, ev: any, entryTime: number): ParsedEvent | null {
  if (!ev || typeof ev !== "object") return null;
  const at = ms(ev.timestamp, entryTime);
  const sender = str(ev.sender?.id, 64);
  const recipient = str(ev.recipient?.id, 64);
  if (ev.postback) {
    const mid = str(ev.postback.mid, 300);
    return { igUserId, field: "messaging_postbacks", key: `p:${mid || hash(ev)}`, eventAt: at, data: { senderId: sender, recipientId: recipient, payload: str(ev.postback.payload, 300), title: str(ev.postback.title, 80) } };
  }
  if (ev.message) {
    const msg = ev.message;
    const mid = str(msg.mid, 300);
    return {
      igUserId,
      field: "messages",
      key: `m:${mid || hash(ev)}`,
      eventAt: at,
      data: {
        senderId: sender,
        recipientId: recipient,
        text: str(msg.text, 1000),
        quickReply: str(msg.quick_reply?.payload, 300),
        echo: msg.is_echo === true,
        attachment: Array.isArray(msg.attachments) && msg.attachments.length > 0,
        storyReply: Boolean(msg.reply_to?.story),
        referral: slimReferral(msg.referral),
      },
    };
  }
  if (ev.referral) {
    // pessoa abriu a conversa por link ig.me (sem mensagem ainda): só registra a origem
    const referral = slimReferral(ev.referral);
    if (!referral) return null;
    return { igUserId, field: "messages", key: `r:${hash(ev)}`, eventAt: at, data: { senderId: sender, recipientId: recipient, text: "", quickReply: "", echo: false, attachment: false, storyReply: false, referral } };
  }
  return null;
}

/** Separa o corpo da Meta em eventos que interessam (comentários, mensagens, botões). */
export function parseWebhook(body: any, now = Date.now()): { events: ParsedEvent[]; ignored: number } {
  const events: ParsedEvent[] = [];
  let ignored = 0;
  if (!body || body.object !== "instagram" || !Array.isArray(body.entry)) return { events, ignored: 1 };
  for (const entry of body.entry) {
    const igUserId = str(entry?.id, 64);
    if (!/^\d{5,30}$/.test(igUserId)) { ignored++; continue; }
    const entryTime = ms(entry.time, now);
    for (const ch of Array.isArray(entry.changes) ? entry.changes : []) {
      const v = ch?.value || {};
      if (ch?.field === "comments" && v.id) {
        events.push({
          igUserId,
          field: "comments",
          key: `c:${str(v.id, 64)}`,
          eventAt: entryTime,
          data: { commentId: str(v.id, 64), parentId: str(v.parent_id, 64), mediaId: str(v.media?.id, 64), mediaType: str(v.media?.media_product_type, 20), fromId: str(v.from?.id, 64), fromUsername: str(v.from?.username, 60), text: str(v.text, 1000) },
        });
      } else if ((ch?.field === "messages" || ch?.field === "messaging_postbacks" || ch?.field === "messaging_referral") && v) {
        // o botão "Testar" do painel da Meta manda mensagens dentro de `changes`
        const e = messaging(igUserId, v, entryTime);
        if (e) events.push(e);
        else ignored++;
      } else ignored++;
    }
    for (const ev of Array.isArray(entry.messaging) ? entry.messaging : []) {
      const e = messaging(igUserId, ev, entryTime);
      if (e) events.push(e);
      else ignored++;
    }
  }
  return { events, ignored };
}

async function count(fields: Partial<Record<"received" | "stored" | "duplicate" | "unknownAccount" | "badSignature" | "switchedOff", number>>, now: number) {
  const inc = Object.fromEntries(Object.entries(fields).filter(([, v]) => v));
  if (!Object.keys(inc).length) return;
  await WebhookDaily.updateOne({ day: new Date(now).toISOString().slice(0, 10) }, { $inc: inc }, { upsert: true }).catch(() => {});
}

export const badSignature = (now = Date.now()) => count({ badSignature: 1 }, now);

/** Atraso antes de agir: comentário 5 a 40 s (parece gente, não robô); mensagem 1 a 3 s. */
export function defaultDelay(field: string): number {
  const [lo, hi] = field === "comments" ? [5_000, 40_000] : [1_000, 3_000];
  return lo + Math.floor(Math.random() * (hi - lo));
}

export interface IngestResult { received: number; stored: number; duplicate: number; unknownAccount: number; switchedOff: number; ignored: number }

/**
 * Guarda os eventos já conferidos, um por organização que tem a conta conectada e a automação ligada.
 * ÚNICA consulta entre organizações do sistema fora da migração: achar QUEM tem a conta
 * do Instagram que a Meta informou (entry.id). Só lê organização e id da conta; nada é devolvido
 * para fora; cada evento é gravado já com a organização certa.
 */
export async function ingest(body: any, opts: { now?: number; delay?: (field: string) => number } = {}): Promise<IngestResult> {
  const now = opts.now ?? Date.now();
  const delay = opts.delay ?? defaultDelay;
  const { events, ignored } = parseWebhook(body, now);
  const r: IngestResult = { received: events.length, stored: 0, duplicate: 0, unknownAccount: 0, switchedOff: 0, ignored };
  if (!automationsGlobal()) {
    r.switchedOff = events.length;
    await count({ received: r.received, switchedOff: r.switchedOff }, now);
    return r;
  }
  const byAccount = new Map<string, any[]>();
  for (const igId of new Set(events.map((e) => e.igUserId))) {
    const accounts: any[] = await SocialAccount.find({ platform: "instagram", accountId: igId, active: true })
      .setOptions({ crossOrg: true })
      .select("organization")
      .lean();
    const orgIds = [...new Set(accounts.map((a) => String(a.organization)))];
    const on: any[] = orgIds.length ? await Organization.find({ _id: { $in: orgIds }, active: true, automationsEnabled: true }).select("_id").lean() : [];
    const allowed = new Set(on.map((o) => String(o._id)));
    byAccount.set(igId, accounts.filter((a) => allowed.has(String(a.organization))));
    if (!accounts.length) r.unknownAccount += events.filter((e) => e.igUserId === igId).length;
    else if (!allowed.size) r.switchedOff += events.filter((e) => e.igUserId === igId).length;
  }
  for (const e of events) {
    for (const acc of byAccount.get(e.igUserId) || []) {
      try {
        await AutomationEvent.create({
          organization: acc.organization,
          account: acc._id,
          key: e.key,
          field: e.field,
          data: e.data,
          eventAt: new Date(e.eventAt),
          runAfter: new Date(now + delay(e.field)),
        });
        r.stored++;
      } catch (err: any) {
        if (err?.code === 11000) r.duplicate++;
        else throw err;
      }
    }
  }
  await count({ received: r.received, stored: r.stored, duplicate: r.duplicate, unknownAccount: r.unknownAccount, switchedOff: r.switchedOff }, now);
  return r;
}
