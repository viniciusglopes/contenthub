import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { renderPreview } from "@/lib/studio/engine";
import { engineKit, kitInput, loadKit } from "@/lib/studio/kit";
import { VISUAL_MODELS, type Slide } from "@/lib/studio/script";
import { scriptError } from "@/lib/studio/studio";
import { ScriptInvalid, validateCarousel } from "@/lib/studio/script";
import { sectorOf } from "@/lib/studio/sectors";

const SAMPLE: Record<string, Slide> = {
  capa: { tipo: "capa", kicker: "Exemplo de chapéu", titulo: "O título da capa com um *destaque*", texto: "Uma linha de apoio para dar o contexto do post." },
  conteudo: { tipo: "conteudo", selo: "Verdade", selo_tom: "cheio", titulo: "Uma afirmação curta e direta.", texto: "O texto do slide explica a afirmação em duas ou três frases, com calma, no tom de voz da marca. É aqui que o leitor aprende alguma coisa." },
  cta: { tipo: "cta", kicker: "Para fechar", titulo: "A chamada final do *carrossel*", texto: "Um convite simples para o próximo passo.", acao: "Salve para ler depois" },
};

// PRÉ-VISUALIZAÇÃO de UM slide com o kit que está na tela (ainda não salvo). Devolve PNG; nada é guardado.
// Corpo: { project, kit?: {campos do formulário}, modelo, tipo?: capa|conteudo|cta, slide?: {...} }
export const POST = route("org", async ({ org, body, id }) => {
  const b = await body();
  const { kit, logoFile } = await loadKit(org, id(b.project, "Projeto"));
  const form = b.kit && typeof b.kit === "object" ? { ...kit, ...kitInput(b.kit) } : kit;
  const modelo = b.modelo in VISUAL_MODELS ? b.modelo : "editorial";
  let slide = SAMPLE[b.tipo in SAMPLE ? b.tipo : "capa"];
  let i = slide.tipo === "capa" ? 1 : slide.tipo === "cta" ? 5 : 2;
  if (b.slide && typeof b.slide === "object") {
    // o slide do usuário passa pela MESMA conferência do roteiro (limites e termos vetados)
    const tipo = b.slide.tipo === "capa" || b.slide.tipo === "cta" ? b.slide.tipo : "conteudo";
    const filler = (t: string): Slide => ({ ...SAMPLE[t], tipo: t as Slide["tipo"] });
    const slides = tipo === "capa" ? [b.slide, filler("conteudo"), filler("cta")] : tipo === "cta" ? [filler("capa"), filler("conteudo"), b.slide] : [filler("capa"), b.slide, filler("cta")];
    i = tipo === "capa" ? 1 : tipo === "cta" ? 3 : 2;
    try {
      slide = validateCarousel({ modelo, slides, legenda: "x".repeat(90), hashtags: ["#a", "#b", "#c"] }, sectorOf(form.sector)).slides[i - 1];
    } catch (e) {
      if (e instanceof ScriptInvalid) e.problems = e.problems.filter((p) => p.startsWith(`slide ${i}`));
      scriptError(e);
    }
  }
  const png = await renderPreview(org, engineKit(form, logoFile), modelo, slide, b.slide ? i : i, b.slide ? 3 : 5);
  return new NextResponse(new Uint8Array(png), { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
});
