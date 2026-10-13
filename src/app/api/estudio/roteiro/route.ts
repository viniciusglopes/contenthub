import { json, route } from "@/lib/api";
import { FriendlyError } from "@/lib/errors";
import { generateScript } from "@/lib/studio/studio";

export const maxDuration = 300;

// ROTEIRO POR IA: { project, tipo: "temas" | "carrossel" | "reel", tema, objetivo, modelo, slides, cenas, visual, confirm }.
// Sem chave de texto responde 400 dizendo onde cadastrar (o roteiro à mão segue funcionando).
// Acima do valor de confirmação responde { needsConfirm, message } e só gera com confirm: true.
export const POST = route("org", async ({ org, body, id, session }) => {
  const b = await body();
  if (!["temas", "carrossel", "reel"].includes(b.tipo)) throw new FriendlyError("Diga o que gerar.", 400);
  const r = await generateScript({ org, userId: session!.userId, name: session!.user?.name || "" }, id(b.project, "Projeto"), b.tipo, b, b.confirm === true);
  if (r.needsConfirm) return json({ needsConfirm: true, message: r.check.message, estimateUsd: r.check.estimateUsd, estimateBrl: r.check.estimateBrl }, 409);
  return json(r);
});
