import { json, route } from "@/lib/api";
import { leadAdsOverview } from "@/lib/crm/leadads";

// Formulários da Meta: chaves, Páginas cadastradas e os últimos avisos recebidos (com a situação).
export const GET = route("org", async ({ org, session }) => json(await leadAdsOverview(org, session!.organization)));
