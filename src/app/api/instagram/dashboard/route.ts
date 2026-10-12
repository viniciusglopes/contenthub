import { json, route } from "@/lib/api";
import { publicAccount } from "@/lib/instagram/accounts";
import { connectedAccounts, loadInsightData, mediaSinceOf } from "@/lib/instagram/data";
import { mockEnabled } from "@/lib/instagram/mock";
import { periodFromParams } from "@/lib/instagram/period";
import { buildPeriodDashboard } from "@/lib/instagram/stats";

// Painel de UMA conta da organização da sessão, no período pedido.
// Período: ?periodo=7d|30d|90d|mes|mes-passado · ou ?dias=N · ou ?de=AAAA-MM-DD&ate=AAAA-MM-DD.
// Sem nada: 30 dias. Período inválido: 400 com mensagem e o campo. Só lê o banco.
export const GET = route("org", async ({ org, req }) => {
  const q = req.nextUrl.searchParams;
  const period = periodFromParams(q);
  const project = q.get("project");
  const accountId = q.get("account");
  const accounts = await connectedAccounts(org, { project });
  const account = accounts.find((a) => String(a._id) === accountId) || accounts[0];
  if (!account) return json({ account: null, accounts: [], dashboard: null, period, demo: mockEnabled() });
  // Lê o histórico inteiro da conta (é pequeno): a cobertura "desde quando há dado" sai dele.
  const { daily, media } = await loadInsightData(org, account._id, Date.now(), "2000-01-01");
  const dashboard = buildPeriodDashboard(daily, media, period, { mediaSince: mediaSinceOf(account) });
  const oldest = media[media.length - 1]?.timestamp ?? null;
  return json({
    account: publicAccount(account),
    accounts: accounts.map(publicAccount),
    dashboard,
    period,
    totals: { posts: media.length, oldestPost: oldest },
    demo: mockEnabled(),
  });
});
