import { json, route } from "@/lib/api";
import { type SyncResult, syncAll } from "@/lib/instagram/sync";

export const maxDuration = 300;

// Sincroniza métricas.
// Com login: contas ativas do cliente da sessão (corpo { project } ou { account } para uma só).
// Cron diário ("Authorization: Bearer <CRON_TOKEN>", sem corpo): percorre TODAS as
// organizações ativas, uma de cada vez.
export const POST = route("org+cron", async ({ orgs, body, cron }) => {
  const b = cron ? {} : await body();
  const results: (SyncResult & { organizationId: string })[] = [];
  for (const org of orgs) {
    const part = await syncAll(org._id, {
      project: b.project ? String(b.project) : undefined,
      account: b.account ? String(b.account) : undefined,
    });
    results.push(...part.map((r) => ({ ...r, organizationId: String(org._id) })));
  }
  const failed = results.filter((r) => !r.ok);
  return json({ ok: failed.length === 0, organizations: orgs.length, accounts: results.length, failed: failed.length, results });
});
