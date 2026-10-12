import { json, route } from "@/lib/api";
import { sealCredentials } from "@/lib/crypto";
import { FriendlyError, notFound } from "@/lib/errors";
import { publicAccount } from "@/lib/instagram/accounts";
import { purgeComments } from "@/lib/instagram/comments";
import { projectOf } from "@/lib/instagram/data";
import { assertProject } from "@/lib/orgs";
import { toObjectId } from "@/lib/tenant";
import SocialAccount from "@/models/SocialAccount";

export const GET = route("org", async ({ org, params, id }) => {
  const account = await SocialAccount.findOne({ _id: id(params.id, "Conta"), organization: org }).populate(projectOf(org));
  if (!account) throw notFound("Conta");
  return json(publicAccount(account));
});

export const PUT = route("org", async ({ org, params, id, body }) => {
  const b = await body();
  const set: Record<string, unknown> = {};
  for (const k of ["platform", "accountName", "accountId", "active"]) if (b[k] !== undefined) set[k] = b[k];
  if (b.project !== undefined) {
    const projectId = toObjectId(String(typeof b.project === "object" && b.project ? b.project._id : b.project));
    if (!projectId) throw new FriendlyError("Escolha o projeto dessa conta.", 400, "project");
    await assertProject(org, projectId);
    set.project = projectId;
  }
  // Campo de credencial em branco = manter o que já está gravado.
  const creds = b.credentials && typeof b.credentials === "object" ? b.credentials : {};
  for (const [k, v] of Object.entries(sealCredentials(creds))) {
    if (/^[a-zA-Z]+$/.test(k)) set[`credentials.${k}`] = v;
  }
  const account = await SocialAccount.findOneAndUpdate({ _id: id(params.id, "Conta"), organization: org }, { $set: set }, {
    returnDocument: "after",
    runValidators: true,
  }).populate(projectOf(org));
  if (!account) throw notFound("Conta");
  return json(publicAccount(account));
});

export const DELETE = route("org", async ({ org, params, id }) => {
  const accountId = id(params.id, "Conta");
  const r = await SocialAccount.deleteOne({ _id: accountId, organization: org });
  if (!r.deletedCount) throw notFound("Conta");
  // Conta desconectada: os comentários de terceiros guardados dela saem junto.
  const comments = await purgeComments(org, accountId);
  return json({ deleted: true, commentsDeleted: comments });
});
