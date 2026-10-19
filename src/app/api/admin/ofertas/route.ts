import { json, route } from "@/lib/api";
import { audit } from "@/lib/orgs";
import { clientIp } from "@/lib/session";
import { createHouseOffer, listHouseOffers, publicOffer, offerSettings } from "@/lib/offers/offers";
import { dayKey } from "@/lib/instagram/dates";

/* eslint-disable @typescript-eslint/no-explicit-any */

// LISTA DA CASA (administrador da plataforma): todas, inclusive arquivadas.
export const GET = route("admin", async ({ org, session }) => {
  const r = await listHouseOffers(org, session!.userId, { includeArchived: true });
  return json({ offers: r.offers, newToday: r.newToday });
});

// Nova oferta na lista da casa: mesmo formato da oferta da organização.
export const POST = route("admin", async ({ body, session, req }) => {
  const p: any = await createHouseOffer(await body(), session!.user.email);
  await audit({ action: "ofertas.casa_adicionada", actor: session!.user, ip: clientIp(req) });
  const { heatRules } = await offerSettings();
  return json(publicOffer(p.toObject(), [], heatRules, "casa", new Set(), dayKey(Date.now())), 201);
});
