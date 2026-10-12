import { json, route } from "@/lib/api";
import { FriendlyError } from "@/lib/errors";
import { assertProject } from "@/lib/orgs";

export const GET = route("org", async ({ org, params, id }) => json(await assertProject(org, id(params.id, "Projeto"))));

// Edita o projeto. Para tirar de cena, { active: false } (nada é apagado).
export const PUT = route("org", async ({ org, params, id, body }) => {
  const project = await assertProject(org, id(params.id, "Projeto"));
  const b = await body();
  if (b.name !== undefined) {
    const name = String(b.name).trim().slice(0, 80);
    if (name.length < 2) throw new FriendlyError("Dê um nome ao projeto.", 400, "name");
    project.name = name;
  }
  if (b.description !== undefined) project.description = String(b.description).slice(0, 300);
  if (b.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(b.color)) project.color = b.color;
  if (b.icon !== undefined) project.icon = String(b.icon).slice(0, 8);
  if (b.active !== undefined) project.active = Boolean(b.active);
  await project.save();
  return json(project);
});
