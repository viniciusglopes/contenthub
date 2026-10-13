import { json, route } from "@/lib/api";
import { kitInput, loadKit } from "@/lib/studio/kit";
import { assertProject } from "@/lib/orgs";
import BrandKit from "@/models/BrandKit";

// KIT DE MARCA do projeto (?project=). Sem kit salvo devolve um em branco com o nome do projeto.
export const GET = route("org", async ({ org, req, id }) => {
  return json((await loadKit(org, id(req.nextUrl.searchParams.get("project"), "Projeto"))).kit);
});

export const PUT = route("org", async ({ org, body, id }) => {
  const b = await body();
  const project = id(b.project, "Projeto");
  await assertProject(org, project);
  await BrandKit.findOneAndUpdate({ organization: org, project }, { $set: kitInput(b), $setOnInsert: { organization: org, project } }, { upsert: true });
  return json((await loadKit(org, project)).kit);
});
