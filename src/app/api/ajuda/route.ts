import { json, route } from "@/lib/api";
import { visibleArticles } from "@/lib/help/help";

// AJUDA: todos os artigos que esta pessoa pode ver (os de administrador só para ele), com o texto
// (a busca é feita na tela). O conteúdo é o mesmo para todos os clientes: vem de docs/ajuda/*.md.
export const GET = route("org", async ({ session }) => json(visibleArticles(Boolean(session?.isAdmin))));
