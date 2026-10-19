import { json, route } from "@/lib/api";
import { FriendlyError } from "@/lib/errors";
import { findHouseOffer, history, moduleEnabled, MODULE_OFF } from "@/lib/offers/offers";

// Histórico de uma oferta da lista da casa (módulo Ofertas).
export const GET = route("org", async ({ session, params }) => {
  const s = session!;
  if (!(await moduleEnabled(s))) throw new FriendlyError(MODULE_OFF, 403);
  return json(await history("casa", await findHouseOffer(params.id, { activeOnly: !(s.isAdmin && !s.impersonating) }), null));
});
