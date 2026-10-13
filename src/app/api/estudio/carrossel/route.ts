import { json, route } from "@/lib/api";
import { publicPosts } from "@/lib/workflow";
import { createCarousel, saveCarouselDraft } from "@/lib/studio/studio";
import { projectOf } from "@/lib/instagram/data";

export const maxDuration = 300;

// CARROSSEL. { project, script, acao }:
//   acao "gerar"  confere o roteiro (schema + regras do setor) e desenha os slides; devolve as
//                 mídias (soltas: somem em 24h se não virarem post), legenda e textos alternativos;
//   acao "salvar" { assets: [ids na ordem] } cria o POST EM RASCUNHO com as mídias anexadas.
// Não chama IA: o roteiro pode ter sido escrito à mão.
export const POST = route("org", async ({ org, body, id, session }) => {
  const b = await body();
  const who = { org, userId: session!.userId, name: session!.user?.name || "" };
  const project = id(b.project, "Projeto");
  if (b.acao === "salvar") {
    const post = await saveCarouselDraft(who, project, b.script, b.assets);
    await post.populate(projectOf(org));
    return json({ post: (await publicPosts(org, [post]))[0] }, 201);
  }
  return json(await createCarousel(who, project, b.script));
});
