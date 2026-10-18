import { json, route } from "@/lib/api";
import { publicAdAccount } from "@/lib/ads/accounts";
import { buildAdsDashboard, organicCandidates } from "@/lib/ads/dashboard";
import { adsWriteState } from "@/lib/ads/write";
import { notFound } from "@/lib/errors";
import { periodFromParams } from "@/lib/instagram/period";
import { assertProject } from "@/lib/orgs";
import { toObjectId } from "@/lib/tenant";
import { AdAccount } from "@/models/Ads";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Painel de Tráfego do projeto no período escolhido (o mesmo seletor da tela do Instagram).
// ?project=<id> [&account=<id>] [&periodo=7d|30d|90d|mes|mes-passado | &dias=N | &de=&ate=]
export const GET = route("org", async ({ org, req }) => {
  const p = req.nextUrl.searchParams;
  const period = periodFromParams(p);
  const project = toObjectId(p.get("project"));
  if (!project) throw notFound("Projeto");
  await assertProject(org, project);
  const accounts: any[] = await AdAccount.find({ organization: org, project }).sort({ createdAt: 1 }).lean();
  const wanted = p.get("account");
  const account = wanted ? accounts.find((a) => String(a._id) === wanted) : accounts.find((a) => a.active !== false) || accounts[0];
  if (wanted && !account) throw notFound("Conta de anúncio");
  if (!account) {
    return json({ accounts: [], account: null, period, dashboard: null, candidates: await organicCandidates(org, project, period, new Map()), write: await adsWriteState(org) });
  }
  const dashboard = await buildAdsDashboard(org, account, period);
  return json({ accounts: accounts.map(publicAdAccount), account: publicAdAccount(account), period, dashboard, candidates: dashboard.candidates, write: dashboard.write });
});
