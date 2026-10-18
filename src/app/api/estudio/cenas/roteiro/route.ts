import { json, route } from "@/lib/api";
import { cenasScript } from "@/lib/studio/cenas";

export const maxDuration = 300;

// ROTEIRO DO REEL COM CENAS: { project, template, settings, modo: "tema" | "prompt", texto, confirm }.
// tema   = a IA escreve seguindo o padrão (sem chave de texto: 400, escreva à mão);
// prompt = pedido livre; com IA vira roteiro + ajustes do padrão; SEM IA o texto vira o roteiro
//          (uma frase por cena) e nada mais muda (a resposta diz isso).
export const POST = route("org", async ({ org, body, id, session }) => {
  const b = await body();
  const r = await cenasScript({ org, name: session!.user?.name || "" }, id(b.project, "Projeto"), b, b.confirm === true);
  return json(r, r.needsConfirm ? 409 : 200);
});
