import { json, route } from "@/lib/api";
import { FriendlyError, notFound } from "@/lib/errors";
import { assetInUse, deleteAssets, publicAsset, refitAsset } from "@/lib/media/store";
import MediaAsset from "@/models/MediaAsset";

// Ajuste automático de uma imagem fora da proporção: { fit: "crop" | "pad" }.
export const PUT = route("org", async ({ org, params, id, body }) => {
  const b = await body();
  return json(publicAsset(await refitAsset(org, id(params.id, "Mídia"), b.fit)));
});

// Apaga uma mídia enviada que ainda não está em nenhum post (a de um post sai ao salvar o post).
export const DELETE = route("org", async ({ org, params, id }) => {
  const assetId = id(params.id, "Mídia");
  const asset = await MediaAsset.findOne({ _id: assetId, organization: org }).lean();
  if (!asset) throw notFound("Mídia");
  if (await assetInUse(org, assetId)) throw new FriendlyError("Essa mídia está em um post. Tire do post e salve.", 409);
  await deleteAssets(org, { _id: assetId });
  return json({ ok: true });
});
