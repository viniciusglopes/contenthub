import { json, route } from "@/lib/api";
import { deleteTemplate, updateTemplate } from "@/lib/studio/cenas";

// Edita um padrão: { name, settings (parcial, por cima do atual), isDefault }.
export const PUT = route("org", async ({ org, params, id, body }) => json(await updateTemplate(org, id(params.id, "Padrão"), await body())));

export const DELETE = route("org", async ({ org, params, id }) => {
  await deleteTemplate(org, id(params.id, "Padrão"));
  return json({ ok: true });
});
