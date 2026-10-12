import { json, route } from "@/lib/api";
import { publicAccount } from "@/lib/instagram/accounts";
import { connectedAccounts, loadInsightData } from "@/lib/instagram/data";
import { mockEnabled } from "@/lib/instagram/mock";
import { buildDashboard } from "@/lib/instagram/stats";

export const GET = route("org", async ({ org, req }) => {
  const project = req.nextUrl.searchParams.get("project");
  const accountId = req.nextUrl.searchParams.get("account");
  const accounts = await connectedAccounts(org, { project });
  const account = accounts.find((a) => String(a._id) === accountId) || accounts[0];
  if (!account) return json({ account: null, accounts: [], dashboard: null, demo: mockEnabled() });
  const { daily, media } = await loadInsightData(org, account._id);
  return json({
    account: publicAccount(account),
    accounts: accounts.map(publicAccount),
    dashboard: buildDashboard(daily, media),
    demo: mockEnabled(),
  });
});
