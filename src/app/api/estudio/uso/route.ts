import { json, route } from "@/lib/api";
import { FriendlyError } from "@/lib/errors";
import { budgetOf, monthStart, usageReport } from "@/lib/studio/cost";

// USO E CUSTOS da organização da sessão. ?de=AAAA-MM-DD&ate=AAAA-MM-DD (dias de Brasília);
// sem datas = o mês corrente. Devolve também o teto, o gasto do mês e a cotação do dia.
export const GET = route("org", async ({ org, req }) => {
  const q = req.nextUrl.searchParams;
  const day = (v: string | null, end: boolean) => {
    if (!v) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new FriendlyError("Use datas no formato AAAA-MM-DD.", 400, end ? "ate" : "de");
    const d = new Date(`${v}T03:00:00.000Z`);
    if (Number.isNaN(d.getTime())) throw new FriendlyError("Data inválida.", 400, end ? "ate" : "de");
    return end ? new Date(d.getTime() + 86_400_000) : d;
  };
  const from = day(q.get("de"), false) ?? monthStart();
  const to = day(q.get("ate"), true) ?? new Date(Date.now() + 86_400_000);
  if (to <= from) throw new FriendlyError("A data final vem depois da inicial.", 400, "ate");
  return json({ from, to, budget: await budgetOf(org), ...(await usageReport(org, from, to)) });
});
