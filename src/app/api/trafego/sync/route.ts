import { json, route } from "@/lib/api";
import { type SyncResult, findAdAccount, syncAdAccount } from "@/lib/ads/accounts";
import { FriendlyError } from "@/lib/errors";
import { toObjectId } from "@/lib/tenant";
import { AdAccount } from "@/models/Ads";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const maxDuration = 300;

// Busca campanhas e números na Meta (só leitura).
// Com login: { account } (uma conta) ou { project } (as do projeto); { account, dias } busca mais
// para trás (até 365 dias). Cron ("Authorization: Bearer <CRON_TOKEN>", sem corpo): todas as contas
// ativas de todas as organizações ativas, 30 dias.
export const POST = route("org+cron", async ({ orgs, body, cron }) => {
  const b = cron ? {} : await body();
  const results: (SyncResult & { organizationId: string })[] = [];
  let days: number | undefined;
  if (!cron && b.dias !== undefined) {
    days = Number(b.dias);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new FriendlyError("Quantidade de dias inválida. Use de 1 a 365.", 400, "dias");
    if (!b.account) throw new FriendlyError("Escolha a conta para buscar mais dias.", 400, "account");
  }
  for (const org of orgs) {
    let ids: any[];
    if (!cron && b.account) ids = [(await findAdAccount(org._id, b.account))._id];
    else {
      const filter: Record<string, unknown> = { organization: org._id, active: true };
      const project = toObjectId(b.project);
      if (!cron && b.project !== undefined) filter.project = project ?? "000000000000000000000000";
      ids = (await AdAccount.find(filter).select("_id").lean()).map((a: any) => a._id);
    }
    for (const id of ids) results.push({ ...(await syncAdAccount(org._id, id, { days })), organizationId: String(org._id) });
  }
  const failed = results.filter((r) => !r.ok);
  return json({ ok: failed.length === 0, organizations: orgs.length, accounts: results.length, failed: failed.length, results });
});
