import { json, route } from "@/lib/api";
import { COVERAGE_NOTE, LANGUAGES, NICHES, STRUCTURES, createOrgOffer, listOrgOffers, moduleEnabled, offerSettings, orgLibraryToken, publicOffer, rulesForScreen } from "@/lib/offers/offers";
import { dayKey } from "@/lib/instagram/dates";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Ofertas da organização (Concorrentes › Ofertas): cartões com contagem, deltas, selo e favoritos do usuário.
export const GET = route("org", async ({ org, session }) => {
  const s = session!;
  const [{ offers, settings }, token] = await Promise.all([listOrgOffers(org, s.userId), orgLibraryToken(org)]);
  return json({
    offers,
    rules: rulesForScreen(settings.heatRules),
    countries: settings.countries,
    token: token ? token.kind : null,
    module: await moduleEnabled(s),
    canAdmin: s.isAdmin && !s.impersonating,
    note: COVERAGE_NOTE,
    labels: { structure: STRUCTURES, niche: NICHES, language: LANGUAGES },
  });
});

// Nova oferta: { name, pageId?, offerUrl?, counting: "api"|"manual", tags: { structure, niche, product, language, countries }, notes? }
export const POST = route("org", async ({ org, body, session }) => {
  const p: any = await createOrgOffer(org, await body(), session!.userId);
  const { heatRules } = await offerSettings();
  return json(publicOffer(p.toObject(), [], heatRules, "org", new Set(), dayKey(Date.now())), 201);
});
