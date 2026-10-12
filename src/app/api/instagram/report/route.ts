import { json, route } from "@/lib/api";
import { connectedAccounts, loadInsightData } from "@/lib/instagram/data";
import { buildMondayReport, buildXrayReport } from "@/lib/instagram/report";

// Devolve o relatório em TEXTO PLANO dentro de um JSON (pronto para o Telegram).
// ?tipo=segunda (padrão) ou ?tipo=raiox · ?project=<id> opcional.
// Com login: só as contas do cliente da sessão. Com "Authorization: Bearer <CRON_TOKEN>":
// percorre TODAS as organizações ativas. Só lê o banco: não chama a Meta.
export const GET = route("org+cron", async ({ orgs, req, cron }) => {
  const tipo = req.nextUrl.searchParams.get("tipo") === "raiox" ? "raiox" : "segunda";
  const project = cron ? null : req.nextUrl.searchParams.get("project");
  const reports = [];
  for (const org of orgs) {
    const accounts = await connectedAccounts(org._id, { project });
    for (const account of accounts.filter((a) => a.active)) {
      const { daily, media } = await loadInsightData(org._id, account._id);
      const input = { username: account.username || account.accountName, daily, media, lastSync: account.lastSync };
      const p = account.project as { _id?: unknown; name?: string } | null;
      reports.push({
        organizationId: String(org._id),
        organizationName: org.name,
        projectId: String(p?._id ?? ""),
        projectName: p?.name ?? "",
        username: account.username,
        lastSync: account.lastSync,
        lastSyncError: account.lastSyncError || "",
        text: tipo === "raiox" ? buildXrayReport(input) : buildMondayReport(input),
      });
    }
  }
  return json({ tipo, generatedAt: new Date().toISOString(), organizations: orgs.length, reports });
});
