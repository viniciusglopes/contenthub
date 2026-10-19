import { json, route } from "@/lib/api";
import { subscribeAccount } from "@/lib/automations/crud";
import { clientIp } from "@/lib/session";

// Liga o webhook do app para a conta (POST /me/subscribed_apps na Meta). ESCRITA: só o dono e só com
// AUTOMACOES_ENABLED=true + automações ligadas para o cliente.
export const POST = route("owner", async ({ org, session, body, req }) => {
  const b = await body();
  return json(await subscribeAccount(org, session!, b.account, { ip: clientIp(req) }));
});
