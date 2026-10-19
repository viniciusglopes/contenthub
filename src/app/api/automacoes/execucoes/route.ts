import { json, route } from "@/lib/api";
import { listRuns } from "@/lib/automations/crud";

// Log de execuções: cada passo, o que foi (ou seria) enviado e o erro da Meta quando houve.
export const GET = route("org", async ({ org, req }) => json(await listRuns(org, req.nextUrl.searchParams)));
