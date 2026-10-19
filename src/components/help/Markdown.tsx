"use client";

import type { ReactNode } from "react";
import { ClipboardCopy, ClipboardPaste, ExternalLink } from "lucide-react";

// Markdown simples e SEGURO dos artigos da Ajuda: vira elementos React (nada de HTML cru).
// Suporta: # ## ### títulos, parágrafos, listas (- e 1.), > aviso, **negrito**, `código`,
// [texto](https://...) (abre em outra aba) e [texto](artigo:id) (abre outro artigo da Ajuda).
// Bloco ":::fora Lugar ... :::" = passo FORA do ContentHub (Meta, Hotmart...): link oficial, caminho
// numerado (os mesmos números do desenho), o que copiar lá e onde colar aqui. Ver scripts/build-help.mjs.

function inline(text: string, onArticle: (id: string) => void, key = ""): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k} className="text-gray-100">{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k} className="px-1 py-0.5 rounded bg-gray-800 text-[0.9em] break-all">{t.slice(1, -1)}</code>);
    else {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t)!;
      const [label, href] = [lm[1], lm[2]];
      if (href.startsWith("artigo:")) out.push(<button key={k} type="button" className="text-brand-400 underline underline-offset-2 hover:text-brand-300" onClick={() => onArticle(href.slice(7))}>{label}</button>);
      else if (/^https:\/\//.test(href)) out.push(<a key={k} href={href} target="_blank" rel="noreferrer noopener" className="text-brand-400 underline underline-offset-2 hover:text-brand-300 break-words">{label}</a>);
      else out.push(label);
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Passo que acontece fora do ContentHub, com o desenho ilustrativo (não é print) e o caminho numerado. */
function OutsideStep({ place, f, onArticle, k }: { place: string; f: Record<string, string>; onArticle: (id: string) => void; k: string }) {
  const parts = (f.caminho || "").split(/\s+>\s+/).filter(Boolean);
  return (
    <section className="rounded-xl border border-sky-500/30 bg-sky-500/[0.06] p-3 md:p-4 space-y-3" data-testid="ajuda-fora" aria-label={`Fora do ContentHub: ${place}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">Fora do ContentHub</p>
          <h4 className="text-sm font-semibold text-gray-50">{place}</h4>
        </div>
        <a href={f.link} target="_blank" rel="noreferrer noopener" className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-gray-950 hover:bg-sky-400" data-testid="ajuda-fora-link">
          Abrir {place} <ExternalLink size={14} aria-hidden />
        </a>
      </div>
      {f.desenho && (
        <figure className="space-y-1">
          <a href={`/ajuda/externo/${f.desenho}.svg`} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-gray-700 bg-white" title="Abrir o desenho em tamanho grande">
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático da Ajuda */}
            <img src={`/ajuda/externo/${f.desenho}.svg`} alt={`Desenho ilustrativo de ${place} com os passos numerados`} className="w-full h-auto" loading="lazy" />
          </a>
          <figcaption className="text-[11px] text-amber-300">Desenho ilustrativo, não é print: a tela real pode ter outro visual e outros nomes. Siga os números.</figcaption>
        </figure>
      )}
      <div>
        <p className="text-xs font-semibold text-gray-300 mb-1.5">Caminho lá dentro</p>
        <ol className="space-y-1.5">
          {parts.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-200">
              <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-[#ff2d87] text-white text-[11px] font-bold flex items-center justify-center" aria-hidden>{i + 1}</span>
              <span className="min-w-0">{inline(p, onArticle, `${k}-c${i}`)}</span>
            </li>
          ))}
        </ol>
      </div>
      {(f.copie || f.cole) && (
        <div className="grid gap-2 md:grid-cols-2">
          {f.copie && <p className="flex items-start gap-2 rounded-lg bg-gray-900/70 border border-gray-800 p-2.5 text-sm text-gray-200"><ClipboardCopy size={16} className="mt-0.5 shrink-0 text-sky-300" aria-hidden /><span><strong className="text-gray-50">Copie lá:</strong> {inline(f.copie, onArticle, `${k}-cp`)}</span></p>}
          {f.cole && <p className="flex items-start gap-2 rounded-lg bg-gray-900/70 border border-gray-800 p-2.5 text-sm text-gray-200"><ClipboardPaste size={16} className="mt-0.5 shrink-0 text-green-300" aria-hidden /><span><strong className="text-gray-50">Cole no ContentHub:</strong> {inline(f.cole, onArticle, `${k}-cl`)}</span></p>}
        </div>
      )}
      {f.obs && <p className="text-xs text-gray-400">{inline(f.obs, onArticle, `${k}-o`)}</p>}
    </section>
  );
}

export default function Markdown({ text, onArticle }: { text: string; onArticle: (id: string) => void }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;
  let n = 0;
  while (i < lines.length) {
    const l = lines[i];
    const k = `b${n++}`;
    if (!l.trim()) { i++; continue; }
    if (l.startsWith(":::fora ")) {
      const place = l.slice(8).trim();
      const f: Record<string, string> = {};
      i++;
      while (i < lines.length && lines[i].trim() !== ":::") {
        const c = lines[i].indexOf(":");
        if (c > 0) f[lines[i].slice(0, c).trim()] = lines[i].slice(c + 1).trim();
        i++;
      }
      i++;
      if (/^https:\/\//.test(f.link || "")) blocks.push(<OutsideStep key={k} k={k} place={place} f={f} onArticle={onArticle} />);
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(l);
    if (h) {
      const cls = h[1].length === 1 ? "text-xl font-bold text-gray-50 mt-2" : h[1].length === 2 ? "text-base font-semibold text-gray-100 mt-5" : "text-sm font-semibold text-gray-200 mt-4";
      blocks.push(h[1].length === 1 ? <h2 key={k} className={cls}>{inline(h[2], onArticle, k)}</h2> : h[1].length === 2 ? <h3 key={k} className={cls}>{inline(h[2], onArticle, k)}</h3> : <h4 key={k} className={cls}>{inline(h[2], onArticle, k)}</h4>);
      i++;
      continue;
    }
    if (/^>\s?/.test(l)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<div key={k} className="border-l-2 border-amber-400/70 bg-amber-500/10 text-amber-50 rounded-r-lg px-3 py-2 text-sm">{inline(buf.join(" "), onArticle, k)}</div>);
      continue;
    }
    if (/^(-|\d+\.)\s+/.test(l)) {
      const ordered = /^\d+\./.test(l);
      const items: string[] = [];
      while (i < lines.length && /^(-|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^(-|\d+\.)\s+/, ""));
      const cls = `space-y-1.5 pl-5 text-sm text-gray-300 ${ordered ? "list-decimal" : "list-disc"}`;
      const lis = items.map((it, j) => <li key={j}>{inline(it, onArticle, `${k}-${j}`)}</li>);
      blocks.push(ordered ? <ol key={k} className={cls}>{lis}</ol> : <ul key={k} className={cls}>{lis}</ul>);
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|-\s|\d+\.\s|:::)/.test(lines[i])) buf.push(lines[i++]);
    blocks.push(<p key={k} className="text-sm text-gray-300 leading-relaxed">{inline(buf.join(" "), onArticle, k)}</p>);
  }
  return <div className="space-y-3">{blocks}</div>;
}
