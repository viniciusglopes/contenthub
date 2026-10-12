import { json, route } from "@/lib/api";
import { CATEGORY_LABEL } from "@/lib/comments/classify";
import { gapMessage } from "@/lib/comments/study";
import { periodStudy, replySwitch } from "@/lib/instagram/comments";
import { connectedAccounts } from "@/lib/instagram/data";
import { mockEnabled } from "@/lib/instagram/mock";
import { periodFromParams } from "@/lib/instagram/period";

// Estudo dos comentários dos posts publicados no período (mesmo seletor da tela Instagram):
// ?project=<id> ou ?account=<id> · ?periodo= | ?dias= | ?de=&ate=. Só lê o banco.
export const GET = route("org", async ({ org, req, session }) => {
  const q = req.nextUrl.searchParams;
  const period = periodFromParams(q);
  const accounts = await connectedAccounts(org, { project: q.get("project") });
  const account = accounts.find((a) => String(a._id) === q.get("account")) || accounts[0];
  if (!account) return json({ account: null, period, study: null, gap: null, posts: [], report: "" });
  const r = await periodStudy(org, account, period);
  const sw = replySwitch(session!.organization);
  return json({
    account: { _id: String(account._id), username: account.username || "" },
    period,
    study: r.study,
    gap: { ...r.gap, show: r.gap.reported > r.gap.fetched, message: r.gap.reported > r.gap.fetched ? gapMessage(r.gap) : "" },
    posts: r.posts,
    report: r.report,
    labels: CATEGORY_LABEL,
    reply: { on: sw.on, message: sw.message },
    demo: mockEnabled(),
  });
});
