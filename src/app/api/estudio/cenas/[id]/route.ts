import { json, route } from "@/lib/api";
import { deleteScene, updateScene } from "@/lib/studio/cenas";

// Edita categoria, tags, título ou liga/desliga uma cena ({ category, tags, title, active }).
export const PUT = route("org", async ({ org, params, id, body }) => json(await updateScene(org, id(params.id, "Cena"), await body())));

// Apaga a cena (arquivo e capa). Vídeos já gerados não mudam.
export const DELETE = route("org", async ({ org, params, id }) => {
  await deleteScene(org, id(params.id, "Cena"));
  return json({ ok: true });
});
