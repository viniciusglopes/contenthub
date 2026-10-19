import { json, route } from "@/lib/api";
import { deletePipeline, publicPipeline, updatePipeline } from "@/lib/crm/pipelines";

// Editar etapas (nome, ordem, tipo). Etapa com lead só sai com destino (moveTo). Só o dono.
export const PUT = route("owner", async ({ org, params, body }) => json(publicPipeline(await updatePipeline(org, params.id, await body()))));
export const DELETE = route("owner", async ({ org, params }) => {
  await deletePipeline(org, params.id);
  return json({ ok: true });
});
