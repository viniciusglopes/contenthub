import { json, route } from "@/lib/api";
import { crmOptions } from "@/lib/crm/options";

// Tudo o que os filtros e formulários do CRM precisam: funis, equipe, etiquetas, origens e campanhas.
export const GET = route("org", async ({ org, session }) => json(await crmOptions(org, session!)));
