import { json, route } from "@/lib/api";
import { FriendlyError } from "@/lib/errors";
import { postInput } from "@/lib/posts";
import Post from "@/models/Post";

// Importação em massa: cada post é conferido (projeto da organização) antes de gravar qualquer um.
export const POST = route("org", async ({ org, body }) => {
  const { posts } = await body();
  if (!Array.isArray(posts) || posts.length === 0) throw new FriendlyError("Envie a lista de posts.", 400);
  if (posts.length > 500) throw new FriendlyError("No máximo 500 posts por vez.", 400);
  const clean = [];
  for (const p of posts) clean.push(await postInput(org, p && typeof p === "object" ? p : {}));
  const created = await Post.insertMany(clean);
  return json({ count: created.length, posts: created }, 201);
});
