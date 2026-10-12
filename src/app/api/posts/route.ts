import { json, route } from "@/lib/api";
import { attachMedia } from "@/lib/media/store";
import { postInput } from "@/lib/posts";
import { toObjectId } from "@/lib/tenant";
import { QUEUE_STATES, historyEntry, publicPosts } from "@/lib/workflow";
import Post from "@/models/Post";
import "@/models/Project";
import { projectOf } from "@/lib/instagram/data";

// ?fila=aprovacao: tudo que espera decisão (aguardando aprovação, falhou, perdeu o horário), de qualquer mês.
export const GET = route("org", async ({ org, req }) => {
  const q = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = { organization: org };
  if (q.get("project")) filter.project = toObjectId(q.get("project")) ?? null;
  if (q.get("fila") === "aprovacao") filter.status = { $in: QUEUE_STATES };
  else {
    if (q.get("status")) filter.status = String(q.get("status"));
    const range: Record<string, Date> = {};
    for (const [param, op] of [["startDate", "$gte"], ["endDate", "$lte"]] as const) {
      const d = q.get(param) ? new Date(String(q.get(param))) : null;
      if (d && !Number.isNaN(d.getTime())) range[op] = d;
    }
    if (Object.keys(range).length) filter.scheduledDate = range;
  }
  if (q.get("platform")) filter.platforms = String(q.get("platform"));
  const posts = await Post.find(filter).populate(projectOf(org)).sort({ scheduledDate: 1, scheduledTime: 1 }).limit(2000);
  return json(await publicPosts(org, posts));
});

export const POST = route("org", async ({ org, body, session }) => {
  const b = await body();
  const input = await postInput(org, b);
  const who = session!.user?.name || "";
  const post = await Post.create({ ...input, history: [historyEntry("criado", who)] });
  if (b.media !== undefined) {
    try {
      post.media = await attachMedia(org, post._id, b.media);
      await post.save();
    } catch (e) {
      await Post.deleteOne({ _id: post._id, organization: org }); // não deixa post pela metade
      throw e;
    }
  }
  await post.populate(projectOf(org));
  return json((await publicPosts(org, [post]))[0], 201);
});
