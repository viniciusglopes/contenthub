import { json, route } from "@/lib/api";
import { sealCredentials } from "@/lib/crypto";
import { FriendlyError } from "@/lib/errors";
import { publicAccount } from "@/lib/instagram/accounts";
import { projectOf } from "@/lib/instagram/data";
import { assertProject } from "@/lib/orgs";
import { toObjectId } from "@/lib/tenant";
import SocialAccount from "@/models/SocialAccount";

// As credenciais são gravadas criptografadas e nunca voltam para a tela.
export const GET = route("org", async ({ org, req }) => {
  const filter: Record<string, unknown> = { organization: org };
  const project = req.nextUrl.searchParams.get("project");
  if (project) filter.project = toObjectId(project) ?? null;
  const accounts = await SocialAccount.find(filter).populate(projectOf(org)).sort({ platform: 1 });
  return json(accounts.map(publicAccount));
});

export const POST = route("org", async ({ org, body }) => {
  const b = await body();
  const projectId = toObjectId(String(b.project || ""));
  if (!projectId) throw new FriendlyError("Escolha o projeto dessa conta.", 400, "project");
  await assertProject(org, projectId);
  const account = await SocialAccount.create({
    organization: org,
    project: projectId,
    platform: b.platform,
    accountName: b.accountName,
    accountId: b.accountId || "",
    active: b.active !== false,
    credentials: sealCredentials(b.credentials && typeof b.credentials === "object" ? b.credentials : {}),
  });
  return json(publicAccount(await account.populate(projectOf(org))), 201);
});
