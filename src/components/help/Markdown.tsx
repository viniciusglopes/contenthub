"use client";

import type { ReactNode } from "react";

// Markdown simples e SEGURO dos artigos da Ajuda: vira elementos React (nada de HTML cru).
// Suporta: # ## ### títulos, parágrafos, listas (- e 1.), > aviso, **negrito**, `código`,
// [texto](https://...) (abre em outra aba) e [texto](artigo:id) (abre outro artigo da Ajuda).

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

export default function Markdown({ text, onArticle }: { text: string; onArticle: (id: string) => void }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;
  let n = 0;
  while (i < lines.length) {
    const l = lines[i];
    const k = `b${n++}`;
    if (!l.trim()) { i++; continue; }
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
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|-\s|\d+\.\s)/.test(lines[i])) buf.push(lines[i++]);
    blocks.push(<p key={k} className="text-sm text-gray-300 leading-relaxed">{inline(buf.join(" "), onArticle, k)}</p>);
  }
  return <div className="space-y-3">{blocks}</div>;
}
