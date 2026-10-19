import { json, route } from "@/lib/api";
import { visibleScreens } from "@/lib/help/help";

// AJUDA: os guias de cada tela (print da própria tela com números e o que cada número faz). Iguais para
// todos os clientes (vêm de docs/ajuda/telas/*.md); os de telas de administrador só para ele.
export const GET = route("org", async ({ session }) => json(visibleScreens(Boolean(session?.isAdmin))));
