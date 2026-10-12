import { json, route } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { projectOf } from "@/lib/instagram/data";
import { postInput } from "@/lib/posts";
import Post from "@/models/Post";

export const GET = route("org", async ({ org, params, id }) => {
  const post = await Post.findOne({ _id: id(params.id, "Post"), organization: org }).populate(projectOf(org));
  if (!post) throw notFound("Post");
  return json(post);
});

export const PUT = route("org", async ({ org, params, id, body }) => {
  const set = await postInput(org, await body(), { partial: true });
  const post = await Post.findOneAndUpdate({ _id: id(params.id, "Post"), organization: org }, { $set: set }, {
    returnDocument: "after",
    runValidators: true,
  }).populate(projectOf(org));
  if (!post) throw notFound("Post");
  return json(post);
});

export const DELETE = route("org", async ({ org, params, id }) => {
  const r = await Post.deleteOne({ _id: id(params.id, "Post"), organization: org });
  if (!r.deletedCount) throw notFound("Post");
  return json({ ok: true });
});
