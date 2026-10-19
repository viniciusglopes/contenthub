import { json, route } from "@/lib/api";
import { leadAdsSwitch, processLeadAds } from "@/lib/crm/leadads";

// Processa os avisos guardados (busca o lead na Meta e cria no CRM). Login = só a própria organização;
// rotina (CRON_TOKEN) = todas com a chave ligada. Nada roda com as chaves desligadas.
export const maxDuration = 120;
export const POST = route("org+cron", async ({ org, cron, session }) => {
  if (!cron) {
    const sw = leadAdsSwitch(session!.organization);
    if (!sw.on) return json({ enabled: false, message: sw.message, processed: 0 });
  }
  return json(await processLeadAds(cron ? {} : { orgs: [org] }));
});
