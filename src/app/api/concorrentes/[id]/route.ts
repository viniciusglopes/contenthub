import { json, route } from "@/lib/api";
import { deleteCompetitor, publicCompetitor, updateCompetitor } from "@/lib/competitors/competitors";

export const PUT = route("org", async ({ org, params, body }) => {
  const c = await updateCompetitor(org, params.id, await body());
  return json(publicCompetitor(c));
});

// Apaga o concorrente e o histórico dele; os produtos ligados ficam, sem o vínculo.
export const DELETE = route("org", async ({ org, params }) => {
  await deleteCompetitor(org, params.id);
  return json({ ok: true });
});
