import { json, route } from "@/lib/api";
import { productFields, publicProduct } from "@/lib/competitors/competitors";
import { FriendlyError, notFound } from "@/lib/errors";
import { assertProject } from "@/lib/orgs";
import { toObjectId } from "@/lib/tenant";
import { CompetitorProduct } from "@/models/Competitor";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Produtos dos concorrentes (tabela à mão: nome, plataforma, preço, promessa, link, observações).
export const GET = route("org", async ({ org, req }) => {
  const project = toObjectId(req.nextUrl.searchParams.get("project"));
  if (!project) throw notFound("Projeto");
  await assertProject(org, project);
  const list: any[] = await CompetitorProduct.find({ organization: org, project }).sort({ createdAt: 1 }).lean();
  return json(list.map(publicProduct));
});

export const POST = route("org", async ({ org, body }) => {
  const b = await body();
  const project = toObjectId(b.project);
  if (!project) throw new FriendlyError("Escolha o projeto.", 400, "project");
  await assertProject(org, project);
  const { _project, ...f } = await productFields(org, b, false);
  if (_project && String(_project) !== String(project)) throw new FriendlyError("Esse concorrente é de outro projeto.", 400, "competitor");
  if ((await CompetitorProduct.countDocuments({ organization: org, project })) >= 300) throw new FriendlyError("Limite de 300 produtos por projeto.", 400);
  const doc = await CompetitorProduct.create({ organization: org, project, ...f });
  return json(publicProduct(doc), 201);
});
