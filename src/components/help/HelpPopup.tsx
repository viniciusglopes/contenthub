"use client";
/* eslint-disable react-hooks/set-state-in-effect -- reinicia o histórico do popup ao abrir */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, HelpCircle, X } from "lucide-react";
import { send } from "@/components/http";
import type { Article, Screen } from "@/lib/help/types";
import Markdown from "./Markdown";
import ScreenGuide from "./ScreenGuide";

// POPUP DE AJUDA: abre por cima da tela (a pessoa não sai de onde está). Mostra o print da própria tela com
// os números de onde clicar e, embaixo, o artigo da Ajuda daquela tela (com os passos de fora do ContentHub:
// Meta, Hotmart, Kiwify...). Links para outros artigos abrem aqui mesmo, com "voltar".
// Acessível: Esc fecha, o foco fica preso na janela e volta para o botão que abriu.

export interface HelpTarget { screen?: string; article?: string }
interface Data { articles: Article[]; screens: Screen[] }

let cache: Promise<Data | string> | null = null;
function load(): Promise<Data | string> {
  if (!cache) {
    cache = Promise.all([send<Article[]>("GET", "/api/ajuda"), send<Screen[]>("GET", "/api/ajuda/telas")]).then(([a, s]) => {
      if (!a.ok || !s.ok) { cache = null; return a.error || s.error || "Não deu para carregar a ajuda."; }
      return { articles: a.data!, screens: s.data! };
    });
  }
  return cache;
}

const short = (s: Screen) => (s.title.includes(": ") ? s.title.split(": ").slice(1).join(": ") : s.title);
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function HelpPopup({ target, onClose, onOpenAll }: { target: HelpTarget | null; onClose: () => void; onOpenAll: (article: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [stack, setStack] = useState<HelpTarget[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!target) return;
    opener.current = document.activeElement as HTMLElement | null;
    setStack([target]);
    setError("");
    load().then((r) => (typeof r === "string" ? setError(r) : setData(r)));
  }, [target]);

  const close = useCallback(() => {
    onClose();
    const back = opener.current;
    if (back && document.contains(back)) setTimeout(() => back.focus(), 0);
  }, [onClose]);

  // Esc fecha; Tab e Shift+Tab giram só dentro da janela; a página de trás não rola.
  useEffect(() => {
    if (!target) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== "Tab" || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!box.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    setTimeout(() => box.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus(), 0);
    return () => { document.removeEventListener("keydown", onKey, true); document.body.style.overflow = prev; };
  }, [target, close]);

  const cur = stack[stack.length - 1];
  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [cur]);
  if (!target || !cur) return null;

  const screen = cur.screen ? data?.screens.find((s) => s.id === cur.screen) || null : null;
  const articleId = cur.article || screen?.article || "";
  const article = data?.articles.find((a) => a.id === articleId) || null;
  const area = screen ? data!.screens.filter((s) => s.area === screen.area) : [];
  // Aberto por um artigo (link ou "?" de uma área): mostra também onde aquilo fica no ContentHub.
  const related = !screen && data ? data.screens.filter((s) => s.article === articleId).slice(0, 2) : [];
  const title = screen ? screen.title : article?.title || "Ajuda";
  const push = (t: HelpTarget) => setStack((s) => [...s, t]);
  const replace = (t: HelpTarget) => setStack((s) => [...s.slice(0, -1), t]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-black/70 md:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} data-testid="ajuda-popup-fundo">
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="ajuda-popup-titulo" className="flex w-full md:max-w-4xl max-h-[94dvh] md:max-h-[90dvh] flex-col rounded-t-2xl md:rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl" data-testid="ajuda-popup">
        <header className="shrink-0 flex items-start gap-2 border-b border-gray-800 px-4 py-3 md:px-5">
          {stack.length > 1 ? (
            <button type="button" onClick={() => setStack((s) => s.slice(0, -1))} className="mt-0.5 rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white" aria-label="Voltar" data-testid="ajuda-popup-voltar"><ArrowLeft size={18} /></button>
          ) : (
            <span className="mt-1.5 text-brand-400" aria-hidden><HelpCircle size={18} /></span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Ajuda desta tela</p>
            <h2 id="ajuda-popup-titulo" className="truncate text-base font-bold text-gray-50" title={title}>{title}</h2>
          </div>
          <button type="button" onClick={close} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white" aria-label="Fechar ajuda (Esc)" title="Fechar (Esc)" data-autofocus data-testid="ajuda-popup-fechar"><X size={20} /></button>
        </header>

        {area.length > 1 && (
          <nav className="shrink-0 flex gap-1.5 overflow-x-auto border-b border-gray-800 px-4 py-2 md:px-5" aria-label="Outras telas desta área">
            {area.map((s) => (
              <button key={s.id} type="button" onClick={() => replace({ screen: s.id })} aria-current={s.id === screen?.id ? "page" : undefined} className={`whitespace-nowrap rounded-full px-3 py-1 text-xs transition ${s.id === screen?.id ? "bg-brand-500 text-brand-ink font-semibold" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`} data-testid={`ajuda-popup-tela-${s.id}`}>{short(s)}</button>
            ))}
          </nav>
        )}

        <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5 space-y-5 overscroll-contain">
          {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
          {!data && !error && <p className="text-sm text-gray-500">Carregando…</p>}
          {screen && <ScreenGuide screen={screen} />}
          {related.map((s) => (
            <details key={s.id} className="rounded-lg border border-gray-800 bg-gray-950/40 p-3" open={related.length === 1}>
              <summary className="cursor-pointer text-sm font-semibold text-gray-200">Onde fica no ContentHub: {s.title}</summary>
              <div className="mt-3"><ScreenGuide screen={s} compact /></div>
            </details>
          ))}
          {article && (
            <article className="space-y-3 border-t border-gray-800 pt-4" data-testid={`ajuda-popup-artigo-${article.id}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Passo a passo completo</p>
              <Markdown text={article.body} onArticle={(id) => push({ article: id })} />
            </article>
          )}
          {data && !article && !screen && <p className="text-sm text-gray-400">Não achamos a ajuda desta tela. Veja todos os artigos.</p>}
        </div>

        <footer className="shrink-0 flex items-center gap-3 border-t border-gray-800 px-4 py-3 md:px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => onOpenAll(articleId || "primeiros-passos")} className="inline-flex items-center gap-1.5 text-sm text-gray-300 underline-offset-2 hover:text-white hover:underline" data-testid="ajuda-popup-todos"><BookOpen size={15} aria-hidden /> Ver todos os artigos</button>
          <button type="button" onClick={close} className="ml-auto rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-400">Entendi</button>
        </footer>
      </div>
    </div>
  );
}
