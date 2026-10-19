import { json, route } from "@/lib/api";
import { createSite, publicSite } from "@/lib/tracking/collect";

// Script de rastreamento de um projeto (um por projeto). Só o dono (tem o token da API de Conversões).
export const POST = route("owner", async ({ org, body }) => json(publicSite(await createSite(org, await body())), 201));
