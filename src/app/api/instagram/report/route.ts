import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { connectedAccounts, handle, loadInsightData } from "@/lib/instagram/data";
import { buildMondayReport, buildXrayReport } from "@/lib/instagram/report";

// Devolve o relatório em TEXTO PLANO dentro de um JSON (pronto para o Telegram).
// ?tipo=segunda (padrão) ou ?tipo=raiox · ?project=<id> opcional (sem ele: todas as contas).
// Aceita login ou "Authorization: Bearer <CRON_TOKEN>". Só lê o banco: não chama a Meta.
export async function GET(req: NextRequest) {
  return handle(async () => {
    await connectDB();
    const tipo = req.nextUrl.searchParams.get("tipo") === "raiox" ? "raiox" : "segunda";
    const accounts = await connectedAccounts({ project: req.nextUrl.searchParams.get("project") });
    const reports = [];
    for (const account of accounts.filter((a) => a.active)) {
      const { daily, media } = await loadInsightData(account._id);
      const input = { username: account.username || account.accountName, daily, media, lastSync: account.lastSync };
      const project = account.project as { _id?: unknown; name?: string } | null;
      reports.push({
        projectId: String(project?._id ?? ""),
        projectName: project?.name ?? "",
        username: account.username,
        lastSync: account.lastSync,
        lastSyncError: account.lastSyncError || "",
        text: tipo === "raiox" ? buildXrayReport(input) : buildMondayReport(input),
      });
    }
    return NextResponse.json({ tipo, generatedAt: new Date().toISOString(), reports });
  });
}
