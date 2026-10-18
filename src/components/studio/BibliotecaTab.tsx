"use client";
/* eslint-disable react-hooks/set-state-in-effect -- carga inicial */

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Search, Trash2, Upload } from "lucide-react";
import { fieldCls, ghostBtn, primaryBtn } from "@/components/brand";
import { send } from "@/components/http";
import { LICENSES, SUGGESTED_CATEGORIES } from "@/lib/studio/cenas-spec";
import { Card, Field, Notice, linkBtn, uploadRaw } from "./shared";

interface SceneT { _id: string; url: string; poster: string | null; seconds: number; category: string; tags: string[]; title: string; license: string; licenseLabel: string; sourceUrl: string; author: string; provider: string; active: boolean }
interface PexelsT { id: number; url: string; thumb: string; seconds: number; author: string }

// BIBLIOTECA DE CENAS da conta: clipes com licença e origem guardadas. Filtro por categoria à vista
// (no link: ?view=estudio&aba=biblioteca&categoria=...), envio de clipe próprio e busca no Pexels.
export default function BibliotecaTab() {
  const [data, setData] = useState<{ scenes: SceneT[]; categories: { name: string; count: number }[] } | null>(null);
  const [cat, setCatState] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ categoria: "", licenca: "proprio", fonte: "", autor: "", titulo: "", foco: 0.5 });
  const fileRef = useRef<HTMLInputElement>(null);
  const [px, setPx] = useState<{ enabled: boolean; message?: string; results: PexelsT[] } | null>(null);
  const [q, setQ] = useState("");
  const [pxCat, setPxCat] = useState("");

  const load = useCallback(async () => {
    const r = await send<{ scenes: SceneT[]; categories: { name: string; count: number }[] }>("GET", "/api/estudio/cenas");
    if (r.ok) setData(r.data!); else setError(r.error);
  }, []);
  useEffect(() => {
    load();
    const c = new URLSearchParams(window.location.search).get("categoria");
    if (c) setCatState(c);
    send<{ enabled: boolean; message?: string; results: PexelsT[] }>("GET", "/api/estudio/cenas/pexels").then((r) => setPx(r.ok ? r.data! : { enabled: false, message: r.error, results: [] }));
  }, [load]);
  const setCat = (c: string) => {
    setCatState(c);
    const url = new URL(window.location.href);
    if (c) url.searchParams.set("categoria", c); else url.searchParams.delete("categoria");
    window.history.replaceState(null, "", url);
  };

  const lic = LICENSES.find((l) => l.id === form.licenca)!;
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy("enviar"); setError(""); setOk("");
    const qs = new URLSearchParams({ categoria: form.categoria, licenca: form.licenca, fonte: form.fonte, autor: form.autor, titulo: form.titulo || file.name.replace(/\.[^.]+$/, ""), foco: String(form.foco), name: file.name });
    const r = await uploadRaw<SceneT>(`/api/estudio/cenas?${qs}`, file);
    setBusy("");
    if (!r.ok) return setError(r.error);
    setOk(`Cena “${r.data!.title}” guardada em ${r.data!.category}.`);
    setForm((f) => ({ ...f, titulo: "" }));
    load();
  }
  async function patch(s: SceneT, body: Record<string, unknown>) {
    const r = await send("PUT", `/api/estudio/cenas/${s._id}`, body);
    if (!r.ok) return setError(r.error);
    load();
  }
  async function remove(s: SceneT) {
    if (!window.confirm(`Apagar a cena “${s.title}”? Vídeos já feitos não mudam.`)) return;
    const r = await send("DELETE", `/api/estudio/cenas/${s._id}`);
    if (!r.ok) return setError(r.error);
    load();
  }
  async function search() {
    setBusy("busca"); setError("");
    const r = await send<{ enabled: boolean; message?: string; results: PexelsT[] }>("GET", `/api/estudio/cenas/pexels?q=${encodeURIComponent(q)}`);
    setBusy("");
    if (!r.ok) return setError(r.error);
    setPx(r.data!);
  }
  async function importPx(v: PexelsT) {
    setBusy(`px${v.id}`); setError(""); setOk("");
    const r = await send<SceneT>("POST", "/api/estudio/cenas/pexels", { id: v.id, categoria: pxCat });
    setBusy("");
    if (!r.ok) return setError(r.error);
    setOk(`Vídeo do Pexels importado em ${r.data!.category}, com a licença e o link guardados.`);
    load();
  }

  const shown = (data?.scenes || []).filter((s) => !cat || s.category === cat);
  const catOptions = [...new Set([...(data?.categories || []).map((c) => c.name), ...SUGGESTED_CATEGORIES.map((c) => c.toLowerCase())])];

  return (
    <div className="space-y-4" data-testid="biblioteca">
      <Card title="Cenas da conta" hint="Clipes verticais de até 20 s, sem som. Cada um guarda a licença e de onde veio.">
        <div className="flex flex-wrap gap-1.5 mb-3" role="toolbar" aria-label="Categorias" data-testid="biblioteca-filtro">
          <button type="button" onClick={() => setCat("")} className={`px-2.5 py-1 rounded-full text-xs border ${!cat ? "border-brand-500 bg-brand-500/15 text-gray-100" : "border-gray-700 text-gray-400"}`}>todas <span className="opacity-60">{data?.scenes.length ?? 0}</span></button>
          {(data?.categories || []).map((c) => <button key={c.name} type="button" onClick={() => setCat(c.name)} className={`px-2.5 py-1 rounded-full text-xs border ${cat === c.name ? "border-brand-500 bg-brand-500/15 text-gray-100" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>{c.name} <span className="opacity-60">{c.count}</span></button>)}
        </div>
        {!data ? <p className="text-sm text-gray-500">Carregando…</p> : shown.length === 0 ? <p className="text-sm text-gray-500 py-6 text-center">Nenhuma cena{cat ? ` em ${cat}` : ""} ainda. Envie um clipe abaixo.</p> : (
          <ul className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" data-testid="biblioteca-grade">
            {shown.map((s) => (
              <li key={s._id} className={`rounded-lg border border-gray-800 bg-gray-900 overflow-hidden ${s.active ? "" : "opacity-50"}`}>
                <a href={s.url} target="_blank" rel="noreferrer" className="block aspect-[9/16] bg-gray-800 relative" title="Abrir o clipe">
                  {/* eslint-disable-next-line @next/next/no-img-element -- capa gerada pelo app */}
                  {s.poster && <img src={s.poster} alt="" className="w-full h-full object-cover" loading="lazy" />}
                  <span className="absolute bottom-1 right-1 text-[10px] bg-black/70 text-white rounded px-1">{s.seconds.toLocaleString("pt-BR")} s</span>
                </a>
                <div className="p-2 space-y-1">
                  <p className="text-xs text-gray-100 truncate" title={s.title}>{s.title || "Cena"}</p>
                  <select aria-label="Categoria" className="w-full bg-gray-800 text-[11px] text-gray-300 rounded px-1 py-0.5" value={s.category} onChange={(e) => patch(s, { category: e.target.value })}>{[...new Set([s.category, ...catOptions])].map((c) => <option key={c} value={c}>{c}</option>)}</select>
                  <p className="text-[10px] text-gray-500 truncate" title={`${s.licenseLabel}${s.author ? ` · ${s.author}` : ""}`}>{s.licenseLabel}{s.author ? ` · ${s.author}` : ""}</p>
                  <div className="flex items-center gap-2 text-[11px]">
                    {s.sourceUrl && <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-gray-200" title="Página de origem (prova da licença)"><ExternalLink size={12} /></a>}
                    <label className="flex items-center gap-1 text-gray-400"><input type="checkbox" checked={s.active} onChange={(e) => patch(s, { active: e.target.checked })} />usar</label>
                    <button type="button" className="ml-auto text-gray-500 hover:text-red-300" aria-label={`Apagar ${s.title}`} onClick={() => remove(s)}><Trash2 size={12} /></button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {error && <Notice tone="bad" onClose={() => setError("")}>{error}</Notice>}
      {ok && <Notice tone="ok" onClose={() => setOk("")}>{ok}</Notice>}

      <Card title="Enviar um clipe" hint="MP4 ou MOV até 300 MB. O app recorta na vertical, tira o som e guarda até 20 s.">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Categoria"><input className={fieldCls()} list="cenas-cats" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="mar/praia" data-testid="cena-categoria" /></Field>
          <Field label="Licença"><select className={fieldCls()} value={form.licenca} onChange={(e) => setForm({ ...form, licenca: e.target.value })} data-testid="cena-licenca">{LICENSES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></Field>
          {lic.needsUrl ? <Field label="Página de origem (https)"><input className={fieldCls()} value={form.fonte} onChange={(e) => setForm({ ...form, fonte: e.target.value })} placeholder="https://..." data-testid="cena-fonte" /></Field>
            : <Field label="Quem gravou"><input className={fieldCls()} value={form.autor} onChange={(e) => setForm({ ...form, autor: e.target.value })} placeholder="Nome da pessoa ou empresa" data-testid="cena-autor" /></Field>}
          <Field label="Título (opcional)"><input className={fieldCls()} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></Field>
          <Field label={`Foco do recorte: ${form.foco < 0.4 ? "esquerda" : form.foco > 0.6 ? "direita" : "centro"}`}><input type="range" min={0} max={1} step={0.05} value={form.foco} onChange={(e) => setForm({ ...form, foco: Number(e.target.value) })} className="w-full mt-2" /></Field>
          <div className="flex items-end"><button type="button" className={primaryBtn} disabled={busy !== "" || !form.categoria.trim()} onClick={() => fileRef.current?.click()} data-testid="cena-enviar"><Upload size={14} className="inline -mt-0.5 mr-1" />{busy === "enviar" ? "Convertendo…" : "Escolher o clipe"}</button></div>
        </div>
        <datalist id="cenas-cats">{catOptions.map((c) => <option key={c} value={c} />)}</datalist>
        <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        <p className="text-xs text-gray-500 mt-2">Só envie clipe que a marca tem o direito de usar. Sem licença o clipe não entra.</p>
      </Card>

      <Card title="Buscar no Pexels" hint="Vídeos gratuitos com a Licença Pexels. O link e o autor ficam guardados na cena." right={<a href="https://www.pexels.com" target="_blank" rel="noreferrer" className={linkBtn}>Vídeos fornecidos pelo Pexels</a>}>
        {!px ? <p className="text-sm text-gray-500">Carregando…</p> : !px.enabled ? <p className="text-sm text-gray-400" data-testid="pexels-desligado">{px.message}</p> : (
          <>
            <div className="flex flex-wrap gap-2 items-end">
              <Field label="Procurar (em inglês funciona melhor)" className="flex-1 min-w-[200px]"><input className={fieldCls()} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") search(); }} placeholder="ocean sunset" /></Field>
              <Field label="Guardar em"><input className={fieldCls()} list="cenas-cats" value={pxCat} onChange={(e) => setPxCat(e.target.value)} placeholder="categoria" /></Field>
              <button type="button" className={ghostBtn} disabled={busy !== "" || q.trim().length < 2} onClick={search}><Search size={12} className="inline -mt-0.5" /> Buscar</button>
            </div>
            <ul className="grid gap-3 grid-cols-3 md:grid-cols-6 mt-3">
              {px.results.map((v) => (
                <li key={v.id} className="rounded-lg overflow-hidden border border-gray-800">
                  {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do Pexels */}
                  <img src={v.thumb} alt="" className="aspect-[9/16] object-cover w-full" loading="lazy" />
                  <div className="p-1.5 text-[11px] text-gray-400 truncate">{v.author} · {v.seconds} s</div>
                  <button type="button" className={`${linkBtn} px-1.5 pb-1.5`} disabled={busy !== "" || !pxCat.trim()} onClick={() => importPx(v)}>{busy === `px${v.id}` ? "Importando…" : "Importar"}</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
