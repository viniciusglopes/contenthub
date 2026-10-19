import { json, route } from "@/lib/api";
import { addNote } from "@/lib/crm/leads";

export const POST = route("org", async ({ org, params, body, session }) => json(await addNote(org, params.id, (await body()).text, session!.user), 201));
