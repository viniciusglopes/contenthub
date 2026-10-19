import { json, route } from "@/lib/api";
import { testCapi } from "@/lib/tracking/overview";
import { clientIp } from "@/lib/session";

// Evento de teste na API de Conversões (com o código de teste do Gerenciador de Eventos). Só o dono; só com as chaves ligadas.
export const POST = route("owner", async ({ org, params, req }) => json(await testCapi(org, params.id, { ip: clientIp(req), ua: req.headers.get("user-agent") || "" })));
