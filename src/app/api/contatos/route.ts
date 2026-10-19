import { NextResponse } from "next/server";
import { json, route } from "@/lib/api";
import { contactsCsv, listContacts } from "@/lib/automations/crud";

// Contatos das automações (por organização). ?formato=csv exporta (com cuidado contra fórmula na planilha).
export const GET = route("org", async ({ org, req }) => {
  const r = await listContacts(org, req.nextUrl.searchParams);
  if (req.nextUrl.searchParams.get("formato") === "csv")
    return new NextResponse(contactsCsv(r.contacts), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="contatos.csv"', "Cache-Control": "no-store" } });
  return json(r);
});
