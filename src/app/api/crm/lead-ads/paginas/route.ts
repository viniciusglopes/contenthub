import { json, route } from "@/lib/api";
import { createPage, publicPage } from "@/lib/crm/leadads";

// Cadastrar Página (id + token da Página com leads_retrieval). Confere o token só com leitura. Só o dono.
export const POST = route("owner", async ({ org, body }) => json(publicPage(await createPage(org, await body())), 201));
