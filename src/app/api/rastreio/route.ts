import { json, route } from "@/lib/api";
import { trackingOverview } from "@/lib/tracking/overview";

// Rastreamento: chaves, scripts por projeto, integrações de venda, vendas recentes e envios à Meta.
export const GET = route("org", async ({ org, session }) => json(await trackingOverview(org, session!)));
