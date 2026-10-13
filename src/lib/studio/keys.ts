import { decrypt, encrypt } from "@/lib/crypto";
import { FriendlyError, notFound } from "@/lib/errors";
import { PURPOSE_KEYS, type Purpose, SERVICES, isPurpose, isService } from "./catalog";
import { testKey } from "./providers";

/* eslint-disable @typescript-eslint/no-explicit-any */

// CHAVES DE IA (do cliente e da casa: mesma forma). A chave é gravada criptografada
// (AES-256-GCM, CONTENTHUB_ENC_KEY) e NUNCA volta para a tela: só "tem chave" e os 4 últimos
// caracteres não saem. O que sai: para que serve, modelo, campos não secretos e o último teste.

const mapOf = (m: any): Record<string, string> => (m instanceof Map ? Object.fromEntries(m) : m || {});

export function publicKey(doc: any) {
  const d = typeof doc.toObject === "function" ? doc.toObject({ flattenMaps: true }) : doc;
  const creds = mapOf(d.credentials);
  const spec = SERVICES[d.service];
  return {
    service: d.service, active: d.active !== false, hasKey: Boolean(creds.apiKey),
    purposes: (d.purposes || []).filter((p: string) => isPurpose(p) && spec.purposes[p]),
    models: Object.fromEntries(Object.entries(mapOf(d.models)).filter(([p]) => isPurpose(p))),
    extra: Object.fromEntries((spec.extra || []).map((f) => [f.key, String(creds[f.key] || "")])),
    lastTest: d.lastTest?.at ? { at: d.lastTest.at, ok: Boolean(d.lastTest.ok), message: d.lastTest.message || "" } : null,
    updatedAt: d.updatedAt || null,
  };
}
export const studioKeys = (docs: any[]) => docs.filter((d) => isService(d.service)).map(publicKey);

export function cleanChains(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of PURPOSE_KEYS) {
    const list = Array.isArray((raw as any)?.[p]) ? (raw as any)[p] : [];
    out[p] = [...new Set<string>(list.filter((s: unknown) => isService(s) && SERVICES[s as string].purposes[p]))];
  }
  return out;
}

/** Cria ou altera a chave de um serviço. `scope` = { organization } para cliente, {} para a casa. */
export async function saveKey(Model: any, scope: Record<string, unknown>, body: Record<string, any>): Promise<any> {
  const service = String(body.service || "");
  if (!isService(service)) throw new FriendlyError("Escolha o provedor.", 400, "service");
  const spec = SERVICES[service];
  const doc = (await Model.findOne({ ...scope, service })) || new Model({ ...scope, service, label: spec.label, credentials: {}, purposes: Object.keys(spec.purposes) });
  if (doc.label !== undefined) doc.label = spec.label;
  const apiKey = String(body.apiKey || "").trim();
  if (apiKey) {
    if (apiKey.length < 8 || apiKey.length > 400 || /\s/.test(apiKey)) throw new FriendlyError("A chave parece incompleta. Copie de novo, inteira e sem espaços.", 400, "apiKey");
    doc.credentials.set("apiKey", encrypt(apiKey));
    doc.lastTest = { at: null, ok: false, message: "" };
  } else if (!doc.credentials.get("apiKey")) throw new FriendlyError("Cole a chave do provedor.", 400, "apiKey");
  if (body.purposes !== undefined) {
    const list = (Array.isArray(body.purposes) ? body.purposes : []).filter((p: unknown) => isPurpose(p) && spec.purposes[p as Purpose]);
    if (!list.length) throw new FriendlyError("Marque para que a chave serve.", 400, "purposes");
    doc.purposes = [...new Set(list)];
  }
  if (body.models && typeof body.models === "object")
    for (const p of PURPOSE_KEYS) {
      const m = body.models[p];
      if (m === undefined) continue;
      if (m && spec.purposes[p]?.some((x) => x.id === m)) doc.models.set(p, m);
      else doc.models.delete(p);
    }
  for (const f of spec.extra || []) {
    if (body.extra?.[f.key] === undefined) continue;
    const v = String(body.extra[f.key]).trim();
    if (v && !/^[A-Za-z0-9_-]{2,60}$/.test(v)) throw new FriendlyError(`Confira o campo "${f.label}".`, 400, f.key);
    if (v) doc.credentials.set(f.key, v);
    else doc.credentials.delete(f.key);
  }
  if (body.active !== undefined) doc.active = Boolean(body.active);
  await doc.save();
  return doc;
}

/** "Testar chave": uma consulta de leitura ao provedor. Só roda quando alguém clica. */
export async function runKeyTest(Model: any, scope: Record<string, unknown>, service: unknown) {
  if (!isService(service)) throw notFound("Chave");
  const doc: any = await Model.findOne({ ...scope, service });
  const raw = doc?.credentials?.get("apiKey");
  if (!doc || !raw) throw notFound("Chave");
  const creds = mapOf(doc.credentials);
  const r = await testKey({ service, apiKey: decrypt(String(raw)), model: "", extra: creds });
  doc.lastTest = { at: new Date(), ok: r.ok, message: r.message.slice(0, 200) };
  await doc.save();
  return { ...r, key: publicKey(doc) };
}
