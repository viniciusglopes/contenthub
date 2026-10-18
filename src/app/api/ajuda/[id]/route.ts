import { json, route } from "@/lib/api";
import { getArticle } from "@/lib/help/help";

// Um artigo da Ajuda. Artigo de administrador para quem não é: 404 (igual a "não existe").
export const GET = route("org", async ({ params, session }) => json(getArticle(String(params.id || ""), Boolean(session?.isAdmin))));
