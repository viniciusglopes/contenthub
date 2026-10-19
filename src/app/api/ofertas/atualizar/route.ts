import { json, route } from "@/lib/api";
import { type CountRun, runHouseCount, runOrgCount } from "@/lib/offers/offers";

export const maxDuration = 300;

// FOTO DIÁRIA dos anúncios ativos pela API oficial da Biblioteca de Anúncios (só leitura, gratuita).
// Com login: { offer? } = só a da organização (uma ou todas as de contagem pela API).
// Cron (Authorization: Bearer CRON_TOKEN, sem corpo): todas as organizações ativas + a lista da casa.
export const POST = route("org+cron", async ({ orgs, body, cron }) => {
  const b = cron ? {} : await body();
  const results: CountRun[] = [];
  for (const org of orgs) results.push(...(await runOrgCount(org._id, { page: b.offer })));
  if (cron) results.push(...(await runHouseCount()));
  const n = (s: string) => results.filter((r) => r.status === s).length;
  return json({ ok: true, organizations: orgs.length, pages: results.length, counted: n("ok"), errors: n("erro"), noToken: n("sem_token"), manualToday: n("manual_hoje"), calls: results.reduce((s, r) => s + (r.calls || 0), 0), results });
});
