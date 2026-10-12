import { json, route } from "@/lib/api";
import { replyToComment } from "@/lib/instagram/comments";
import { clientIp } from "@/lib/session";

// Resposta PÚBLICA a um comentário: { message, confirm: true }.
// Só sai com as DUAS chaves ligadas (IG_COMMENT_REPLY_ENABLED no servidor + a chave do cliente,
// que só o administrador da plataforma liga). Desligada: 403 e nada é enviado ao Instagram.
export const POST = route("org", async ({ org, params, body, session, req }) => {
  const b = await body();
  const reply = await replyToComment(org, session!, params.id, { message: b.message, confirm: b.confirm }, { ip: clientIp(req) });
  return json({ ok: true, _id: String(reply._id), igId: reply.igId, sentByName: reply.sentByName }, 201);
});
