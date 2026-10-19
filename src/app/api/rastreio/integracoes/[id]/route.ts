import { json, route } from "@/lib/api";
import { deleteIntegration, publicIntegration, updateIntegration } from "@/lib/tracking/sales";

export const PUT = route("owner", async ({ org, params, body }) => json(publicIntegration(await updateIntegration(org, params.id, await body()))));
export const DELETE = route("owner", async ({ org, params }) => {
  await deleteIntegration(org, params.id);
  return json({ ok: true });
});
