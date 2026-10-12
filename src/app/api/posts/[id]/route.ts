import { json, route } from "@/lib/api";
import { FriendlyError, notFound } from "@/lib/errors";
import { projectOf } from "@/lib/instagram/data";
import { attachMedia, deleteAssets } from "@/lib/media/store";
import { postInput } from "@/lib/posts";
import { afterEdit, publicPosts } from "@/lib/workflow";
import Post from "@/models/Post";

const BUSY = "Esse post está sendo publicado agora. Aguarde um instante e abra de novo.";

export const GET = route("org", async ({ org, params, id }) => {
  const post = await Post.findOne({ _id: id(params.id, "Post"), organization: org }).populate(projectOf(org));
  if (!post) throw notFound("Post");
  return json((await publicPosts(org, [post]))[0]);
});

// Editar um post aprovado (ou com falha) devolve para "aguardando aprovação".
export const PUT = route("org", async ({ org, params, id, body, session }) => {
  const postId = id(params.id, "Post");
  const b = await body();
  const set = await postInput(org, b, { partial: true });
  const current = await Post.findOne({ _id: postId, organization: org });
  if (!current) throw notFound("Post");
  if (current.status === "publishing") throw new FriendlyError(BUSY, 409);
  if (current.publish?.uncertain)
    throw new FriendlyError("Confira primeiro no Instagram se esse post saiu e escolha: marcar como publicado ou tentar de novo.", 409);
  if (b.media !== undefined) set.media = await attachMedia(org, postId, b.media);
  // Só o que mudou de verdade conta como edição (abrir e salvar sem mexer não desfaz a aprovação).
  const norm = (k: string, v: unknown) => (k === "scheduledDate" && v ? new Date(v as string).toISOString().slice(0, 10) : JSON.stringify(v ?? ""));
  const before = current.toObject() as Record<string, unknown>;
  for (const k of Object.keys(set)) if (norm(k, set[k]) === norm(k, before[k])) delete set[k];
  const changed = Object.keys(set).length > 0;
  const flow = changed ? afterEdit(current, session!.user?.name || "") : { set: {}, push: {} };
  const post = await Post.findOneAndUpdate(
    // o estado de partida entra no filtro: se o agendador pegou o post neste instante, a edição não passa
    { _id: postId, organization: org, status: current.status },
    { $set: { ...set, ...flow.set }, ...(changed ? { $push: flow.push } : {}) },
    { returnDocument: "after", runValidators: true }
  ).populate(projectOf(org));
  if (!post) throw new FriendlyError(BUSY, 409);
  return json((await publicPosts(org, [post]))[0]);
});

// Apagar o post apaga os arquivos de mídia dele.
export const DELETE = route("org", async ({ org, params, id }) => {
  const postId = id(params.id, "Post");
  const r = await Post.deleteOne({ _id: postId, organization: org, status: { $ne: "publishing" } });
  if (!r.deletedCount) {
    if (await Post.exists({ _id: postId, organization: org })) throw new FriendlyError(BUSY, 409);
    throw notFound("Post");
  }
  await deleteAssets(org, { post: postId });
  return json({ ok: true });
});
