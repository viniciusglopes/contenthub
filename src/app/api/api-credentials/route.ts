import { json, route } from "@/lib/api";
import { publicCredentials, sealCredentials } from "@/lib/crypto";
import { FriendlyError } from "@/lib/errors";
import ApiCredential from "@/models/ApiCredential";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Chaves de API do cliente: gravadas criptografadas, nunca devolvidas para a tela.
// Uma por serviço POR organização.
function toPublic(doc: any) {
  const d = typeof doc.toObject === "function" ? doc.toObject({ flattenMaps: true }) : doc;
  const { values, filled } = publicCredentials(d.credentials);
  return { _id: String(d._id), service: d.service, label: d.label, active: d.active, credentials: values, credentialsFilled: filled };
}

const serviceName = (v: unknown) => (/^[a-z0-9_-]{2,40}$/.test(String(v || "")) ? String(v) : "");

export const GET = route("org", async ({ org }) => {
  const credentials = await ApiCredential.find({ organization: org }).sort({ service: 1 }).lean();
  return json(credentials.map(toPublic));
});

export const POST = route("org", async ({ org, body }) => {
  const { service: rawService, label, credentials, active } = await body();
  const service = serviceName(rawService);
  if (!service || !label) throw new FriendlyError("Escolha o serviço antes de salvar.", 400);
  const sealed = sealCredentials(credentials && typeof credentials === "object" ? credentials : {});

  const existing = await ApiCredential.findOne({ organization: org, service });
  if (existing) {
    existing.label = String(label);
    // Campo em branco = manter o que já está gravado.
    for (const [k, v] of Object.entries(sealed)) existing.credentials.set(k, v);
    if (active !== undefined) existing.active = Boolean(active);
    await existing.save();
    return json(toPublic(existing));
  }
  const doc = await ApiCredential.create({
    organization: org,
    service,
    label: String(label),
    credentials: sealed,
    active: active !== undefined ? Boolean(active) : true,
  });
  return json(toPublic(doc), 201);
});

export const DELETE = route("org", async ({ org, req }) => {
  const service = serviceName(req.nextUrl.searchParams.get("service"));
  if (!service) throw new FriendlyError("Serviço não informado.", 400);
  await ApiCredential.deleteOne({ organization: org, service });
  return json({ ok: true });
});
