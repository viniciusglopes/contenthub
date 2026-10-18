import { json, route } from "@/lib/api";
import { importPexels, publicScene, searchPexels } from "@/lib/studio/cenas";

export const maxDuration = 300;

// PEXELS (chave da casa). Sem chave: { enabled: false } e a tela some com a busca.
// GET ?q=&page= busca vídeos verticais; POST { id, categoria, tags } importa com licença e origem gravadas.
export const GET = route("org", async ({ req }) => {
  const q = req.nextUrl.searchParams;
  return json(await searchPexels(q.get("q") || "", Number(q.get("page")) || 1));
});

export const POST = route("org", async ({ org, body, session }) => {
  const b = await body();
  const a = await importPexels(org, b.id, { categoria: b.categoria, tags: b.tags, titulo: b.titulo }, session!.user._id);
  return json(publicScene(a), 201);
});
