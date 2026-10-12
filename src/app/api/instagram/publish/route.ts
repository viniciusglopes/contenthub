import { json, route } from "@/lib/api";
import { nowMs } from "@/lib/clock";
import { FriendlyError, notFound } from "@/lib/errors";
import { runOrganization } from "@/lib/instagram/scheduler";
import { planPublish } from "@/lib/instagram/publish";
import { checkPost, loadAssets, publishSwitch, publishable } from "@/lib/workflow";
import Post from "@/models/Post";

export const maxDuration = 300;

// { postId, dryRun: true }  confere o post e devolve o plano, sem publicar nada.
// { postId }                "publicar agora" um post JÁ APROVADO: só o dono, e só com as duas
//                           chaves de publicação ligadas. Passa pelo mesmo agendador (mesma trava).
export const POST = route("org", async ({ org, body, id, session }) => {
  const b = await body();
  const postId = id(b.postId, "Post");
  const post = await Post.findOne({ _id: postId, organization: org });
  if (!post) throw notFound("Post");
  const sw = publishSwitch(session!.organization);

  if (b.dryRun) {
    const plan = planPublish(publishable(post, await loadAssets(org, post)));
    return json({ enabled: sw.on, publishing: sw, ...plan, check: await checkPost(org, post, { skipDate: true }) });
  }
  if (!session!.canManage) throw new FriendlyError("Só o dono da conta pode publicar.", 403);
  if (!sw.on) throw new FriendlyError(`${sw.message} Nada foi publicado.`, 403);
  if (post.status !== "scheduled" || !post.approval?.at) throw new FriendlyError("O post precisa estar aprovado para ser publicado.", 409);
  const now = new Date(nowMs());
  await Post.updateOne({ _id: postId, organization: org, status: "scheduled" }, { $set: { publishAt: now, "publish.dueAt": now, "publish.nextAttemptAt": null } });
  const [outcome] = await runOrganization(org, { onlyPosts: [String(postId)] });
  if (!outcome) throw new FriendlyError("Esse post já está sendo publicado por outra rodada.", 409);
  return json({ ok: outcome.result === "publicado", ...outcome });
});
