import { json, route } from "@/lib/api";
import { deleteSite, publicSite, updateSite } from "@/lib/tracking/collect";

export const PUT = route("owner", async ({ org, params, body }) => json(publicSite(await updateSite(org, params.id, await body()))));
export const DELETE = route("owner", async ({ org, params }) => {
  await deleteSite(org, params.id);
  return json({ ok: true });
});
