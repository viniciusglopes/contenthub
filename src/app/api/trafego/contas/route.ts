import { json, route } from "@/lib/api";
import { connectAdAccount, publicAdAccount } from "@/lib/ads/accounts";
import { toObjectId } from "@/lib/tenant";
import { AdAccount } from "@/models/Ads";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Contas de anúncio (Meta) da organização da sessão. O token nunca volta para a tela.
export const GET = route("org", async ({ org, req }) => {
  const project = toObjectId(req.nextUrl.searchParams.get("project"));
  const filter: Record<string, unknown> = { organization: org };
  if (project) filter.project = project;
  const list: any[] = await AdAccount.find(filter).sort({ createdAt: 1 }).lean();
  return json(list.map(publicAdAccount));
});

// Conectar por token colado: { project, adAccountId, token }. Confere na Meta antes de gravar.
export const POST = route("org", async ({ org, body }) => {
  const doc = await connectAdAccount(org, await body());
  return json(publicAdAccount(doc), 201);
});
