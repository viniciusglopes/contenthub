import { json, route } from "@/lib/api";
import { automationsOverview, createAutomation, publicAutomation } from "@/lib/automations/crud";
import { notFound } from "@/lib/errors";
import { assertProject } from "@/lib/orgs";
import { toObjectId } from "@/lib/tenant";

// Automações do direct (comentou PALAVRA -> resposta pública + DM). Lista, chaves e contas.
export const GET = route("org", async ({ org, req, session }) => {
  const raw = req.nextUrl.searchParams.get("project");
  let project = null;
  if (raw) {
    project = toObjectId(raw);
    if (!project) throw notFound("Projeto");
    await assertProject(org, project);
  }
  return json(await automationsOverview(org, session!.organization, project));
});

// Nova automação (nasce DESLIGADA e em ENSAIO, a não ser que o dono diga outra coisa).
export const POST = route("org", async ({ org, session, body }) => {
  const a = await createAutomation(org, session!, await body());
  return json(await publicAutomation(org, a), 201);
});
