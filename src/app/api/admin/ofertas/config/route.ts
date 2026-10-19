import { json, route } from "@/lib/api";
import { FriendlyError } from "@/lib/errors";
import { audit } from "@/lib/orgs";
import { clientIp } from "@/lib/session";
import { HouseCredential } from "@/models/Platform";
import { MetaGraphClient } from "@/lib/ads/client";
import { ensureAdsMock } from "@/lib/ads/mock";
import { EU_COUNTRIES, cleanCountries, libraryError } from "@/lib/offers/adlibrary";
import { DEFAULT_HEAT_RULES, cleanHeatRules } from "@/lib/offers/heat";
import { META_LIBRARY_SERVICE, houseLibraryToken, offerSettings, rulesForScreen, saveHouseLibraryToken, saveOfferSettings } from "@/lib/offers/offers";

/* eslint-disable @typescript-eslint/no-explicit-any */

// CONFIGURAÇÃO DO MÓDULO OFERTAS (administrador): regras do selo, países pedidos à API e o token
// da casa para a API da Biblioteca de Anúncios. O token nunca volta: só "tem token" e o último teste.
async function state() {
  const s = await offerSettings();
  const doc: any = await HouseCredential.findOne({ service: META_LIBRARY_SERVICE }).lean();
  return {
    rules: rulesForScreen(s.heatRules),
    customRules: s.custom,
    defaultRules: DEFAULT_HEAT_RULES,
    countries: s.countries,
    euCountries: EU_COUNTRIES,
    countriesFromEnv: Boolean(process.env.OFFERS_AD_COUNTRIES),
    token: { has: Boolean(doc), lastTest: doc?.lastTest?.at ? doc.lastTest : null },
  };
}

export const GET = route("admin", async () => json(await state()));

// { acao: "regras", heatRules } | { acao: "regras_padrao" } | { acao: "paises", countries } |
// { acao: "token", token } | { acao: "testar_token" } | { acao: "apagar_token" }
export const PUT = route("admin", async ({ body, session, req }) => {
  const b = await body();
  const log = (action: string) => audit({ action, actor: session!.user, ip: clientIp(req) });
  if (b.acao === "regras") {
    await saveOfferSettings({ heatRules: cleanHeatRules(b.heatRules) });
    await log("ofertas.regras_alteradas");
  } else if (b.acao === "regras_padrao") {
    await saveOfferSettings({ heatRules: null });
    await log("ofertas.regras_padrao");
  } else if (b.acao === "paises") {
    const c = cleanCountries(b.countries);
    await saveOfferSettings({ countries: c.length ? c : null });
    await log("ofertas.paises_alterados");
  } else if (b.acao === "token") {
    await saveHouseLibraryToken(b.token);
    await log("ofertas.token_salvo");
  } else if (b.acao === "testar_token") {
    ensureAdsMock();
    const t = await houseLibraryToken();
    if (!t) throw new FriendlyError("Cadastre o token primeiro.", 400, "token");
    let ok = true;
    let message = "";
    try {
      // 1 chamada: anúncios ativos que alcançaram Portugal, de qualquer página (limit 1)
      const client = new MetaGraphClient(t);
      await client.get("/ads_archive", { ad_type: "ALL", ad_active_status: "ACTIVE", ad_reached_countries: JSON.stringify(["PT"]), search_terms: "a", fields: "id", limit: 1 });
      message = "Token funcionando na API da Biblioteca de Anúncios (1 chamada).";
    } catch (e) {
      ok = false;
      message = libraryError(e);
    }
    await HouseCredential.updateOne({ service: META_LIBRARY_SERVICE }, { $set: { lastTest: { at: new Date(), ok, message } } });
  } else if (b.acao === "apagar_token") {
    await HouseCredential.deleteOne({ service: META_LIBRARY_SERVICE });
    await log("ofertas.token_apagado");
  } else throw new FriendlyError("Ação desconhecida.", 400);
  return json(await state());
});
