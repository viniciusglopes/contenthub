import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { exportLead } from "@/lib/crm/leads";

// Tudo o que existe sobre a pessoa (pedido de acesso/portabilidade, LGPD). Só o dono. Fica registrado.
export const GET = route("owner", async ({ org, params, session }) => {
  const data = await exportLead(org, params.id, session!.user);
  return new NextResponse(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="dados-do-lead.json"', "Cache-Control": "no-store" } });
});
