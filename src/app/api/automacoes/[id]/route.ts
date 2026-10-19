import { json, route } from "@/lib/api";
import { deleteAutomation, ownAutomation, publicAutomation, updateAutomation } from "@/lib/automations/crud";
import { clientIp } from "@/lib/session";

export const GET = route("org", async ({ org, params }) => json(await publicAutomation(org, await ownAutomation(org, params.id))));

// Editar. Ligar/desligar e sair do ensaio: só o dono (e sair do ensaio pede confirm: true).
export const PUT = route("org", async ({ org, params, session, body, req }) => {
  const a = await updateAutomation(org, session!, params.id, await body(), clientIp(req));
  return json(await publicAutomation(org, a));
});

// Apaga a automação e os links dela; o histórico de execuções fica (com o nome).
export const DELETE = route("owner", async ({ org, params }) => {
  await deleteAutomation(org, params.id);
  return json({ ok: true });
});
