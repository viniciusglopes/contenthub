"use client";
/* eslint-disable react-hooks/set-state-in-effect -- artigo lido do link e carga inicial */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Circle, Info, Lock, MinusCircle, Search } from "lucide-react";
import { fieldCls } from "@/components/brand";
import { send } from "@/components/http";
import type { ProjectLite } from "@/components/posts/flow";
import type { Article } from "@/lib/help/types";
import Markdown from "./Markdown";

interface Step { id: string; title: string; state: "feito" | "pendente" | "indisponivel" | "info"; detail: string; article: string }
const ICON = { feito: <CheckCircle2 size={18} className="text-green-400" />, pendente: <Circle size={18} className="text-gray-500" />, indisponivel: <MinusCircle size={18} className="text-gray-600" />, info: <Info size={18} className="text-sky-400" /> };
const LABEL = { feito: "feito", pendente: "falta fazer", indisponivel: "ainda não disponível", info: "para saber" };
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// AJUDA: busca à vista, lista de artigos e o artigo aberto (fica no link: ?view=ajuda&artigo=id).
// No artigo "Primeiros passos" aparece o andamento real do projeto escolhido.
export default function HelpPanel({ projects, selectedProject, onSelectProject }: { projects: ProjectLite[]; selectedProject: string; onSelectProject: (id: string) => void }) {
  const [list, setList] = useState<Article[] | null>(null);
  const [q, setQ] = useState("");
  const [current, setCurrentState] = useState("");
  const [steps, setSteps] = useState<{ steps: Step[]; done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const project = projects.some((p) => p._id === selectedProject) ? selectedProject : projects[0]?._id || "";

  useEffect(() => {
    send<Article[]>("GET", "/api/ajuda").then((r) => (r.ok ? setList(r.data!) : setError(r.error)));
    const a = new URLSearchParams(window.location.search).get("artigo");
    setCurrentState(a || "primeiros-passos");
  }, []);
  const open = useCallback((id: string) => {
    setCurrentState(id);
    const url = new URL(window.location.href);
    url.searchParams.set("view", "ajuda");
    if (id) url.searchParams.set("artigo", id); else url.searchParams.delete("artigo");
    window.history.replaceState(null, "", url);
    document.getElementById("ajuda-artigo")?.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    if (current !== "primeiros-passos" || !project) return;
    setSteps(null);
    send<{ steps: Step[]; done: number; total: number }>("GET", `/api/ajuda/checklist?project=${project}`).then((r) => (r.ok ? setSteps(r.data!) : setError(r.error)));
  }, [current, project]);

  const found = useMemo(() => {
    if (!list) return [];
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return list;
    return list.map((a) => {
      const hay = norm(`${a.title} ${a.summary} ${a.tags.join(" ")}`);
      const body = norm(a.body);
      const ok = words.every((w) => hay.includes(w) || body.includes(w));
      return { a, ok, score: words.filter((w) => hay.includes(w)).length };
    }).filter((x) => x.ok).sort((x, y) => y.score - x.score).map((x) => x.a);
  }, [list, q]);
  const art = list?.find((a) => a.id === current) || null;

  return (
    <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden" data-testid="ajuda">
      <aside className={`md:w-72 md:shrink-0 border-b md:border-b-0 md:border-r border-gray-800 flex flex-col min-h-0 ${art ? "hidden md:flex" : "flex flex-1 md:flex-none"}`}>
        <div className="p-3 border-b border-gray-800">
          <label className="relative block">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input className={`${fieldCls()} !pl-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar na ajuda (ex.: token, Pexels)" aria-label="Buscar na ajuda" data-testid="ajuda-busca" />
          </label>
          {q && <p className="text-[11px] text-gray-500 mt-1.5">{found.length} artigo{found.length === 1 ? "" : "s"}</p>}
        </div>
        <nav className="overflow-auto p-2 space-y-0.5" aria-label="Artigos da ajuda">
          {!list && !error && <p className="text-sm text-gray-500 p-2">Carregando…</p>}
          {found.map((a) => (
            <button key={a.id} type="button" onClick={() => open(a.id)} className={`w-full text-left px-3 py-2 rounded-lg transition ${current === a.id ? "bg-gray-800" : "hover:bg-gray-800/50"}`} aria-current={current === a.id ? "page" : undefined}>
              <span className="flex items-center gap-1.5 text-sm text-gray-100 truncate">{a.admin && <Lock size={12} className="text-amber-300 shrink-0" aria-label="Só administrador" />}<span className="truncate">{a.title}</span></span>
              <span className="block text-xs text-gray-500 truncate" title={a.summary}>{a.summary}</span>
            </button>
          ))}
          {list && found.length === 0 && <p className="text-sm text-gray-500 p-2">Nada encontrado para “{q}”.</p>}
        </nav>
      </aside>

      <section id="ajuda-artigo" className={`flex-1 min-w-0 overflow-auto p-4 md:p-8 ${art ? "" : "hidden md:block"}`}>
        {error && <p className="text-sm text-red-300">{error}</p>}
        {art ? (
          <article className="max-w-3xl space-y-4" data-testid={`artigo-${art.id}`}>
            <button type="button" className="md:hidden flex items-center gap-1 text-sm text-gray-400" onClick={() => open("")}><ArrowLeft size={14} /> Todos os artigos</button>
            {art.admin && <p className="text-xs text-amber-300 flex items-center gap-1"><Lock size={12} /> Só o administrador da plataforma vê este artigo.</p>}
            {art.id === "primeiros-passos" && projects.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4" data-testid="ajuda-checklist">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-100">Andamento do projeto</h3>
                  <select className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-gray-100 max-w-[220px]" value={project} onChange={(e) => onSelectProject(e.target.value)} aria-label="Projeto">{projects.map((p) => <option key={p._id} value={p._id}>{p.icon} {p.name}</option>)}</select>
                  {steps && <span className="ml-auto text-xs text-gray-400">{steps.done} de {steps.total} feitos</span>}
                </div>
                {!steps ? <p className="text-sm text-gray-500">Conferindo…</p> : (
                  <ol className="space-y-1">
                    {steps.steps.map((s) => (
                      <li key={s.id}>
                        <button type="button" onClick={() => open(s.article)} className="w-full text-left flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-gray-800/60" data-testid={`passo-${s.id}`}>
                          <span className="mt-0.5 shrink-0" aria-hidden>{ICON[s.state]}</span>
                          <span className="min-w-0 flex-1"><span className="flex flex-wrap items-baseline gap-x-2 text-sm text-gray-100">{s.title}<span className={`text-[11px] ${s.state === "feito" ? "text-green-400" : s.state === "pendente" ? "text-amber-300" : "text-gray-500"}`}>{LABEL[s.state]}</span></span><span className="block text-xs text-gray-400">{s.detail}</span></span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
            <Markdown text={art.body} onArticle={open} />
          </article>
        ) : list && <p className="text-sm text-gray-500">Escolha um artigo.</p>}
      </section>
    </div>
  );
}
