"use client";

import { ZoomIn } from "lucide-react";
import type { Screen } from "@/lib/help/types";

// Guia de uma tela: o print da PRÓPRIA tela com os números marcados e, ao lado (embaixo no celular), o que
// cada número faz. O print abre em tamanho grande em outra aba (no celular dá para ampliar com os dedos).
export function boldInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <strong key={i} className="text-gray-50">{p.slice(2, -2)}</strong> : p));
}

export default function ScreenGuide({ screen, compact = false }: { screen: Screen; compact?: boolean }) {
  return (
    <section className="space-y-3" data-testid={`guia-${screen.id}`} aria-label={`Onde clicar: ${screen.title}`}>
      {!compact && <p className="text-sm text-gray-300">{screen.summary}</p>}
      <figure className="space-y-1">
        <a href={screen.image} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-lg border border-gray-700 bg-gray-950" title="Abrir o print em tamanho grande">
          {/* eslint-disable-next-line @next/next/no-img-element -- print estático da Ajuda (public/ajuda/telas) */}
          <img src={screen.image} width={screen.width} height={screen.height} alt={`Print da tela ${screen.title} com ${screen.steps.length} pontos numerados`} className="block h-auto w-full" loading="lazy" />
          <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[11px] text-gray-100 opacity-90 group-hover:opacity-100"><ZoomIn size={12} aria-hidden /> ampliar</span>
        </a>
        <figcaption className="text-[11px] text-gray-500">Print desta tela no ContentHub (dados de exemplo). Os números mostram onde clicar.</figcaption>
      </figure>
      <ol className="space-y-2">
        {screen.steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-gray-300">
            <span className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-[#ff2d87] text-white text-xs font-bold flex items-center justify-center ring-2 ring-white/80" aria-hidden>{i + 1}</span>
            <span className="min-w-0 leading-relaxed"><span className="sr-only">Ponto {i + 1}: </span>{boldInline(s)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
