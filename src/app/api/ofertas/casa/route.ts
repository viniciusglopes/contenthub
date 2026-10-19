import { json, route } from "@/lib/api";
import { FriendlyError } from "@/lib/errors";
import { COVERAGE_NOTE, MODULE_OFF, listHouseOffers, moduleEnabled, rulesForScreen } from "@/lib/offers/offers";

// LISTA DA CASA (curadoria da plataforma), para quem tem o módulo Ofertas. Favoritos são do usuário.
export const GET = route("org", async ({ org, session }) => {
  const s = session!;
  if (!(await moduleEnabled(s))) throw new FriendlyError(MODULE_OFF, 403);
  const admin = s.isAdmin && !s.impersonating;
  const r = await listHouseOffers(org, s.userId, { includeArchived: admin });
  return json({ offers: r.offers, newToday: r.newToday, rules: rulesForScreen(r.settings.heatRules), countries: r.settings.countries, canAdmin: admin, note: COVERAGE_NOTE });
});
