import { json, route } from "@/lib/api";
import { audit } from "@/lib/orgs";
import { clientIp } from "@/lib/session";
import { offerSettings, publicOffer, updateHouseOffer } from "@/lib/offers/offers";
import { dayKey } from "@/lib/instagram/dates";

// Editar uma oferta da lista da casa (inclui { active: false } para arquivar e true para voltar).
export const PUT = route("admin", async ({ params, body, session, req }) => {
  const p = await updateHouseOffer(params.id, await body());
  await audit({ action: "ofertas.casa_alterada", actor: session!.user, ip: clientIp(req) });
  const { heatRules } = await offerSettings();
  return json(publicOffer(p, [], heatRules, "casa", new Set(), dayKey(Date.now())));
});

// "Apagar" da lista da casa = ARQUIVAR: some para os clientes, o histórico fica (dá para voltar).
export const DELETE = route("admin", async ({ params, session, req }) => {
  await updateHouseOffer(params.id, { active: false });
  await audit({ action: "ofertas.casa_arquivada", actor: session!.user, ip: clientIp(req) });
  return json({ ok: true, archived: true });
});
