import { json, route } from "@/lib/api";
import { FriendlyError } from "@/lib/errors";
import { PURPOSE_KEYS, isService } from "@/lib/studio/catalog";
import { settings } from "@/lib/studio/cost";
import { cleanChains, saveKey, studioKeys } from "@/lib/studio/keys";
import { audit } from "@/lib/orgs";
import ApiCredential from "@/models/ApiCredential";
import Organization from "@/models/Organization";
import { HouseCredential } from "@/models/Platform";

/* eslint-disable @typescript-eslint/no-explicit-any */

// CHAVES DE IA da organização da sessão: o que existe, para que serve e a ordem de preferência.
// A chave em si nunca volta. Da casa só se informa QUAIS finalidades estão cobertas.
export const GET = route("org", async ({ org, session }) => {
  const [docs, o, house, cfg]: [any[], any, any[], any] = await Promise.all([
    ApiCredential.find({ organization: org }).lean(),
    Organization.findById(org).select("ai studio").lean(),
    HouseCredential.find({ active: true }).select("service purposes").lean(),
    settings(),
  ]);
  const useHouse = o?.studio?.useHouse !== false;
  const covered = Object.fromEntries(PURPOSE_KEYS.map((p) => [p, useHouse ? cleanChains({ [p]: [...(cfg.chains?.[p] || []), ...house.map((h) => h.service)] })[p].filter((s) => house.some((h) => h.service === s && (h.purposes || []).includes(p))) : []]));
  return json({ keys: studioKeys(docs), chains: cleanChains(o?.ai?.chains), house: covered, useHouse, canManage: session!.canManage });
});

// Salva UMA chave ({ service, apiKey?, purposes, models, extra, active }) e/ou a ordem ({ chains }).
export const PUT = route("owner", async ({ org, body, session, req }) => {
  const b = await body();
  if (b.service !== undefined) {
    await saveKey(ApiCredential, { organization: org }, b);
    await audit({ action: "estudio.chave_salva", actor: session!.user, organization: org, target: String(b.service), ip: req.headers.get("x-forwarded-for") || "" });
  }
  if (b.chains !== undefined) await Organization.updateOne({ _id: org }, { $set: { "ai.chains": cleanChains(b.chains) } });
  if (b.service === undefined && b.chains === undefined) throw new FriendlyError("Nada para salvar.", 400);
  const [docs, o]: [any[], any] = await Promise.all([ApiCredential.find({ organization: org }).lean(), Organization.findById(org).select("ai").lean()]);
  return json({ keys: studioKeys(docs), chains: cleanChains(o?.ai?.chains) });
});

export const DELETE = route("owner", async ({ org, req, session }) => {
  const service = req.nextUrl.searchParams.get("service");
  if (!isService(service)) throw new FriendlyError("Provedor não informado.", 400);
  await ApiCredential.deleteOne({ organization: org, service });
  await audit({ action: "estudio.chave_apagada", actor: session!.user, organization: org, target: service });
  return json({ ok: true });
});
