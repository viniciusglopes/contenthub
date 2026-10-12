import { json, route } from "@/lib/api";
import { connectedAccounts, loadInsightData, mediaSinceOf } from "@/lib/instagram/data";
import { hasPeriodParams, periodFromParams } from "@/lib/instagram/period";
import { buildMondayReport, buildPeriodReport, buildXrayReport } from "@/lib/instagram/report";

// Devolve o relatório em TEXTO PLANO dentro de um JSON (pronto para o Telegram).
// Atalhos: ?tipo=segunda (padrão) ou ?tipo=raiox.
// Período escolhido: ?periodo=7d|30d|90d|mes|mes-passado · ?dias=N · ?de=AAAA-MM-DD&ate=AAAA-MM-DD
// (com período, o relatório é o "do período" e o `tipo` é ignorado). ?project=<id> opcional.
// Com login: só as contas do cliente da sessão. Com "Authorization: Bearer <CRON_TOKEN>":
// percorre TODAS as organizações ativas. Só lê o banco: não chama a Meta.
export const GET = route("org+cron", async ({ orgs, req, cron }) => {
  const q = req.nextUrl.searchParams;
  const period = hasPeriodParams(q) ? periodFromParams(q) : null;
  const tipo = period ? "periodo" : q.get("tipo") === "raiox" ? "raiox" : "segunda";
  const project = cron ? null : q.get("project");
  const reports = [];
  for (const org of orgs) {
    const accounts = await connectedAccounts(org._id, { project });
    for (const account of accounts.filter((a) => a.active)) {
      const { daily, media } = await loadInsightData(org._id, account._id, Date.now(), period?.prevFrom);
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
        text: period
          ? buildPeriodReport({ ...input, period, mediaSince: mediaSinceOf(account) })
          : tipo === "raiox"
            ? buildXrayReport(input)
            : buildMondayReport(input),
      });
    }
  }
  return json({ tipo, period, generatedAt: new Date().toISOString(), organizations: orgs.length, reports });
});
