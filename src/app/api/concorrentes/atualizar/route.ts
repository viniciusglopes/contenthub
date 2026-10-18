import { json, route } from "@/lib/api";
import { type RefreshResult, findCompetitor, refreshCompetitor } from "@/lib/competitors/competitors";
import { toObjectId } from "@/lib/tenant";
import { Competitor } from "@/models/Competitor";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const maxDuration = 300;

// Atualiza Instagram e YouTube públicos dos concorrentes (só leitura, cotas gratuitas).
// Com login: { competitor } ou { project }. Cron (sem corpo): todos de todas as organizações ativas.
export const POST = route("org+cron", async ({ orgs, body, cron }) => {
  const b = cron ? {} : await body();
  const results: (RefreshResult & { organizationId: string })[] = [];
  for (const org of orgs) {
    let list: any[];
    if (!cron && b.competitor) list = [await findCompetitor(org._id, b.competitor)];
    else {
      const filter: Record<string, unknown> = { organization: org._id };
      if (!cron && b.project !== undefined) {
        const p = toObjectId(b.project);
        if (!p) continue;
        filter.project = p;
      }
      list = await Competitor.find(filter).limit(200);
    }
    for (const c of list) results.push({ ...(await refreshCompetitor(org._id, c)), organizationId: String(org._id) });
  }
  return json({ ok: true, organizations: orgs.length, competitors: results.length, ytUnits: results.reduce((s, r) => s + r.ytUnits, 0), results });
});
