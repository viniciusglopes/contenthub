import { json, route } from "@/lib/api";
import { createPipeline, listPipelines, publicPipeline } from "@/lib/crm/pipelines";

// Funis da organização (o padrão nasce sozinho: Novo, Em conversa, Proposta, Ganhou, Perdeu).
export const GET = route("org", async ({ org }) => json({ pipelines: (await listPipelines(org)).map(publicPipeline) }));
export const POST = route("owner", async ({ org, body }) => json(publicPipeline(await createPipeline(org, await body())), 201));
