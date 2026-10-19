import { json, route } from "@/lib/api";
import { deleteTask, publicTask, updateTask } from "@/lib/crm/leads";

export const PUT = route("org", async ({ org, params, body, session }) => json(publicTask(await updateTask(org, params.id, await body(), session!.user))));
export const DELETE = route("org", async ({ org, params }) => {
  await deleteTask(org, params.id);
  return json({ ok: true });
});
