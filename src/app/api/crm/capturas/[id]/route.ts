import { json, route } from "@/lib/api";
import { deleteCapture, publicCapture, updateCapture } from "@/lib/crm/capture";

/* eslint-disable @typescript-eslint/no-explicit-any */
const orgName = (o: any) => o?.brand?.displayName || o?.name || "empresa";

export const PUT = route("org", async ({ org, params, body, session }) => json(await publicCapture(org, (await updateCapture(org, params.id, await body())).toObject(), orgName(session!.organization))));
export const DELETE = route("owner", async ({ org, params }) => {
  await deleteCapture(org, params.id);
  return json({ ok: true });
});
