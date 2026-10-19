import { json, route } from "@/lib/api";
import { FriendlyError } from "@/lib/errors";
import { monthlyReport, moduleEnabled, MODULE_OFF } from "@/lib/offers/offers";

// "Mais escaladas do mês" da lista da casa: ?mes=AAAA-MM (padrão: mês atual). Texto plano + itens.
export const GET = route("org", async ({ session, req }) => {
  if (!(await moduleEnabled(session!))) throw new FriendlyError(MODULE_OFF, 403);
  return json(await monthlyReport(req.nextUrl.searchParams.get("mes")));
});
