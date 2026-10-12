import { json, route } from "@/lib/api";
import { FriendlyError } from "@/lib/errors";
import { type CommentScope, syncComments } from "@/lib/instagram/comments";
import { resolvePeriod } from "@/lib/instagram/period";

export const maxDuration = 300;

// "Buscar comentários": lê no Instagram os comentários de UMA conta do cliente da sessão.
// { account, media }                          só um post
// { account, periodo | dias | de + ate }      todos os posts publicados no período
// { account }                                 os posts recentes (30 dias)
// SÓ LEITURA: nada é escrito no Instagram. Conta de outro cliente = 404.
export const POST = route("org", async ({ org, body }) => {
  const b = await body();
  if (!b.account) throw new FriendlyError("Escolha a conta para buscar os comentários.", 400, "account");
  let scope: CommentScope = { recent: true };
  if (b.media) scope = { mediaIgId: String(b.media) };
  else if (b.periodo || b.dias || b.de || b.ate) {
    const p = resolvePeriod({ periodo: b.periodo, dias: b.dias, de: b.de, ate: b.ate });
    scope = { from: p.from, to: p.to };
  }
  const result = await syncComments(org, String(b.account), scope);
  return json(result);
});
