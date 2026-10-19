import { json, route } from "@/lib/api";
import { deleteOrgOffer, offerSettings, publicOffer, updateOrgOffer } from "@/lib/offers/offers";
import { dayKey } from "@/lib/instagram/dates";

// Editar etiquetas, links e forma de contar de uma oferta da organização.
export const PUT = route("org", async ({ org, params, body }) => {
  const p = await updateOrgOffer(org, params.id, await body());
  const { heatRules } = await offerSettings();
  return json(publicOffer(p, [], heatRules, "org", new Set(), dayKey(Date.now())));
});

// Apaga a oferta, o histórico dela e os favoritos que apontam para ela.
export const DELETE = route("org", async ({ org, params }) => {
  await deleteOrgOffer(org, params.id);
  return json({ ok: true });
});
