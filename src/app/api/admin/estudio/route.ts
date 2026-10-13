import { json, route } from "@/lib/api";
import { FriendlyError, notFound } from "@/lib/errors";
import { audit } from "@/lib/orgs";
import { isService } from "@/lib/studio/catalog";
import { monthStart, settings, spentBetween } from "@/lib/studio/cost";
import { cleanChains, runKeyTest, saveKey, studioKeys } from "@/lib/studio/keys";
import Organization from "@/models/Organization";
import { HouseCredential, PlatformSettings } from "@/models/Platform";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function state() {
  const [cfg, keys, orgs]: [any, any[], any[]] = await Promise.all([settings(), HouseCredential.find({}).lean(), Organization.find({}).select("name studio active").sort({ name: 1 }).lean()]);
  const since = monthStart();
  return {
    settings: { capUsd: cfg.capUsd, confirmAboveUsd: cfg.confirmAboveUsd, maxJobsGlobal: cfg.maxJobsGlobal, maxJobsPerOrg: cfg.maxJobsPerOrg, jobMaxMinutes: cfg.jobMaxMinutes },
    chains: cleanChains(cfg.chains), keys: studioKeys(keys),
    organizations: await Promise.all(orgs.map(async (o) => ({ _id: String(o._id), name: o.name, active: o.active, capUsd: typeof o.studio?.capUsd === "number" ? o.studio.capUsd : null, useHouse: o.studio?.useHouse !== false, aiVisuals: o.studio?.aiVisuals === true, spentUsd: await spentBetween(o._id, since) }))),
  };
}

// ESTÚDIO, lado da plataforma: chaves da casa, ordem padrão, teto padrão e teto de cada cliente.
export const GET = route("admin", async () => json(await state()));

const money = (v: unknown, what: string, max: number) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new FriendlyError(`Confira o valor de "${what}".`, 400);
  return Math.round(n * 100) / 100;
};

// { acao: "config" | "chave" | "apagar_chave" | "testar" | "cliente", ... }
export const PUT = route("admin", async ({ body, session, id, req }) => {
  const b = await body();
  const ip = req.headers.get("x-forwarded-for") || "";
  if (b.acao === "config") {
    const set: Record<string, unknown> = {};
    if (b.capUsd !== undefined) set.capUsd = money(b.capUsd, "teto padrão", 10_000);
    if (b.confirmAboveUsd !== undefined) set.confirmAboveUsd = money(b.confirmAboveUsd, "confirmar acima de", 1000);
    if (b.chains !== undefined) set.chains = cleanChains(b.chains);
    await PlatformSettings.updateOne({ key: "main" }, { $set: set, $setOnInsert: { key: "main" } }, { upsert: true });
    await audit({ action: "estudio.config", actor: session!.user, ip, meta: { capUsd: set.capUsd, confirmAboveUsd: set.confirmAboveUsd } });
  } else if (b.acao === "chave") {
    await saveKey(HouseCredential, {}, b);
    await audit({ action: "estudio.chave_da_casa_salva", actor: session!.user, target: String(b.service), ip });
  } else if (b.acao === "apagar_chave") {
    if (!isService(b.service)) throw notFound("Chave");
    await HouseCredential.deleteOne({ service: b.service });
    await audit({ action: "estudio.chave_da_casa_apagada", actor: session!.user, target: b.service, ip });
  } else if (b.acao === "testar") {
    const r = await runKeyTest(HouseCredential, {}, b.service);
    return json({ test: { ok: r.ok, message: r.message }, ...(await state()) });
  } else if (b.acao === "cliente") {
    const orgId = id(b.organization, "Cliente");
    const set: Record<string, unknown> = {};
    if (b.capUsd !== undefined) set["studio.capUsd"] = b.capUsd === null || b.capUsd === "" ? null : money(b.capUsd, "teto do cliente", 10_000);
    if (b.useHouse !== undefined) set["studio.useHouse"] = Boolean(b.useHouse);
    if (b.aiVisuals !== undefined) set["studio.aiVisuals"] = Boolean(b.aiVisuals);
    const r = await Organization.updateOne({ _id: orgId }, { $set: set });
    if (!r.matchedCount) throw notFound("Cliente");
    await audit({ action: "estudio.teto_do_cliente", actor: session!.user, organization: orgId, ip, meta: set });
  } else throw new FriendlyError("Ação desconhecida.", 400);
  return json(await state());
});
