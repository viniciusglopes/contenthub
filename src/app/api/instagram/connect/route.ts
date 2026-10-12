import { json, route } from "@/lib/api";
import { connectInstagram, publicAccount } from "@/lib/instagram/accounts";

// Cola o token -> valida em /me -> guarda criptografado. Projeto e conta têm de ser da organização.
export const POST = route("org", async ({ org, body }) => {
  const b = await body();
  const account = await connectInstagram(org, {
    project: String(b.project || ""),
    token: String(b.token || ""),
    accountId: b.accountId ? String(b.accountId) : undefined,
  });
  return json(publicAccount(account), 201);
});
