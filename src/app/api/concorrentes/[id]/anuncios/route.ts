import { json, route } from "@/lib/api";
import { adLibraryUrl, findCompetitor, tryAdLibrary } from "@/lib/competitors/competitors";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Tenta a API da Biblioteca de Anúncios para um concorrente (só leitura) e devolve também o
// link da busca pública, que é o que funciona para anúncio comercial no Brasil.
export const POST = route("org", async ({ org, params }) => {
  const c: any = await findCompetitor(org, params.id);
  const result = await tryAdLibrary(org, c);
  return json({ adLibrary: result, adLibraryUrl: adLibraryUrl(c) });
});
