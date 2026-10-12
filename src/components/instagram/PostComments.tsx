"use client";
/* eslint-disable react-hooks/set-state-in-effect -- carrega o post ao abrir */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, CornerDownRight, ExternalLink, Heart, MessageCircle, RefreshCw, Search, X } from "lucide-react";
import { send } from "@/components/http";
import { fmt, fmtDateTime, fmtDay, readLocal, writeLocal } from "./shared";

export interface Cls { category: string; sentiment: "positivo" | "neutro" | "negativo"; isQuestion: boolean; provider: string }
export interface CommentT {
  _id: string;
  igId: string;
  parentIgId: string | null;
  username: string;
  text: string;
  timestamp: string;
  likeCount: number;
  hidden: boolean;
  own: boolean;
  answered: boolean;
  answeredAt: string | null;
  sentByName: string;
  cls: Cls;
}
export interface StudyT {
  total: number;
  topLevel: number;
  ownReplies: number;
  people: number;
  byCategory: { key: string; label: string; count: number; pct: number }[];
  sentiment: { positivo: number; neutro: number; negativo: number };
  questions: { theme: string; label: string; count: number; examples: string[]; unanswered: number }[];
  terms: { term: string; count: number }[];
  commenters: { username: string; count: number }[];
  unanswered: { total: number; important: number; oldest: string | null };
  response: { answered: number; rate: number | null; avgMinutes: number | null; medianMinutes: number | null };
  hours: { hour: number; count: number }[];
  weekdays: { day: number; label: string; count: number }[];
  bestHours: number[];
  ideas: string[];
  simple: boolean;
}
export interface GapT { show: boolean; message: string; reported: number; fetched: number; pendingMedia: number; checkedMedia: number; lastSyncAt: string | null; error: string }
interface Payload {
  media: {
    igId: string; kind: string; caption: string; title: string; permalink: string; thumbnailUrl: string; timestamp: string; reported: number; synced: boolean; syncedAt: string | null; syncError: string;
    metrics: { reach?: number; views?: number; likes?: number; comments?: number; saved?: number; shares?: number };
  } | null;
  reason?: string;
  account: { _id: string; username: string };
  gap: GapT;
  comments: CommentT[];
  study: StudyT;
  report: string;
  labels: Record<string, string>;
  reply: { on: boolean; message: string };
  demo: boolean;
}

export const CAT_CLS: Record<string, string> = {
  elogio: "bg-green-500/15 text-green-300",
  duvida: "bg-sky-500/15 text-sky-300",
  preco: "bg-yellow-500/15 text-yellow-300",
  intencao: "bg-emerald-500/20 text-emerald-200",
  objecao: "bg-orange-500/15 text-orange-300",
  reclamacao: "bg-red-500/15 text-red-300",
  marcacao: "bg-purple-500/15 text-purple-300",
  spam: "bg-gray-700 text-gray-400",
  outro: "bg-gray-800 text-gray-400",
};

export function fmtWait(minutes: number | null | undefined): string {
  if (minutes == null) return "–";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}`;
  return `${Math.round(minutes / 1440)} dias`;
}

/** Selo honesto: a classificação por palavras-chave não é exata. */
export function SimpleBadge({ simple }: { simple: boolean }) {
  return (
    <span
      className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border border-gray-700 text-gray-400 whitespace-nowrap"
      title={simple ? "Feita por palavras-chave, sem inteligência artificial. Acerta o óbvio (preço, elogio, marcação) e erra ironia e contexto. Use para ter direção, não como número exato." : "Feita por inteligência artificial. Pode errar em ironia e contexto."}
      data-testid="com-simple"
    >
      {simple ? "Classificação automática simples" : "Classificação por IA"}
    </span>
  );
}

/** Aviso de comentários não liberados pela Meta. Fecha no X e volta quando os números mudam. */
export function GapNotice({ gap, id }: { gap: GapT; id: string }) {
  const key = `com-aviso:${id}:${gap.reported}:${gap.fetched}`;
  const [closed, setClosed] = useState(false);
  useEffect(() => setClosed(readLocal(key) === "1"), [key]);
  if (!gap.show || closed) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm border border-yellow-500/40 bg-yellow-500/10 text-yellow-100" role="status" data-testid="com-gap">
      <div className="flex-1">
        {gap.message}
        {gap.fetched > 0 && <span className="block text-xs text-yellow-200/70 mt-1">Diferenças pequenas também acontecem com comentários ocultos pelo Instagram, de contas restritas ou apagados há pouco.</span>}
      </div>
      <button type="button" aria-label="Fechar aviso" onClick={() => { writeLocal(key, "1"); setClosed(true); }} className="p-0.5 rounded hover:bg-yellow-500/20 text-yellow-200">
        <X size={14} />
      </button>
    </div>
  );
}

type Filter = "" | "sem-resposta" | "perguntas" | `cat:${string}`;

function Thumb({ url, size }: { url: string; size: number }) {
  const [broken, setBroken] = useState(false);
  return url && !broken ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" onError={() => setBroken(true)} className="rounded-lg object-cover shrink-0 bg-gray-800" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-lg bg-gray-800 shrink-0 inline-block" style={{ width: size, height: size }} aria-hidden />
  );
}

function ReplyForm({ comment, onSent, onCancel }: { comment: CommentT; onSent: () => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    const r = await send("POST", `/api/instagram/comments/${comment._id}/reply`, { message: text, confirm: true });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onSent();
  }
  return (
    <div className="mt-2 space-y-2" data-testid="com-reply-form">
      <textarea value={text} onChange={(e) => { setText(e.target.value); setConfirming(false); }} rows={2} maxLength={1000} placeholder={`Responder @${comment.username} em público`} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base md:text-sm text-gray-100 outline-none focus:border-brand-500" />
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
          <span className="w-full sm:w-auto sm:mr-auto">Essa resposta é pública e aparece no Instagram na hora.</span>
          <button type="button" disabled={busy} onClick={submit} className="bg-brand-500 text-brand-ink font-bold px-3 py-1.5 rounded-lg disabled:opacity-50">{busy ? "Enviando..." : "Confirmar e enviar"}</button>
          <button type="button" onClick={() => setConfirming(false)} className="text-gray-400 hover:underline">Voltar</button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button type="button" disabled={!text.trim()} onClick={() => setConfirming(true)} className="bg-brand-500 text-brand-ink font-bold px-3 py-1.5 rounded-lg text-xs disabled:opacity-50">Responder em público</button>
          <button type="button" onClick={onCancel} className="text-xs text-gray-400 hover:underline">Cancelar</button>
        </div>
      )}
    </div>
  );
}

function setUrlParam(key: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  window.history.replaceState(null, "", url);
}

// Painel do post: a mídia, as métricas e os comentários em ordem cronológica, com as respostas
// aninhadas. Busca e filtros à vista; o filtro fica no link.
export default function PostComments({ mediaIgId, postId, onClose }: { mediaIgId?: string; postId?: string; onClose: () => void }) {
  const [d, setD] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "wait" | "bad"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("");
  const [replyTo, setReplyTo] = useState("");
  const [copied, setCopied] = useState(false);
  const [showCaption, setShowCaption] = useState(false);

  const load = useCallback(async () => {
    const r = await send<Payload>("GET", `/api/instagram/comments?${postId ? `post=${postId}` : `media=${mediaIgId}`}`);
    if (!r.ok || !r.data) return setError(r.error);
    setD(r.data);
  }, [mediaIgId, postId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("cfiltro") as Filter | null;
    if (f) setFilter(f);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // No celular os filtros rolam de lado: o que está ligado tem de ficar à vista.
  useEffect(() => {
    document.querySelector('[data-testid="com-filters"] [aria-pressed="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [filter, d]);

  function pick(f: Filter) {
    const next = filter === f ? "" : f;
    setFilter(next);
    setUrlParam("cfiltro", next || null);
  }

  async function fetchNow() {
    if (!d?.media) return;
    setBusy(true);
    setMsg({ tone: "wait", text: "Buscando os comentários no Instagram..." });
    const r = await send<{ ok: boolean; reported: number; fetched: number; added: number; error?: string; stopped: string }>("POST", "/api/instagram/comments/sync", { account: d.account._id, media: d.media.igId });
    setBusy(false);
    if (r.ok && r.data?.ok) setMsg({ tone: "ok", text: `Pronto: ${fmt(r.data.fetched)} ${r.data.fetched === 1 ? "comentário" : "comentários"}${r.data.added ? `, ${fmt(r.data.added)} ${r.data.added === 1 ? "novo" : "novos"}` : ""}.${r.data.stopped ? ` Parou antes do fim: ${r.data.stopped}.` : ""}` });
    else setMsg({ tone: "bad", text: r.data?.error || r.error || "Não foi possível buscar os comentários." });
    await load();
  }

  const media = d?.media;
  const threads = useMemo(() => {
    const all = d?.comments || [];
    const tops = all.filter((c) => !c.parentIgId);
    const byParent = new Map<string, CommentT[]>();
    for (const c of all) if (c.parentIgId) byParent.set(c.parentIgId, [...(byParent.get(c.parentIgId) || []), c]);
    // resposta cujo comentário pai não veio: aparece solta, para não sumir
    const orphans = all.filter((c) => c.parentIgId && !tops.some((t) => t.igId === c.parentIgId));
    return [...tops.map((top) => ({ top, replies: byParent.get(top.igId) || [] })), ...orphans.map((top) => ({ top, replies: [] as CommentT[] }))];
  }, [d]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { "sem-resposta": 0, perguntas: 0 };
    for (const { top } of threads) {
      if (top.own) continue;
      if (!top.answered && top.cls.category !== "spam") c["sem-resposta"]++;
      if (top.cls.isQuestion) c.perguntas++;
      c[`cat:${top.cls.category}`] = (c[`cat:${top.cls.category}`] || 0) + 1;
    }
    return c;
  }, [threads]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^@/, "");
    return threads.filter(({ top, replies }) => {
      if (filter === "sem-resposta" && (top.own || top.answered || top.cls.category === "spam")) return false;
      if (filter === "perguntas" && (top.own || !top.cls.isQuestion)) return false;
      if (filter.startsWith("cat:") && (top.own || top.cls.category !== filter.slice(4))) return false;
      if (!q) return true;
      return [top, ...replies].some((c) => c.text.toLowerCase().includes(q) || c.username.toLowerCase().includes(q));
    });
  }, [threads, filter, search]);

  const chip = (active: boolean) =>
    `shrink-0 text-xs px-3 py-1.5 rounded-full border transition whitespace-nowrap ${active ? "border-brand-500 text-brand-400 bg-brand-500/10 font-semibold" : "border-gray-700 text-gray-300 hover:border-gray-500"}`;
  const title = media ? media.title || media.caption.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#")) || "(sem legenda)" : "Post";
  const labels = d?.labels || {};
  const cats = Object.keys(labels).filter((k) => counts[`cat:${k}`] || filter === `cat:${k}`);

  const row = (c: CommentT, nested: boolean) => (
    <div key={c._id} className={nested ? "pl-3 border-l-2 border-gray-800 ml-1" : ""} data-testid={nested ? "com-reply" : "com-item"}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        {nested && <CornerDownRight size={12} className="text-gray-600" />}
        <span className={`font-semibold ${c.own ? "text-brand-400" : "text-gray-100"}`}>@{c.username || "sem nome"}</span>
        {c.own && <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-300">{c.sentByName ? `resposta da conta · enviada por ${c.sentByName}` : "resposta da conta"}</span>}
        <span className="text-gray-500">{fmtDateTime(c.timestamp)}</span>
        {!c.own && <span className={`text-[10px] px-1.5 py-0.5 rounded ${CAT_CLS[c.cls.category] || CAT_CLS.outro}`}>{labels[c.cls.category] || c.cls.category}</span>}
        {c.hidden && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">oculto no Instagram</span>}
        {c.likeCount > 0 && <span className="text-gray-500 inline-flex items-center gap-0.5"><Heart size={10} /> {fmt(c.likeCount)}</span>}
        {!nested && !c.own && c.cls.category !== "spam" && (
          <span className={`ml-auto text-[11px] ${c.answered ? "text-green-400" : "text-gray-400"}`}>{c.answered ? "respondido" : "sem resposta"}</span>
        )}
      </div>
      <p className="text-sm text-gray-200 whitespace-pre-wrap break-words mt-0.5">{c.text || <span className="text-gray-500">(sem texto)</span>}</p>
      {!nested && !c.own && d?.reply.on && !c.hidden && (
        replyTo === c._id ? (
          <ReplyForm comment={c} onCancel={() => setReplyTo("")} onSent={() => { setReplyTo(""); setMsg({ tone: "ok", text: "Resposta enviada." }); load(); }} />
        ) : (
          <button type="button" onClick={() => setReplyTo(c._id)} className="text-xs text-brand-400 hover:underline mt-1" data-testid="com-reply-open">Responder</button>
        )
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-[60] sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full max-w-5xl h-[94dvh] sm:h-auto sm:max-h-[92dvh] flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Comentários do post" data-testid="post-comments">
        <div className="flex items-center gap-3 p-3 md:p-4 border-b border-gray-800 shrink-0">
          {media && <Thumb url={media.thumbnailUrl} size={44} />}
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-white truncate" title={title}>{title}</h3>
            <p className="text-xs text-gray-400 truncate">
              {media ? <>@{d?.account.username} · publicado em {fmtDay(media.timestamp, true)}</> : "Comentários"}
            </p>
          </div>
          {media?.permalink && (
            <a href={media.permalink} target="_blank" rel="noreferrer" className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-800 inline-flex items-center gap-1 whitespace-nowrap" data-testid="com-open-ig">
              <ExternalLink size={13} /> <span className="hidden sm:inline">Abrir no Instagram</span><span className="sm:hidden">Instagram</span>
            </a>
          )}
          <button type="button" onClick={onClose} aria-label="Fechar" className="p-1.5 rounded hover:bg-gray-800 text-gray-400"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {error && <p className="p-4 text-sm text-red-400" role="alert">{error}</p>}
          {!d && !error && <p className="p-10 text-sm text-gray-400 text-center">Carregando...</p>}
          {d && !media && <p className="p-10 text-sm text-gray-400 text-center" data-testid="com-not-found">{d.reason}</p>}

          {d && media && (
            <div className="md:grid md:grid-cols-[17rem_1fr]">
              {/* Coluna do post: métricas e resumo. No celular fica em cima, compacta. */}
              <aside className="p-3 md:p-4 md:border-r border-b md:border-b-0 border-gray-800 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center" data-testid="com-metrics">
                  {([["Alcance", media.metrics.reach], ["Views", media.metrics.views], ["Curtidas", media.metrics.likes], ["Coment.", media.metrics.comments], ["Salvos", media.metrics.saved], ["Compart.", media.metrics.shares]] as [string, number | undefined][]).map(([label, v]) => (
                    <div key={label} className="bg-gray-800/60 rounded-lg py-1.5">
                      <div className="text-sm font-bold text-white tabular-nums">{fmt(v)}</div>
                      <div className="text-[10px] text-gray-400">{label}</div>
                    </div>
                  ))}
                </div>
                {media.caption && (
                  <div className="text-xs text-gray-400">
                    <p className={`break-words ${showCaption ? "whitespace-pre-wrap" : "line-clamp-2"}`}>{showCaption ? media.caption : media.caption.replace(/\s+/g, " ")}</p>
                    {media.caption.length > 90 && <button type="button" onClick={() => setShowCaption(!showCaption)} className="text-brand-400 hover:underline mt-0.5">{showCaption ? "Ver menos" : "Ver a legenda toda"}</button>}
                  </div>
                )}
                {d.study.total > 0 && (
                  <div className="space-y-2 hidden md:block" data-testid="com-summary">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold text-gray-300">Resumo dos comentários</h4>
                    </div>
                    <div className="text-xs text-gray-300 space-y-1">
                      <div className="flex justify-between"><span className="text-gray-400">Sem resposta</span><span className="tabular-nums font-semibold">{fmt(d.study.unanswered.total)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Respondidos</span><span className="tabular-nums">{fmt(d.study.response.answered)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Tempo médio de resposta</span><span className="tabular-nums">{fmtWait(d.study.response.avgMinutes)}</span></div>
                    </div>
                    <div className="space-y-1">
                      {d.study.byCategory.map((c) => (
                        <button key={c.key} type="button" onClick={() => pick(`cat:${c.key}`)} className="w-full text-left group" title={`Filtrar: ${c.label}`}>
                          <div className="flex justify-between text-[11px] text-gray-300"><span className="group-hover:text-white">{c.label}</span><span className="tabular-nums text-gray-400">{c.count}</span></div>
                          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden"><div className="h-full bg-brand-500/70 rounded-full" style={{ width: `${Math.max(3, c.pct)}%` }} /></div>
                        </button>
                      ))}
                    </div>
                    <SimpleBadge simple={d.study.simple} />
                  </div>
                )}
              </aside>

              <section className="p-3 md:p-4 space-y-3 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-gray-200 mr-auto inline-flex items-center gap-1.5">
                    <MessageCircle size={15} /> {fmt(d.comments.length)} {d.comments.length === 1 ? "comentário guardado" : "comentários guardados"}
                  </h4>
                  {d.study.total > 0 && (
                    <button type="button" onClick={() => { navigator.clipboard?.writeText(d.report); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-800 inline-flex items-center gap-1" data-testid="com-copy">
                      {copied ? <><Check size={12} className="text-green-400" /> Copiado</> : <><Copy size={12} /> Copiar relatório</>}
                    </button>
                  )}
                  <button type="button" onClick={fetchNow} disabled={busy} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60 ${media.synced ? "border border-gray-600 text-gray-200 hover:bg-gray-800" : "bg-brand-500 text-brand-ink hover:bg-brand-400"}`} data-testid="com-fetch">
                    <RefreshCw size={13} className={busy ? "animate-spin" : ""} /> {busy ? "Buscando..." : media.synced ? "Buscar de novo" : "Buscar comentários"}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 -mt-2" data-testid="com-counts">O Instagram informa {fmt(media.reported)} {media.reported === 1 ? "comentário" : "comentários"} neste post · {media.syncedAt ? `última busca ${fmtDateTime(media.syncedAt)}` : "ainda não buscados"}</p>
                {msg && <p role="status" className={`text-xs ${msg.tone === "ok" ? "text-green-400" : msg.tone === "bad" ? "text-red-400" : "text-gray-400"}`} data-testid="com-msg">{msg.text}</p>}
                {media.syncError && !msg && <p className="text-xs text-red-400" role="alert">A última busca falhou: {media.syncError}</p>}
                {d.demo && <div className="rounded-lg px-3 py-2 text-xs border border-yellow-500/40 bg-yellow-500/10 text-yellow-300">Comentários de exemplo (modo demonstração).</div>}
                <GapNotice gap={d.gap} id={media.igId} />

                {threads.length > 0 && (
                  <>
                    <label className="relative block">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por texto ou @" aria-label="Buscar nos comentários" className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-8 py-2 text-base md:text-sm text-gray-100 outline-none focus:border-brand-500" data-testid="com-search" />
                      {search && <button type="button" aria-label="Limpar busca" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 p-1"><X size={14} /></button>}
                    </label>
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 md:mx-0 md:px-0 md:flex-wrap" data-testid="com-filters">
                      <button type="button" aria-pressed={!filter} className={chip(!filter)} onClick={() => pick("")}>Todos ({threads.length})</button>
                      <button type="button" aria-pressed={filter === "sem-resposta"} className={chip(filter === "sem-resposta")} onClick={() => pick("sem-resposta")}>Sem resposta ({counts["sem-resposta"]}){filter === "sem-resposta" && <X size={12} className="inline ml-1 -mt-0.5" />}</button>
                      <button type="button" aria-pressed={filter === "perguntas"} className={chip(filter === "perguntas")} onClick={() => pick("perguntas")}>Perguntas ({counts.perguntas}){filter === "perguntas" && <X size={12} className="inline ml-1 -mt-0.5" />}</button>
                      {cats.map((k) => (
                        <button key={k} type="button" aria-pressed={filter === `cat:${k}`} className={chip(filter === `cat:${k}`)} onClick={() => pick(`cat:${k}`)}>
                          {labels[k]} ({counts[`cat:${k}`] || 0}){filter === `cat:${k}` && <X size={12} className="inline ml-1 -mt-0.5" />}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-gray-500 md:hidden"><SimpleBadge simple={d.study.simple} /></div>
                  </>
                )}

                {threads.length === 0 ? (
                  <div className="text-center py-10 px-4 border border-gray-800 rounded-xl" data-testid="com-empty">
                    <p className="text-sm text-gray-300 font-semibold">
                      {!media.synced ? "Comentários ainda não buscados" : media.reported > 0 ? "O Instagram não liberou nenhum comentário deste post" : "Este post não tem comentários"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {!media.synced ? "Clique em Buscar comentários para trazer do Instagram." : media.reported > 0 ? "Veja o aviso acima. Para ler agora, abra o post no Instagram." : "Quando alguém comentar, aparece aqui na próxima sincronização."}
                    </p>
                  </div>
                ) : shown.length === 0 ? (
                  <p className="text-sm text-gray-400 py-8 text-center">Nenhum comentário com esse filtro. <button type="button" className="text-brand-400 hover:underline" onClick={() => { setSearch(""); setFilter(""); setUrlParam("cfiltro", null); }}>Limpar</button></p>
                ) : (
                  <ul className="space-y-3" data-testid="com-list">
                    {shown.map(({ top, replies }) => (
                      <li key={top._id} className="rounded-xl border border-gray-800 p-3 space-y-2">
                        {row(top, false)}
                        {replies.map((r) => row(r, true))}
                      </li>
                    ))}
                  </ul>
                )}
                {threads.length > 0 && !d.reply.on && <p className="text-[11px] text-gray-500" data-testid="com-reply-off">{d.reply.message}</p>}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
