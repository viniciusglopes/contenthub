import { json, route } from "@/lib/api";
import { deletePage, publicPage, updatePage } from "@/lib/crm/leadads";

export const PUT = route("owner", async ({ org, params, body }) => json(publicPage(await updatePage(org, params.id, await body()))));
export const DELETE = route("owner", async ({ org, params }) => {
  await deletePage(org, params.id);
  return json({ ok: true });
});
