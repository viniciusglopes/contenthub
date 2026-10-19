import { NextResponse } from "next/server";
import { json, route } from "@/lib/api";
import { createManualLead, leadsCsv, listLeads, publicLead } from "@/lib/crm/leads";

// CRM: lista dos leads (kanban e lista usam a mesma) com filtros no link; ?formato=csv exporta.
export const GET = route("org", async ({ org, req, session }) => {
  const p = req.nextUrl.searchParams;
  const r = await listLeads(org, p, session);
  if (p.get("formato") === "csv")
    return new NextResponse(leadsCsv(r.leads, r.pipeline), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="leads.csv"', "Cache-Control": "no-store" } });
  return json({ ...r, pipeline: { _id: String(r.pipeline._id), name: r.pipeline.name } });
});

// Cadastro à mão (com consentimento declarado para e-mail/telefone). Mesmo e-mail/telefone = atualiza o existente.
export const POST = route("org", async ({ org, body, session }) => {
  const r = await createManualLead(org, await body(), session!.user);
  return json({ lead: publicLead(r.contact), created: r.created, deduped: r.deduped }, r.created ? 201 : 200);
});
