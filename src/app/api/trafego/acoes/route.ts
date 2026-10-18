import { json, route } from "@/lib/api";
import { performAdAction } from "@/lib/ads/write";
import { clientIp } from "@/lib/session";

// Ações na Meta (pausar, ativar, orçamento diário, criar anúncio pausado a partir de um post).
// Duas chaves desligadas por padrão (env TRAFEGO_WRITE_ENABLED + Organization.adsWriteEnabled):
// sem as duas, 403 antes de ler qualquer coisa. Só o dono da conta (ou o administrador) aciona.
export const POST = route("owner", async ({ org, body, session, req }) => {
  return json(await performAdAction(org, await body(), { user: session!.user, ip: clientIp(req) }));
});
