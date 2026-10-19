import { json, route } from "@/lib/api";
import { eraseContact, publicContact, updateContactFields } from "@/lib/automations/crud";
import { clientIp } from "@/lib/session";

// Etiquetas, campos e "parou de receber".
export const PUT = route("org", async ({ org, params, body }) => json(publicContact(await updateContactFields(org, params.id, await body()))));

// Excluir a pedido da pessoa (LGPD): só o dono.
export const DELETE = route("owner", async ({ org, params, session, req }) => {
  await eraseContact(org, session!, params.id, clientIp(req));
  return json({ ok: true });
});
