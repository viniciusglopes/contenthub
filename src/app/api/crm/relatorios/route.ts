import { NextResponse } from "next/server";
import { json, route } from "@/lib/api";
import { buildReport, reportCsv } from "@/lib/crm/reports";

// Leads e vendas por campanha/conjunto/anúncio/post/origem no período, com custo do Tráfego quando o id bate.
export const GET = route("org", async ({ org, req }) => {
  const r = await buildReport(org, req.nextUrl.searchParams);
  if (req.nextUrl.searchParams.get("formato") === "csv")
    return new NextResponse(reportCsv(r), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="relatorio-leads-${r.group}.csv"`, "Cache-Control": "no-store" } });
  return json(r);
});
