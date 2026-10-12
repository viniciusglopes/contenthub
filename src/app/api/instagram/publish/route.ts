import { json, route } from "@/lib/api";
import { FriendlyError, notFound } from "@/lib/errors";
import { accountToken } from "@/lib/instagram/accounts";
import { InstagramClient } from "@/lib/instagram/client";
import { ensureMock } from "@/lib/instagram/mock";
import { PublishError, planPublish, publishEnabled, publishPost } from "@/lib/instagram/publish";
import Post from "@/models/Post";
import SocialAccount from "@/models/SocialAccount";

export const maxDuration = 300;

// BASE de publicação. { postId, dryRun?: true }
// dryRun só confere o post e devolve o plano. Publicar de verdade exige IG_PUBLISH_ENABLED=true.
export const POST = route("org", async ({ org, body, id }) => {
  ensureMock();
  const b = await body();
  const post = await Post.findOne({ _id: id(b.postId, "Post"), organization: org });
  if (!post) throw notFound("Post");

  const check = planPublish(post);
  if (b.dryRun) return json({ enabled: publishEnabled(), ...check });
  if (!publishEnabled())
    throw new FriendlyError("A publicação pelo ContentHub está desligada (IG_PUBLISH_ENABLED). Nada foi publicado.", 403);
  if (!check.ok) throw new FriendlyError(check.errors.join(" "), 400);

  const account = await SocialAccount.findOne({ organization: org, project: post.project, platform: "instagram", active: true });
  if (!account) throw new FriendlyError("Esse projeto não tem conta do Instagram conectada e ativa.", 400);

  try {
    const { mediaId } = await publishPost(post, { client: new InstagramClient(accountToken(account)), igUserId: account.accountId });
    post.set("externalIds.instagram", mediaId);
    post.status = "posted";
    await post.save();
    return json({ ok: true, mediaId });
  } catch (e) {
    if (e instanceof PublishError) throw new FriendlyError(e.message, 400);
    throw e;
  }
});
