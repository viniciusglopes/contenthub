"use client";
/* eslint-disable react-hooks/set-state-in-effect -- aba lida do link e carga inicial */

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Clapperboard, GalleryHorizontalEnd, KeyRound, Palette } from "lucide-react";
import { send } from "@/components/http";
import type { PostT, ProjectLite } from "@/components/posts/flow";
import { PURPOSE_KEYS } from "@/lib/studio/catalog";
import type { CarouselScript } from "@/lib/studio/script";
import CarouselTab from "./CarouselTab";
import KeysTab from "./KeysTab";
import KitTab from "./KitTab";
import ReelTab, { JOB_ACTIVE, type JobT } from "./ReelTab";
import UsageTab from "./UsageTab";
import { Notice, linkBtn } from "./shared";

const TABS = [
  { id: "carrossel", label: "Carrossel", icon: GalleryHorizontalEnd },
  { id: "reel", label: "Reel", icon: Clapperboard },
  { id: "kit", label: "Kit de marca", icon: Palette },
  { id: "chaves", label: "Chaves de IA", icon: KeyRound },
  { id: "uso", label: "Uso e custos", icon: BarChart3 },
] as const;
type Tab = (typeof TABS)[number]["id"];

// ESTÚDIO: criar carrossel e Reel a partir do kit de marca do projeto. Vive dentro da casca do
// ContentHub (menu, projeto selecionado) e a aba fica no link (?view=estudio&aba=reel).
export default function StudioPanel({ projects, selectedProject, onSelectProject, isAdmin, onDraft, onOpenPost }: { projects: ProjectLite[]; selectedProject: string; onSelectProject: (id: string) => void; isAdmin: boolean; onDraft: (post: PostT) => void; onOpenPost: (id: string) => void }) {
  const [tab, setTabState] = useState<Tab>("carrossel");
  const [ai, setAi] = useState<Record<string, boolean>>({});
  const [jobs, setJobs] = useState<JobT[]>([]);
  const [carousel, setCarousel] = useState<CarouselScript | null>(null);
  const [savedPost, setSavedPost] = useState<PostT | null>(null);
  const project = projects.some((p) => p._id === selectedProject) ? selectedProject : projects[0]?._id || "";

  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("aba");
    if (TABS.some((t) => t.id === a)) setTabState(a as Tab);
  }, []);
  function setTab(t: Tab) {
    setTabState(t);
    const url = new URL(window.location.href);
    if (t === "carrossel") url.searchParams.delete("aba");
    else url.searchParams.set("aba", t);
    window.history.replaceState(null, "", url);
  }

  // quais finalidades têm provedor (chave própria ou da casa): decide o que a tela oferece
  const loadAi = useCallback(async () => {
    const r = await send<{ keys: { active: boolean; hasKey: boolean; purposes: string[] }[]; house: Record<string, string[]> }>("GET", "/api/estudio/chaves");
    if (r.ok) setAi(Object.fromEntries(PURPOSE_KEYS.map((p) => [p, r.data!.keys.some((k) => k.active && k.hasKey && k.purposes.includes(p)) || (r.data!.house[p] || []).length > 0])));
  }, []);
  const loadJobs = useCallback(async () => {
    const r = await send<JobT[]>("GET", "/api/estudio/trabalhos");
    if (!r.ok) return;
    setJobs(r.data!);
  }, []);
  useEffect(() => {
    loadAi();
    loadJobs();
  }, [loadAi, loadJobs]);
  // enquanto houver trabalho andando, a tela acompanha
  const running = jobs.some((j) => JOB_ACTIVE.includes(j.status));
  useEffect(() => {
    if (!running) return;
    const t = setInterval(loadJobs, 3000);
    return () => clearInterval(t);
  }, [running, loadJobs]);
  useEffect(() => { if (tab !== "chaves") loadAi(); }, [tab, loadAi]);

  async function seen(id: string) {
    setJobs((list) => list.map((j) => (j._id === id ? { ...j, seen: true } : j)));
    await send("PUT", `/api/estudio/trabalhos/${id}`, { seen: true });
  }
  const news = jobs.filter((j) => !j.seen && (j.status === "done" || j.status === "failed"));

  if (projects.length === 0) return <p className="text-sm text-gray-400 py-16 text-center">Crie um projeto primeiro: o Estúdio usa o kit de marca do projeto.</p>;
  return (
    <div className="flex-1 overflow-auto p-3 md:p-6" data-testid="estudio">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-gray-400 flex items-center gap-2">Projeto
            <select className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-gray-100 max-w-[220px]" value={project} onChange={(e) => onSelectProject(e.target.value)} data-testid="estudio-projeto">
              {projects.map((p) => <option key={p._id} value={p._id}>{p.icon} {p.name}</option>)}
            </select>
          </label>
          <nav className="flex gap-1 overflow-x-auto ml-auto max-w-full" aria-label="Áreas do Estúdio">
            {TABS.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition ${tab === t.id ? "bg-gray-800 text-white font-semibold" : "text-gray-400 hover:bg-gray-800/50"}`} aria-current={tab === t.id ? "page" : undefined} data-testid={`aba-${t.id}`}>
                <t.icon size={15} />{t.label}
              </button>
            ))}
          </nav>
        </div>

        {news.map((j) => (
          <Notice key={j._id} tone={j.status === "done" ? "ok" : "bad"} onClose={() => seen(j._id)}>
            {j.status === "done" ? <>O Reel “{j.title}” ficou pronto e está nos rascunhos. {j.post && <button type="button" className={`${linkBtn} !text-green-100`} onClick={() => { seen(j._id); onOpenPost(j.post!); }}>Ver rascunho</button>}</> : <>O Reel “{j.title}” não deu certo: {j.error}</>}
          </Notice>
        ))}
        {savedPost && <Notice tone="ok" onClose={() => setSavedPost(null)}>Carrossel salvo como rascunho para amanhã às 09:00. <button type="button" className={`${linkBtn} !text-green-100`} onClick={() => { onOpenPost(savedPost._id); setSavedPost(null); }}>Abrir o rascunho</button></Notice>}

        {tab === "carrossel" && <CarouselTab key={project} project={project} hasText={Boolean(ai.texto)} script={carousel} setScript={setCarousel} onDraft={(p) => { setSavedPost(p); onDraft(p); }} goKeys={() => setTab("chaves")} />}
        {tab === "reel" && <ReelTab key={project} project={project} ai={ai} carousel={carousel} jobs={jobs} onJobs={loadJobs} onOpenPost={onOpenPost} goKeys={() => setTab("chaves")} />}
        {tab === "kit" && <KitTab key={project} project={project} />}
        {tab === "chaves" && <KeysTab isAdmin={isAdmin} />}
        {tab === "uso" && <UsageTab />}
      </div>
    </div>
  );
}
