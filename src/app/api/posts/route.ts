import { json, route } from "@/lib/api";
import { projectOf } from "@/lib/instagram/data";
import { postInput } from "@/lib/posts";
import { toObjectId } from "@/lib/tenant";
import Post from "@/models/Post";

export const GET = route("org", async ({ org, req }) => {
  const q = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = { organization: org };
  if (q.get("project")) filter.project = toObjectId(q.get("project")) ?? null;
  if (q.get("status")) filter.status = String(q.get("status"));
  if (q.get("platform")) filter.platforms = String(q.get("platform"));
  const range: Record<string, Date> = {};
  for (const [param, op] of [["startDate", "$gte"], ["endDate", "$lte"]] as const) {
    const d = q.get(param) ? new Date(String(q.get(param))) : null;
    if (d && !Number.isNaN(d.getTime())) range[op] = d;
  }
  if (Object.keys(range).length) filter.scheduledDate = range;
  return json(await Post.find(filter).populate(projectOf(org)).sort({ scheduledDate: 1, scheduledTime: 1 }));
});

export const POST = route("org", async ({ org, body }) => {
  const post = await Post.create(await postInput(org, await body()));
  return json(await post.populate(projectOf(org)), 201);
});
