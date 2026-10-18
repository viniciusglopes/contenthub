"use client";
/* eslint-disable react-hooks/set-state-in-effect -- aba lida do link e carga inicial */

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Megaphone, Package, Pencil, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { send } from "@/components/http";
import { fmt, fmtDateTime } from "@/components/instagram/shared";
import { Card, Field, Notice, fmtBrl, linkBtn } from "@/components/studio/shared";

interface IgMedia { caption: string; likes: number; comments: number; timestamp: string; kind: string; permalink: string }
interface Competitor {
  _id: string; name: string; instagram: string; youtube: string; facebookPage: string; notes: string;
  ig: null | { at: string; username?: string; name?: string; followers?: number | null; mediaCount?: number | null; media?: IgMedia[]; error?: string };
  igSummary: null | { avgLikes: number | null; avgComments: number | null; engagement: number | null; perWeek: number | null; mix: Record<string, number>; top: IgMedia[] };
  yt: null | { at: string; title?: string; handle?: string; subscribers?: number | null; videoCount?: number | null; viewCount?: number | null; videos?: { id: string; title: string; publishedAt: string; views: number; short: boolean }[]; error?: string };
  adLibrary: null | { at: string; count: number; ads: { id: string; page: string; start: string; snapshot: string; body: string }[]; note: string; error: string };
  adLibraryUrl: string;
  growth: { igFollowers: null | { from: number; to: number; since: string; delta: number }; ytSubscribers: null | { from: number; to: number; since: string; delta: number } };
}
interface Sources { instagram: boolean; instagramNote: string; youtube: boolean; youtubeHouse: boolean; adLibraryNote: string }
interface Product { _id: string; competitor: string; name: string; platform: string; price: number | null; promise: string; link: string; notes: string }
interface ProjectOpt { _id: string; name: string; icon?: string }

const TABS = [
  { id: "perfis", label: "Perfis", icon: Users },
  { id: "anuncios", label: "Anúncios", icon: Megaphone },
  { id: "produtos", label: "Produtos", icon: Package },
] as const;
type Tab = (typeof TABS)[number]["id"];

const input = "block w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 mt-1";
const primary = "bg-brand-500 text-brand-ink px-4 py-2 rounded-lg font-semibold text-sm hover:bg-brand-400 transition disabled:opacity-60";
const btn = "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-gray-700 text-gray-200 hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap";
const KIND_PT: Record<string, string> = { reel: "Reels", carrossel: "Carrossel", imagem: "Imagem", video: "Vídeo" };
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }) : "");
const growthText = (g: { delta: number; since: string } | null) => (g ? `${g.delta >= 0 ? "+" : ""}${fmt(g.delta)} desde ${g.since.split("-").reverse().slice(0, 2).join("/")}` : "crescimento aparece a partir da 2ª leitura (em outro dia)");

function CompetitorForm({ project, initial, onDone, onCancel }: { project: string; initial?: Competitor; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ name: initial?.name || "", instagram: initial?.instagram || "", youtube: initial?.youtube || "", facebookPage: initial?.facebookPage || "", notes: initial?.notes || "" });
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = initial ? await send("PUT", `/api/concorrentes/${initial._id}`, f) : await send("POST", "/api/concorrentes", { ...f, project });
    setBusy(false);
    if (!r.ok) return setErr({ msg: r.error, field: r.field });
    onDone();
  }
  const fe = (k: string) => (err?.field === k ? err.msg : undefined);
  return (
    <Card title={initial ? `Editar ${initial.name}` : "Novo concorrente"}>
      <form onSubmit={submit} className="space-y-3" data-testid="concorrente-form">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Nome" error={fe("name")}><input className={input} value={f.name} onChange={set("name")} placeholder="Ex.: Escola X" /></Field>
          <Field label="Instagram" hint="@ da conta profissional" error={fe("instagram")}><input className={input} value={f.instagram} onChange={set("instagram")} placeholder="@concorrente" autoCapitalize="none" /></Field>
          <Field label="YouTube" hint="@ do canal ou link" error={fe("youtube")}><input className={input} value={f.youtube} onChange={set("youtube")} placeholder="@canal" autoCapitalize="none" /></Field>
          <Field label="Página do Facebook" hint="nome ou id, para os anúncios" error={fe("facebookPage")}><input className={input} value={f.facebookPage} onChange={set("facebookPage")} placeholder="Nome da página" /></Field>
        </div>
        <Field label="Observações"><textarea className={`${input} min-h-16`} value={f.notes} onChange={set("notes")} placeholder="O que chama atenção nesse concorrente" /></Field>
        {err && !["name", "instagram", "youtube", "facebookPage"].includes(err.field || "") && <p className="text-xs text-red-400" role="alert">{err.msg}</p>}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={busy} className={primary}>{busy ? "Salvando..." : "Salvar"}</button>
          <button type="button" className={linkBtn} onClick={onCancel}>Cancelar</button>
        </div>
      </form>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="text-lg font-bold text-white tabular-nums truncate">{value}</div>
      {sub && <div className="text-[11px] text-gray-500 leading-snug">{sub}</div>}
    </div>
  );
}

function ProfileCard({ c, onRefresh, onEdit, onDelete, busy }: { c: Competitor; onRefresh: () => void; onEdit: () => void; onDelete: () => void; busy: boolean }) {
  const s = c.igSummary;
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4 min-w-0" data-testid="concorrente-card">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-100 truncate">{c.name}</h3>
          <p className="text-xs text-gray-400 truncate">{[c.instagram && `@${c.instagram}`, c.youtube && `YouTube ${c.youtube}`].filter(Boolean).join(" · ") || "sem perfis"}</p>
        </div>
        <button type="button" className={btn} onClick={onRefresh} disabled={busy} data-testid="concorrente-atualizar"><RefreshCw size={14} className={busy ? "animate-spin" : ""} /> {busy ? "Lendo..." : "Atualizar"}</button>
        <button type="button" className="p-2 text-gray-400 hover:text-gray-200" onClick={onEdit} aria-label="Editar"><Pencil size={15} /></button>
        <button type="button" className="p-2 text-gray-400 hover:text-red-300" onClick={onDelete} aria-label="Apagar"><Trash2 size={15} /></button>
      </div>

      {c.instagram && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Instagram</h4>
          {!c.ig ? <p className="text-sm text-gray-400">Ainda não lido. Clique em Atualizar.</p> : c.ig.error ? <p className="text-sm text-amber-200">{c.ig.error}</p> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Seguidores" value={fmt(c.ig.followers)} sub={growthText(c.growth.igFollowers)} />
                <Stat label="Posts no perfil" value={fmt(c.ig.mediaCount)} />
                <Stat label="Média por post (últimos 12)" value={`${fmt(s?.avgLikes)} curt.`} sub={`${fmt(s?.avgComments)} comentários`} />
                <Stat label="Engajamento / frequência" value={s?.engagement != null ? `${s.engagement.toLocaleString("pt-BR")}%` : "–"} sub={s?.perWeek != null ? `${s.perWeek.toLocaleString("pt-BR")} posts por semana` : undefined} />
              </div>
              {s && Object.keys(s.mix).length > 0 && <p className="text-[11px] text-gray-500">Formatos dos últimos 12: {Object.entries(s.mix).map(([k, n]) => `${KIND_PT[k] || k} ${n}`).join(" · ")}</p>}
              {s && s.top.length > 0 && (
                <ul className="space-y-1">
                  {s.top.map((m) => (
                    <li key={m.permalink || m.timestamp} className="text-xs text-gray-300 flex gap-2 min-w-0">
                      <span className="text-gray-500 shrink-0">{day(m.timestamp)}</span>
                      <span className="truncate flex-1" title={m.caption}>{m.caption.split("\n")[0] || "(sem legenda)"}</span>
                      <span className="shrink-0 tabular-nums text-gray-400">{fmt(m.likes)} · {fmt(m.comments)}</span>
                      {m.permalink && <a href={m.permalink} target="_blank" rel="noreferrer" aria-label="Abrir post" className="shrink-0 text-gray-400 hover:text-gray-200"><ExternalLink size={12} /></a>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-gray-500">Lido em {fmtDateTime(c.ig.at)}. Alcance, salvamentos e visualizações de outra conta a Meta não informa: só curtidas e comentários públicos.</p>
            </>
          )}
        </div>
      )}

      {c.youtube && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">YouTube</h4>
          {!c.yt ? <p className="text-sm text-gray-400">Ainda não lido. Clique em Atualizar.</p> : c.yt.error ? <p className="text-sm text-amber-200">{c.yt.error}</p> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Stat label="Inscritos" value={c.yt.subscribers == null ? "oculto" : fmt(c.yt.subscribers)} sub={growthText(c.growth.ytSubscribers)} />
                <Stat label="Vídeos" value={fmt(c.yt.videoCount)} />
                <Stat label="Visualizações (total)" value={fmt(c.yt.viewCount)} />
              </div>
              {!!c.yt.videos?.length && (
                <ul className="space-y-1">
                  {c.yt.videos.slice(0, 5).map((v) => (
                    <li key={v.id} className="text-xs text-gray-300 flex gap-2 min-w-0">
                      <span className="text-gray-500 shrink-0">{day(v.publishedAt)}</span>
                      <span className="truncate flex-1" title={v.title}>{v.short && <span className="text-[10px] mr-1 px-1 rounded bg-red-500/20 text-red-300">curto</span>}{v.title}</span>
                      <span className="shrink-0 tabular-nums text-gray-400">{fmt(v.views)} views</span>
                      <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" aria-label="Abrir vídeo" className="shrink-0 text-gray-400 hover:text-gray-200"><ExternalLink size={12} /></a>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-gray-500">Lido em {fmtDateTime(c.yt.at)} pela API oficial do YouTube (cota gratuita).</p>
            </>
          )}
        </div>
      )}
      {c.notes && <p className="text-xs text-gray-400 whitespace-pre-wrap border-t border-gray-800 pt-2">{c.notes}</p>}
    </section>
  );
}

function AdsTab({ list, note, onTried }: { list: Competitor[]; note: string; onTried: () => void }) {
  const [busy, setBusy] = useState("");
  async function tryApi(c: Competitor) {
    setBusy(c._id);
    await send("POST", `/api/concorrentes/${c._id}/anuncios`);
    setBusy("");
    onTried();
  }
  return (
    <div className="space-y-3">
      <Notice tone="info">{note}</Notice>
      {!list.length && <p className="text-sm text-gray-400">Cadastre um concorrente na aba Perfis.</p>}
      {list.map((c) => (
        <section key={c._id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2" data-testid="concorrente-anuncios">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-gray-100 flex-1 min-w-0 truncate">{c.name}</h3>
            <a href={c.adLibraryUrl} target="_blank" rel="noreferrer" className={primary + " inline-flex items-center gap-1.5"}>Ver anúncios ativos na Biblioteca <ExternalLink size={14} /></a>
            <button type="button" className={btn} onClick={() => tryApi(c)} disabled={busy === c._id}>{busy === c._id ? "Consultando..." : "Tentar pela API"}</button>
          </div>
          <p className="text-[11px] text-gray-500">Busca no Brasil por {/^\d+$/.test(c.facebookPage) ? `página ${c.facebookPage}` : `“${c.facebookPage || c.name}”`}. Para cair direto na página certa, cadastre o id numérico da página do Facebook do concorrente.</p>
          {c.adLibrary && (
            <div className="text-xs border-t border-gray-800 pt-2 space-y-1">
              <p className={c.adLibrary.error ? "text-amber-200" : "text-gray-300"}>
                {c.adLibrary.error || (c.adLibrary.count ? `A API devolveu ${c.adLibrary.count} anúncio(s).` : "A API não devolveu nenhum anúncio (o esperado para anúncio comercial que rodou só no Brasil).")} <span className="text-gray-500">({fmtDateTime(c.adLibrary.at)})</span>
              </p>
              {c.adLibrary.ads.map((a) => (
                <p key={a.id} className="text-gray-400 truncate">{a.start?.slice(0, 10)} · {a.page} · {a.body || "(sem texto)"} {a.snapshot && <a href={a.snapshot} target="_blank" rel="noreferrer" className="text-sky-300">ver</a>}</p>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function ProductsTab({ project, competitors }: { project: string; competitors: Competitor[] }) {
  const [list, setList] = useState<Product[] | null>(null);
  const empty = { name: "", competitor: "", platform: "", price: "", promise: "", link: "", notes: "" };
  const [f, setF] = useState(empty);
  const [editing, setEditing] = useState<string>("");
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  const load = useCallback(async () => {
    const r = await send<Product[]>("GET", `/api/concorrentes/produtos?project=${project}`);
    if (r.ok) setList(r.data);
  }, [project]);
  useEffect(() => { load(); }, [load]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...f, price: f.price === "" ? null : f.price };
    const r = editing ? await send("PUT", `/api/concorrentes/produtos/${editing}`, body) : await send("POST", "/api/concorrentes/produtos", { ...body, project });
    if (!r.ok) return setErr({ msg: r.error, field: r.field });
    setErr(null);
    setF(empty);
    setEditing("");
    load();
  }
  async function remove(p: Product) {
    if (!window.confirm(`Apagar o produto "${p.name}"?`)) return;
    await send("DELETE", `/api/concorrentes/produtos/${p._id}`);
    load();
  }
  const nameOf = (id: string) => competitors.find((c) => c._id === id)?.name || "";
  const fe = (k: string) => (err?.field === k ? err.msg : undefined);
  return (
    <div className="space-y-3">
      <Card title={editing ? "Editar produto" : "Novo produto de concorrente"} hint="Preenchido à mão (nada é copiado automaticamente de Hotmart ou outra plataforma).">
        <form onSubmit={save} className="space-y-3" data-testid="produto-form">
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Produto" error={fe("name")}><input className={input} value={f.name} onChange={set("name")} placeholder="Ex.: Curso Método X" /></Field>
            <Field label="Concorrente" error={fe("competitor")}>
              <select className={input} value={f.competitor} onChange={set("competitor")}>
                <option value="">(sem vínculo)</option>
                {competitors.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Plataforma" error={fe("platform")}><input className={input} value={f.platform} onChange={set("platform")} placeholder="Hotmart, Kiwify, site..." /></Field>
            <Field label="Preço (R$)" error={fe("price")}><input className={input} value={f.price} onChange={set("price")} inputMode="decimal" placeholder="197,00" /></Field>
            <Field label="Link" error={fe("link")} className="sm:col-span-2"><input className={input} value={f.link} onChange={set("link")} placeholder="https://..." /></Field>
          </div>
          <Field label="Promessa (o que ele vende)"><input className={input} value={f.promise} onChange={set("promise")} placeholder="Ex.: perder 5 kg em 30 dias sem academia" /></Field>
          <Field label="Observações"><textarea className={`${input} min-h-12`} value={f.notes} onChange={set("notes")} /></Field>
          {err && !["name", "competitor", "platform", "price", "link"].includes(err.field || "") && <p className="text-xs text-red-400" role="alert">{err.msg}</p>}
          <div className="flex gap-2 items-center">
            <button type="submit" className={primary}>{editing ? "Salvar" : "Adicionar"}</button>
            {editing && <button type="button" className={linkBtn} onClick={() => { setEditing(""); setF(empty); setErr(null); }}>Cancelar</button>}
          </div>
        </form>
      </Card>
      {list && !list.length && <p className="text-sm text-gray-400">Nenhum produto cadastrado ainda.</p>}
      {list && list.length > 0 && (
        <div className="overflow-x-auto bg-gray-900 border border-gray-800 rounded-xl">
          <table className="w-full text-xs md:text-sm min-w-[720px]" data-testid="produtos-tabela">
            <thead className="text-gray-400 text-left"><tr className="border-b border-gray-800">
              <th className="py-2 px-3 font-medium">Produto</th><th className="py-2 px-2 font-medium">Concorrente</th><th className="py-2 px-2 font-medium">Plataforma</th><th className="py-2 px-2 font-medium text-right">Preço</th><th className="py-2 px-2 font-medium">Promessa</th><th className="py-2 px-2" />
            </tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p._id} className="border-b border-gray-800/60 align-top">
                  <td className="py-2 px-3 text-gray-100">{p.link ? <a href={p.link} target="_blank" rel="noreferrer" className="hover:underline">{p.name}</a> : p.name}{p.notes && <div className="text-[11px] text-gray-500 whitespace-pre-wrap">{p.notes}</div>}</td>
                  <td className="py-2 px-2">{nameOf(p.competitor) || "–"}</td>
                  <td className="py-2 px-2">{p.platform || "–"}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{p.price == null ? "–" : fmtBrl(p.price)}</td>
                  <td className="py-2 px-2 max-w-[260px]">{p.promise || "–"}</td>
                  <td className="py-2 px-2 whitespace-nowrap text-right">
                    <button type="button" className="p-1 text-gray-400 hover:text-gray-200" aria-label="Editar" onClick={() => { setEditing(p._id); setF({ name: p.name, competitor: p.competitor, platform: p.platform, price: p.price == null ? "" : String(p.price).replace(".", ","), promise: p.promise, link: p.link, notes: p.notes }); }}><Pencil size={14} /></button>
                    <button type="button" className="p-1 text-gray-400 hover:text-red-300" aria-label="Apagar" onClick={() => remove(p)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CompetitorsPanel({ projects, selectedProject, onSelectProject }: { projects: ProjectOpt[]; selectedProject: string; onSelectProject: (id: string) => void }) {
  const project = projects.some((p) => p._id === selectedProject) ? selectedProject : projects[0]?._id || "";
  const [tab, setTabState] = useState<Tab>("perfis");
  const [data, setData] = useState<{ competitors: Competitor[]; sources: Sources } | null>(null);
  const [form, setForm] = useState<"" | "new" | string>("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad" | "warn"; text: string } | null>(null);

  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("aba");
    if (TABS.some((t) => t.id === a)) setTabState(a as Tab);
  }, []);
  function setTab(t: Tab) {
    setTabState(t);
    const url = new URL(window.location.href);
    if (t === "perfis") url.searchParams.delete("aba");
    else url.searchParams.set("aba", t);
    window.history.replaceState(null, "", url);
  }
  const load = useCallback(async () => {
    if (!project) return;
    const r = await send<{ competitors: Competitor[]; sources: Sources }>("GET", `/api/concorrentes?project=${project}`);
    if (r.ok) setData(r.data);
    else setMsg({ tone: "bad", text: r.error });
  }, [project]);
  useEffect(() => { setData(null); setForm(""); load(); }, [load]);

  async function refresh(body: Record<string, string>, key: string) {
    setBusy(key);
    setMsg(null);
    const r = await send<{ results: { name: string; messages: string[] }[]; ytUnits: number }>("POST", "/api/concorrentes/atualizar", body);
    setBusy("");
    if (!r.ok) setMsg({ tone: "bad", text: r.error });
    else {
      const issues = r.data!.results.flatMap((x) => x.messages.map((m) => `${x.name}: ${m}`));
      setMsg(issues.length ? { tone: "warn", text: issues.slice(0, 3).join(" | ") } : { tone: "ok", text: `Atualizado (${r.data!.results.length} concorrente(s)).` });
    }
    load();
  }
  async function remove(c: Competitor) {
    if (!window.confirm(`Apagar ${c.name} e o histórico guardado dele?`)) return;
    await send("DELETE", `/api/concorrentes/${c._id}`);
    load();
  }

  if (!projects.length) return <p className="text-sm text-gray-400 py-16 text-center">Crie um projeto primeiro.</p>;
  const list = data?.competitors || [];
  const editing = list.find((c) => c._id === form);
  return (
    <div className="flex-1 overflow-auto p-3 md:p-6" data-testid="concorrentes">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-gray-400 flex items-center gap-2">Projeto
            <select className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-gray-100 max-w-[200px]" value={project} onChange={(e) => onSelectProject(e.target.value)} data-testid="concorrentes-projeto">
              {projects.map((p) => <option key={p._id} value={p._id}>{p.icon} {p.name}</option>)}
            </select>
          </label>
          <nav className="flex gap-1 overflow-x-auto ml-auto max-w-full" aria-label="Áreas de Concorrentes">
            {TABS.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition ${tab === t.id ? "bg-gray-800 text-white font-semibold" : "text-gray-400 hover:bg-gray-800/50"}`} aria-current={tab === t.id ? "page" : undefined} data-testid={`aba-${t.id}`}>
                <t.icon size={15} />{t.label}
              </button>
            ))}
          </nav>
        </div>
        {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}

        {tab === "perfis" && (
          <>
            {data && (!data.sources.instagram || !data.sources.youtube) && (
              <Notice tone="info">
                {!data.sources.instagram && <span className="block">Instagram: {data.sources.instagramNote}</span>}
                {!data.sources.youtube && <span className="block mt-1">YouTube: sem chave cadastrada (Configurações › APIs, serviço youtube).</span>}
              </Notice>
            )}
            <div className="flex flex-wrap gap-2">
              {form !== "new" && <button type="button" className={primary + " inline-flex items-center gap-1.5"} onClick={() => setForm("new")} data-testid="concorrente-novo"><Plus size={15} /> Adicionar concorrente</button>}
              {list.length > 1 && <button type="button" className={btn} onClick={() => refresh({ project }, "all")} disabled={Boolean(busy)}><RefreshCw size={14} className={busy === "all" ? "animate-spin" : ""} /> Atualizar todos</button>}
            </div>
            {form === "new" && <CompetitorForm project={project} onCancel={() => setForm("")} onDone={() => { setForm(""); load(); }} />}
            {editing && <CompetitorForm key={editing._id} project={project} initial={editing} onCancel={() => setForm("")} onDone={() => { setForm(""); load(); }} />}
            {data && !list.length && form !== "new" && <p className="text-sm text-gray-400">Nenhum concorrente cadastrado neste projeto. Cadastre o @ do Instagram e o canal do YouTube de quem disputa o mesmo público.</p>}
            <div className="grid gap-3">
              {list.map((c) => <ProfileCard key={c._id} c={c} busy={busy === c._id || busy === "all"} onRefresh={() => refresh({ competitor: c._id }, c._id)} onEdit={() => setForm(c._id)} onDelete={() => remove(c)} />)}
            </div>
          </>
        )}
        {tab === "anuncios" && data && <AdsTab list={list} note={data.sources.adLibraryNote} onTried={load} />}
        {tab === "produtos" && <ProductsTab key={project} project={project} competitors={list} />}
      </div>
    </div>
  );
}
