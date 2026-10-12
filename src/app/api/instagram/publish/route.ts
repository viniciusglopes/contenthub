import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Post from "@/models/Post";
import SocialAccount from "@/models/SocialAccount";
import { FriendlyError, accountToken } from "@/lib/instagram/accounts";
import { InstagramClient } from "@/lib/instagram/client";
import { handle } from "@/lib/instagram/data";
import { ensureMock } from "@/lib/instagram/mock";
import { PublishError, planPublish, publishEnabled, publishPost } from "@/lib/instagram/publish";

export const maxDuration = 300;

// BASE de publicação. { postId, dryRun?: true }
// dryRun só confere o post e devolve o plano. Publicar de verdade exige IG_PUBLISH_ENABLED=true.
export async function POST(req: NextRequest) {
  return handle(async () => {
    await connectDB();
    ensureMock();
    const body = await req.json().catch(() => ({}));
    const post = await Post.findById(String(body.postId || "")).catch(() => null);
    if (!post) throw new FriendlyError("Post não encontrado.", 404);

    const check = planPublish(post);
    if (body.dryRun) return NextResponse.json({ enabled: publishEnabled(), ...check });
    if (!publishEnabled())
      throw new FriendlyError("A publicação pelo ContentHub está desligada (IG_PUBLISH_ENABLED). Nada foi publicado.", 403);
    if (!check.ok) throw new FriendlyError(check.errors.join(" "), 400);

    const account = await SocialAccount.findOne({ project: post.project, platform: "instagram", active: true });
    if (!account) throw new FriendlyError("Esse projeto não tem conta do Instagram conectada e ativa.", 400);

    try {
      const { mediaId } = await publishPost(post, {
        client: new InstagramClient(accountToken(account)),
        igUserId: account.accountId,
      });
      post.set("externalIds.instagram", mediaId);
      post.status = "posted";
      await post.save();
      return NextResponse.json({ ok: true, mediaId });
    } catch (e) {
      if (e instanceof PublishError) throw new FriendlyError(e.message, 400);
      throw e;
    }
  });
}
