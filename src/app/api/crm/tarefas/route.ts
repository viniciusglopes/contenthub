import { json, route } from "@/lib/api";
import { listTasks } from "@/lib/crm/leads";

// Tarefas abertas da equipe (?minhas=1 só as minhas; ?feitas=1 as concluídas).
export const GET = route("org", async ({ org, req, session }) => json({ tasks: await listTasks(org, req.nextUrl.searchParams, session!) }));
