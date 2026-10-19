import { json, route } from "@/lib/api";
import { createIntegration, publicIntegration } from "@/lib/tracking/sales";

// Integração de vendas (Hotmart ou Kiwify): devolve a URL do webhook para colar no provedor. Só o dono.
export const POST = route("owner", async ({ org, body }) => json(publicIntegration(await createIntegration(org, await body())), 201));
