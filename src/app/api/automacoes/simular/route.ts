import { json, route } from "@/lib/api";
import { simulate } from "@/lib/automations/crud";

// Testar uma automação com um comentário/mensagem inventado: SEMPRE em ensaio, nunca chama a Meta,
// funciona com as chaves desligadas. Fica no log marcado como simulação.
export const POST = route("org", async ({ org, session, body }) => json(await simulate(org, session!, await body())));
