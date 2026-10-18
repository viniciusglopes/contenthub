import { json, route } from "@/lib/api";
import { createTemplate, listTemplates } from "@/lib/studio/cenas";

// PADRÕES DE VÍDEO do projeto (?project=).
export const GET = route("org", async ({ org, req, id }) => json(await listTemplates(org, id(req.nextUrl.searchParams.get("project"), "Projeto"))));

// Cria um padrão: { project, name, settings, isDefault } ou "salvar como padrão" { project, name, fromJob }.
export const POST = route("org", async ({ org, body, id, session }) => {
  const b = await body();
  return json(await createTemplate(org, id(b.project, "Projeto"), b, session!.user._id), 201);
});
