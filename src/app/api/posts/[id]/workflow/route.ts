import { json, route } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { projectOf } from "@/lib/instagram/data";
import { toleranceMinutes } from "@/lib/instagram/scheduler";
import { clientIp } from "@/lib/session";
import { checkPost, publicPosts, publishSwitch, workflowAction } from "@/lib/workflow";
import Post from "@/models/Post";

// O que a tela do post precisa de uma vez: o post, o que falta para aprovar, as chaves de
// publicação e se quem está olhando pode aprovar.
export const GET = route("org", async ({ org, params, id, session }) => {
  const post = await Post.findOne({ _id: id(params.id, "Post"), organization: org }).populate(projectOf(org));
  if (!post) throw notFound("Post");
  const done = post.status === "posted" || post.status === "publishing";
  const check = done ? null : await checkPost(org, post, { probe: true, skipDate: post.status === "failed" || post.status === "missed" });
  return json({
    post: (await publicPosts(org, [post]))[0],
    check,
    publishing: publishSwitch(session!.organization),
    canApprove: session!.canManage,
    toleranceMin: toleranceMinutes(),
  });
});

// { action: "request" | "approve" | "adjust" | "draft" | "retry" | "mark_posted", note?, confirm? }
export const POST = route("org", async ({ org, params, id, body, session, req }) => {
  const b = await body();
  const post = await workflowAction(session!, id(params.id, "Post"), String(b.action || ""), { note: b.note, confirm: b.confirm === true, ip: clientIp(req) });
  await post.populate(projectOf(org));
  return json({ post: (await publicPosts(org, [post]))[0], publishing: publishSwitch(session!.organization) });
});
