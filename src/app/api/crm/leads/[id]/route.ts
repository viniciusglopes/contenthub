import { json, route } from "@/lib/api";
import { eraseContact } from "@/lib/automations/crud";
import { leadDetail, updateLead } from "@/lib/crm/leads";
import { clientIp } from "@/lib/session";

// Detalhe do lead: dados, linha do tempo, tarefas, consentimentos e possíveis repetidos.
export const GET = route("org", async ({ org, params }) => json(await leadDetail(org, params.id)));

// Etapa, responsável, valor, etiquetas, campos, nome, e-mail/telefone (com consentimento).
export const PUT = route("org", async ({ org, params, body, session }) => {
  await updateLead(org, params.id, await body(), session!.user);
  return json(await leadDetail(org, params.id));
});

// Excluir a pedido da pessoa (LGPD): só o dono. Apaga o lead, a linha do tempo e as tarefas.
export const DELETE = route("owner", async ({ org, params, session, req }) => {
  await eraseContact(org, session!, params.id, clientIp(req));
  return json({ ok: true });
});
