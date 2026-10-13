import { json, route } from "@/lib/api";
import { runKeyTest } from "@/lib/studio/keys";
import ApiCredential from "@/models/ApiCredential";

// "Testar chave": consulta de leitura ao provedor (lista de modelos ou saldo). Só quando clicam.
export const POST = route("owner", async ({ org, body }) => {
  const b = await body();
  return json(await runKeyTest(ApiCredential, { organization: org }, b.service));
});
