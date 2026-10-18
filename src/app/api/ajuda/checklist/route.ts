import { json, route } from "@/lib/api";
import { checklist } from "@/lib/help/help";

// PRIMEIROS PASSOS: o andamento real de cada passo para um projeto (?project=) da organização da sessão.
export const GET = route("org", async ({ org, req, id }) => json(await checklist(org, id(req.nextUrl.searchParams.get("project"), "Projeto"))));
