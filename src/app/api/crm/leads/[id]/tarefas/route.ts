import { json, route } from "@/lib/api";
import { createTask, publicTask } from "@/lib/crm/leads";

// Tarefa / lembrete do lead (sem responsável = quem criou).
export const POST = route("org", async ({ org, params, body, session }) => json(publicTask(await createTask(org, params.id, await body(), session!.user)), 201));
