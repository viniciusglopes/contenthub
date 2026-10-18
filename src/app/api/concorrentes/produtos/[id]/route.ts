import { json, route } from "@/lib/api";
import { productFields, publicProduct } from "@/lib/competitors/competitors";
import { FriendlyError, notFound } from "@/lib/errors";
import { CompetitorProduct } from "@/models/Competitor";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const PUT = route("org", async ({ org, params, body, id }) => {
  const doc: any = await CompetitorProduct.findOne({ _id: id(params.id, "Produto"), organization: org });
  if (!doc) throw notFound("Produto");
  const { _project, ...f } = await productFields(org, await body(), true);
  if (_project && String(_project) !== String(doc.project)) throw new FriendlyError("Esse concorrente é de outro projeto.", 400, "competitor");
  doc.set(f);
  await doc.save();
  return json(publicProduct(doc));
});

export const DELETE = route("org", async ({ org, params, id }) => {
  const r = await CompetitorProduct.deleteOne({ _id: id(params.id, "Produto"), organization: org });
  if (!r.deletedCount) throw notFound("Produto");
  return json({ ok: true });
});
