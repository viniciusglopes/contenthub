"use client";
/* eslint-disable react-hooks/set-state-in-effect -- carga inicial e lista escolhida no link */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, BookOpen, ClipboardList, ExternalLink, FileText, Heart, History, HelpCircle, Minus, Pencil, Plus, RefreshCw, Search, Settings2, Trash2, X } from "lucide-react";
import { send } from "@/components/http";
import { fmt, fmtDateTime } from "@/components/instagram/shared";
import { Card, Field, Notice, linkBtn } from "@/components/studio/shared";

// CONCORRENTES › OFERTAS: páginas anunciantes com a contagem diária de anúncios ativos (API oficial
// da Biblioteca de Anúncios ou contagem manual), selo de temperatura, filtros, favoritos e histórico.

interface Stats {
  count: number | null; date: string | null; source: "api" | "manual" | null; complete: boolean;
  delta1: number | null; delta1Pct: number | null; delta7: number | null; delta7Pct: number | null; base7Date: string | null;
  mixedSources: boolean; spark: (number | null)[]; sparkFrom: string | null;
}
interface Offer {
  _id: string; kind: "org" | "casa"; name: string; pageId: string; offerUrl: string;
  tags: { structure: string; niche: string; product: string; language: string; countries: string[] };
  counting: "api" | "manual"; notes: string; active: boolean; libraryUrl: string; stats: Stats;
  heat: { id: string; label: string; tone: string }; lastError: string; lastAt: string | null; lastCountries: string[];
  favorite: boolean; isNew: boolean; createdAt: string;
}
interface Rule { id: string; label: string; tone: string; text: string; minCount?: number; minDelta7Pct?: number; maxDelta7Pct?: number }
interface Labels { structure: Record<string, string>; niche: Record<string, string>; language: Record<string, string> }
interface OrgData { offers: Offer[]; rules: Rule[]; countries: string[]; token: "conta" | "casa" | null; module: boolean; canAdmin: boolean; note: string; labels: Labels }
interface HouseData { offers: Offer[]; newToday: number; canAdmin: boolean }
interface HistoryData { _id: string; name: string; from: string; to: string; stats: Stats; rows: { date: string; count: number; source: string; complete: boolean; countries: string[]; calls: number; at: string; byName: string; note: string }[] }

const input = "block w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 mt-1";
const select = "bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-gray-100";
const primary = "bg-brand-500 text-brand-ink px-4 py-2 rounded-lg font-semibold text-sm hover:bg-brand-400 transition disabled:opacity-60";
const btn = "shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-gray-700 text-gray-200 hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap";
const small = "inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-gray-700 text-gray-200 hover:bg-gray-800 whitespace-nowrap";
const TONE: Record<string, { chip: string; bar: string; fill: number }> = {
  red: { chip: "bg-red-500/15 text-red-300 border-red-500/30", bar: "bg-red-400", fill: 100 },
  orange: { chip: "bg-orange-500/15 text-orange-300 border-orange-500/30", bar: "bg-orange-400", fill: 70 },
  green: { chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", bar: "bg-emerald-400", fill: 55 },
  blue: { chip: "bg-sky-500/15 text-sky-300 border-sky-500/30", bar: "bg-sky-400", fill: 25 },
  gray: { chip: "bg-gray-700/40 text-gray-300 border-gray-600", bar: "bg-gray-500", fill: 40 },
};
const SORTS = [
  { id: "anuncios", label: "Mais anúncios" },
  { id: "alta", label: "Maior alta (7 dias)" },
  { id: "recentes", label: "Mais recentes" },
  { id: "nome", label: "Nome" },
] as const;
type Sort = (typeof SORTS)[number]["id"];
type Lista = "minhas" | "casa" | "favoritas";
const day = (k?: string | null) => (k ? k.split("-").reverse().slice(0, 2).join("/") : "");
const signed = (n: number) => `${n > 0 ? "+" : ""}${fmt(n)}`;
const pct = (n: number | null) => (n == null ? "" : `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

function Help({ onHelp, label = "Ajuda sobre Ofertas" }: { onHelp?: (id: string) => void; label?: string }) {
  if (!onHelp) return null;
  return <button type="button" onClick={() => onHelp("ofertas")} className="text-gray-500 hover:text-gray-200" aria-label={label} title={label}><HelpCircle size={15} /></button>;
}

function Sparkline({ values, tone = "gray", h = 36, w = 160 }: { values: (number | null)[]; tone?: string; h?: number; w?: number }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v != null) as { v: number; i: number }[];
  if (pts.length < 2) return <div className="text-[11px] text-gray-500 h-9 flex items-center">curva aparece com 2 contagens</div>;
  const max = Math.max(...pts.map((p) => p.v));
  const min = Math.min(...pts.map((p) => p.v));
  const span = max - min || 1;
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * (w - 4) + 2;
  const y = (v: number) => h - 3 - ((v - min) / span) * (h - 6);
  const d = pts.map((p, n) => `${n ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const stroke = { red: "#f87171", orange: "#fb923c", green: "#34d399", blue: "#38bdf8", gray: "#9ca3af" }[tone] || "#9ca3af";
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }} role="img" aria-label={`Curva de anúncios ativos: de ${fmt(pts[0].v)} a ${fmt(last.v)}`}>
      <path d={`${d} L${x(last.i).toFixed(1)},${h} L${x(pts[0].i).toFixed(1)},${h} Z`} fill={stroke} opacity={0.12} />
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r={2.6} fill={stroke} />
    </svg>
  );
}

function Delta({ value, pctValue, label }: { value: number | null; pctValue: number | null; label: string }) {
  if (value == null) return <span className="text-[11px] text-gray-500">{label}: sem comparação</span>;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  const color = value > 0 ? "text-emerald-300" : value < 0 ? "text-red-300" : "text-gray-400";
  return <span className={`inline-flex items-center gap-0.5 text-xs tabular-nums ${color}`}><Icon size={13} />{signed(value)} <span className="text-gray-500">({pct(pctValue)}) {label}</span></span>;
}

function HeatBadge({ heat }: { heat: Offer["heat"] }) {
  const t = TONE[heat.tone] || TONE.gray;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${t.chip}`} data-testid="selo">
      {heat.label}
      <span className="w-8 h-1 rounded-full bg-gray-700 overflow-hidden" aria-hidden><span className={`block h-full ${t.bar}`} style={{ width: `${t.fill}%` }} /></span>
    </span>
  );
}

function Tags({ o, labels }: { o: Offer; labels: Labels }) {
  const chips = [labels.structure[o.tags.structure], labels.niche[o.tags.niche], o.tags.product, labels.language[o.tags.language], ...o.tags.countries].filter(Boolean);
  if (!chips.length) return null;
  return <div className="flex flex-wrap gap-1">{chips.map((c, i) => <span key={`${c}-${i}`} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">{c}</span>)}</div>;
}

function OfferCard({ o, labels, onFav, onHistory, onEdit, onDelete, onCount, canEdit }: { o: Offer; labels: Labels; onFav: () => void; onHistory: () => void; onEdit?: () => void; onDelete?: () => void; onCount?: () => void; canEdit: boolean }) {
  const s = o.stats;
  return (
    <article className={`bg-gray-900 border rounded-xl p-4 flex flex-col gap-3 min-w-0 ${o.active ? "border-gray-800" : "border-dashed border-gray-700 opacity-70"}`} data-testid="oferta-card">
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-semibold text-gray-100 truncate max-w-full">{o.name}</h3>
            {o.isNew && <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 font-semibold">nova hoje</span>}
            {!o.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">arquivada</span>}
          </div>
          <Tags o={o} labels={labels} />
        </div>
        <button type="button" onClick={onFav} className={`p-1.5 rounded-lg ${o.favorite ? "text-pink-400" : "text-gray-500 hover:text-gray-200"}`} aria-pressed={o.favorite} aria-label={o.favorite ? "Tirar dos favoritos" : "Favoritar"} data-testid="oferta-favorito">
          <Heart size={17} fill={o.favorite ? "currentColor" : "none"} />
        </button>
      </header>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-3xl font-bold text-white tabular-nums leading-none">{s.count == null ? "–" : `${s.complete ? "" : "≥ "}${fmt(s.count)}`}</div>
          <div className="text-[11px] text-gray-400 mt-1">anúncios ativos{s.date ? ` em ${day(s.date)}` : ""}</div>
        </div>
        <HeatBadge heat={o.heat} />
      </div>
      <div className="flex flex-col gap-0.5">
        <Delta value={s.delta1} pctValue={s.delta1Pct} label="vs ontem" />
        <Delta value={s.delta7} pctValue={s.delta7Pct} label="em 7 dias" />
      </div>
      <Sparkline values={s.spark} tone={o.heat.tone} />
      <p className="text-[11px] text-gray-500 leading-snug">
        {s.source === "manual" ? <span className="text-amber-200 font-semibold">contagem manual</span> : s.source === "api" ? "API da Biblioteca (países da UE)" : o.counting === "manual" ? <span className="text-amber-200">contagem manual: ainda sem número</span> : "aguardando a 1ª contagem pela API"}
        {s.mixedSources && " · comparação mistura API e manual"}
        {!s.complete && " · paginação parou no teto: pelo menos esse número"}
      </p>
      {o.lastError && <p className="text-[11px] text-amber-200 leading-snug">{o.lastError}</p>}

      <div className="grid grid-cols-3 gap-1.5 mt-auto">
        {o.offerUrl ? <a href={o.offerUrl} target="_blank" rel="noreferrer noopener" className={small}>Oferta <ExternalLink size={12} /></a> : <span className={`${small} opacity-40 cursor-not-allowed`} title="Sem link da oferta">Oferta</span>}
        <a href={o.libraryUrl} target="_blank" rel="noreferrer noopener" className={small} title="Abre a busca pública da Biblioteca de Anúncios da Meta">Biblioteca <BookOpen size={12} /></a>
        <button type="button" className={small} onClick={onHistory} data-testid="oferta-historico">Histórico <History size={12} /></button>
      </div>
      {canEdit && (
        <div className="flex items-center gap-1 border-t border-gray-800 pt-2 -mb-1">
          {onCount && <button type="button" className={linkBtn} onClick={onCount} data-testid="oferta-contar-manual">Registrar contagem</button>}
          <span className="flex-1" />
          {onEdit && <button type="button" className="p-1.5 text-gray-400 hover:text-gray-200" onClick={onEdit} aria-label="Editar"><Pencil size={14} /></button>}
          {onDelete && <button type="button" className="p-1.5 text-gray-400 hover:text-red-300" onClick={onDelete} aria-label={o.kind === "casa" ? "Arquivar" : "Apagar"}><Trash2 size={14} /></button>}
        </div>
      )}
    </article>
  );
}

const EMPTY = { name: "", pageId: "", offerUrl: "", counting: "api", notes: "", structure: "", niche: "", product: "", language: "", countries: "" };
function OfferForm({ initial, labels, endpoint, onDone, onCancel, title }: { initial?: Offer; labels: Labels; endpoint: string; onDone: () => void; onCancel: () => void; title: string }) {
  const [f, setF] = useState(initial ? { name: initial.name, pageId: initial.pageId, offerUrl: initial.offerUrl, counting: initial.counting, notes: initial.notes, structure: initial.tags.structure, niche: initial.tags.niche, product: initial.tags.product, language: initial.tags.language, countries: initial.tags.countries.join(", ") } : EMPTY);
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = { name: f.name, pageId: f.pageId, offerUrl: f.offerUrl, counting: f.counting, notes: f.notes, tags: { structure: f.structure, niche: f.niche, product: f.product, language: f.language, countries: f.countries } };
    const r = initial ? await send("PUT", `${endpoint}/${initial._id}`, body) : await send("POST", endpoint, body);
    setBusy(false);
    if (!r.ok) return setErr({ msg: r.error, field: r.field });
    onDone();
  }
  const fe = (k: string) => (err?.field === k ? err.msg : undefined);
  const opts = (m: Record<string, string>) => [<option key="" value="">(não definido)</option>, ...Object.entries(m).map(([k, v]) => <option key={k} value={k}>{v}</option>)];
  return (
    <Card title={title}>
      <form onSubmit={submit} className="space-y-3" data-testid="oferta-form">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Nome da página ou oferta" error={fe("name")}><input className={input} value={f.name} onChange={set("name")} placeholder="Ex.: Chá Seca Barriga" /></Field>
          <Field label="Como contar" error={fe("counting")}>
            <select className={input} value={f.counting} onChange={set("counting")}>
              <option value="api">Pela API da Biblioteca (todo dia, países da UE)</option>
              <option value="manual">Contagem manual (oferta só no Brasil)</option>
            </select>
          </Field>
          <Field label="Id da página do Facebook" hint={f.counting === "api" ? "obrigatório para contar pela API" : "opcional; deixa o botão Biblioteca cair na página certa"} error={fe("pageId")}><input className={input} value={f.pageId} onChange={set("pageId")} placeholder="102938475610293 ou link da Biblioteca" inputMode="numeric" /></Field>
          <Field label="Link da oferta" hint="site, VSL ou quiz" error={fe("offerUrl")}><input className={input} value={f.offerUrl} onChange={set("offerUrl")} placeholder="https://..." autoCapitalize="none" /></Field>
          <Field label="Tipo de página" error={fe("structure")}><select className={input} value={f.structure} onChange={set("structure")}>{opts(labels.structure)}</select></Field>
          <Field label="Nicho" error={fe("niche")}><select className={input} value={f.niche} onChange={set("niche")}>{opts(labels.niche)}</select></Field>
          <Field label="Produto" error={fe("product")}><input className={input} value={f.product} onChange={set("product")} placeholder="Ex.: chá, curso de inglês" /></Field>
          <Field label="Língua" error={fe("language")}><select className={input} value={f.language} onChange={set("language")}>{opts(labels.language)}</select></Field>
          <Field label="Países" hint="códigos de 2 letras" error={fe("countries")} className="sm:col-span-2"><input className={input} value={f.countries} onChange={set("countries")} placeholder="BR, PT, MX" autoCapitalize="characters" /></Field>
        </div>
        <Field label="Observações"><textarea className={`${input} min-h-14`} value={f.notes} onChange={set("notes")} placeholder="Ângulo, gancho, oferta de entrada..." /></Field>
        {err && !["name", "counting", "pageId", "offerUrl", "structure", "niche", "product", "language", "countries"].includes(err.field || "") && <p className="text-xs text-red-400" role="alert">{err.msg}</p>}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={busy} className={primary}>{busy ? "Salvando..." : "Salvar"}</button>
          <button type="button" className={linkBtn} onClick={onCancel}>Cancelar</button>
        </div>
      </form>
    </Card>
  );
}

function ManualCount({ o, endpoint, onDone, onCancel }: { o: Offer; endpoint: string; onDone: (msg: string) => void; onCancel: () => void }) {
  const [f, setF] = useState({ count: "", note: "", date: "" });
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await send<{ date: string; count: number }>("POST", endpoint, { count: f.count, note: f.note, date: f.date || undefined });
    if (!r.ok) return setErr({ msg: r.error, field: r.field });
    onDone(`Contagem manual de ${o.name} registrada: ${fmt(r.data!.count)} em ${day(r.data!.date)}.`);
  }
  const fe = (k: string) => (err?.field === k ? err.msg : undefined);
  return (
    <Card title={`Contagem manual: ${o.name}`} hint="Use quando a oferta roda só no Brasil (a API não traz). Abra a Biblioteca, confira o número de anúncios ativos e anote aqui. Fica registrado quem anotou, quando e de onde veio.">
      <form onSubmit={submit} className="grid sm:grid-cols-4 gap-3 items-start" data-testid="contagem-manual-form">
        <Field label="Anúncios ativos" error={fe("count")}><input className={input} value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} inputMode="numeric" placeholder="Ex.: 140" /></Field>
        <Field label="Dia" hint="vazio = hoje" error={fe("date")}><input type="date" className={input} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="De onde veio" error={fe("note")} className="sm:col-span-2"><input className={input} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Biblioteca pública, país Brasil, 10h" /></Field>
        {err && !["count", "date", "note"].includes(err.field || "") && <p className="text-xs text-red-400 sm:col-span-4" role="alert">{err.msg}</p>}
        <div className="flex items-center gap-2 sm:col-span-4">
          <button type="submit" className={primary}>Registrar contagem manual</button>
          <a href={o.libraryUrl} target="_blank" rel="noreferrer noopener" className={btn}>Abrir a Biblioteca <ExternalLink size={13} /></a>
          <button type="button" className={linkBtn} onClick={onCancel}>Cancelar</button>
        </div>
      </form>
    </Card>
  );
}

function HistoryPanel({ url, onClose }: { url: string; onClose: () => void }) {
  const [h, setH] = useState<HistoryData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    send<HistoryData>("GET", url).then((r) => (r.ok ? setH(r.data!) : setError(r.error)));
  }, [url]);
  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-label="Histórico da oferta" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-t-2xl sm:rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-auto p-4 sm:p-6 space-y-4" onClick={(e) => e.stopPropagation()} data-testid="historico">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-100 truncate">{h?.name || "Histórico"}</h3>
            <p className="text-xs text-gray-400">Anúncios ativos por dia, últimos 90 dias{h ? ` (${day(h.from)} a ${day(h.to)})` : ""}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-gray-100" aria-label="Fechar"><X size={18} /></button>
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        {!h && !error && <p className="text-sm text-gray-400">Carregando...</p>}
        {h && (
          <>
            <div className="bg-gray-950/50 rounded-xl border border-gray-800 p-3"><Sparkline values={h.stats.spark} h={120} w={600} tone="orange" /></div>
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-gray-300">Agora: <b className="text-white tabular-nums">{fmt(h.stats.count)}</b></span>
              <Delta value={h.stats.delta1} pctValue={h.stats.delta1Pct} label="vs dia anterior" />
              <Delta value={h.stats.delta7} pctValue={h.stats.delta7Pct} label="em 7 dias" />
            </div>
            {!h.rows.length ? <p className="text-sm text-gray-400">Nenhuma contagem ainda.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[560px]">
                  <thead className="text-gray-400 text-left"><tr className="border-b border-gray-800"><th className="py-2 pr-2 font-medium">Dia</th><th className="py-2 px-2 font-medium text-right">Ativos</th><th className="py-2 px-2 font-medium">Fonte</th><th className="py-2 px-2 font-medium">Detalhe</th></tr></thead>
                  <tbody>
                    {h.rows.map((r) => (
                      <tr key={r.date} className="border-b border-gray-800/60 align-top">
                        <td className="py-1.5 pr-2 text-gray-300 whitespace-nowrap">{day(r.date)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-gray-100">{r.complete ? "" : "≥ "}{fmt(r.count)}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap">{r.source === "manual" ? <span className="text-amber-200 font-semibold">contagem manual</span> : <span className="text-gray-300">API</span>}</td>
                        <td className="py-1.5 px-2 text-gray-400">{r.source === "manual" ? `${r.byName || "alguém"} em ${fmtDateTime(r.at)}: ${r.note}` : `${r.countries.length} países (${r.countries.slice(0, 6).join(", ")}${r.countries.length > 6 ? "..." : ""}), ${r.calls} chamada(s), ${fmtDateTime(r.at)}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MonthlyReport({ onClose }: { onClose: () => void }) {
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(cur);
  const [r, setR] = useState<{ text: string; items: unknown[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setR(null);
    send<{ text: string; items: unknown[] }>("GET", `/api/ofertas/casa/relatorio?mes=${month}`).then((x) => (x.ok ? (setR(x.data!), setError("")) : setError(x.error)));
  }, [month]);
  return (
    <Card title="Mais escaladas do mês" hint="Lista da casa: quem mais ganhou anúncios ativos entre a primeira e a última contagem do mês." right={<button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-100" aria-label="Fechar relatório"><X size={16} /></button>}>
      <div className="space-y-3" data-testid="relatorio-mensal">
        <label className="text-xs text-gray-400 flex items-center gap-2">Mês <input type="month" className={select} value={month} max={cur} onChange={(e) => setMonth(e.target.value || cur)} /></label>
        {error && <Notice tone="bad">{error}</Notice>}
        {r && <pre className="whitespace-pre-wrap text-xs text-gray-200 bg-gray-950/50 border border-gray-800 rounded-lg p-3 font-sans leading-relaxed">{r.text}</pre>}
        {r && <button type="button" className={btn} onClick={() => navigator.clipboard?.writeText(r.text)}><ClipboardList size={14} /> Copiar texto</button>}
      </div>
    </Card>
  );
}

interface AdminConfig { rules: Rule[]; customRules: boolean; countries: string[]; countriesFromEnv: boolean; token: { has: boolean; lastTest: null | { at: string; ok: boolean; message: string } } }
function AdminConfigCard({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [c, setC] = useState<AdminConfig | null>(null);
  const [rules, setRules] = useState("");
  const [countries, setCountries] = useState("");
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const apply = (d: AdminConfig) => {
    setC(d);
    setRules(JSON.stringify(d.rules.map(({ text: _t, ...r }) => r), null, 2)); // eslint-disable-line @typescript-eslint/no-unused-vars
    setCountries(d.countries.join(", "));
  };
  useEffect(() => { send<AdminConfig>("GET", "/api/admin/ofertas/config").then((r) => r.ok && apply(r.data!)); }, []);
  async function put(body: Record<string, unknown>, ok: string) {
    const r = await send<AdminConfig>("PUT", "/api/admin/ofertas/config", body);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    apply(r.data!);
    setMsg({ tone: "ok", text: ok });
    onChanged();
  }
  if (!c) return null;
  return (
    <Card title="Configuração do módulo (administrador)" right={<button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-100" aria-label="Fechar configuração"><X size={16} /></button>}>
      <div className="space-y-4" data-testid="ofertas-config">
        {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-200">Token da casa (API da Biblioteca de Anúncios)</h4>
          <p className="text-xs text-gray-400">{c.token.has ? "Token cadastrado (não é mostrado)." : "Nenhum token cadastrado: a lista da casa só recebe contagem manual."} {c.token.lastTest && <span className={c.token.lastTest.ok ? "text-emerald-300" : "text-amber-200"}>Último teste {fmtDateTime(c.token.lastTest.at)}: {c.token.lastTest.message}</span>}</p>
          <div className="flex flex-wrap gap-2">
            <input className={`${input} mt-0 flex-1 min-w-[220px]`} type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Cole o token de usuário (EAA...)" autoComplete="off" />
            <button type="button" className={btn} onClick={() => put({ acao: "token", token }, "Token salvo.").then(() => setToken(""))} disabled={!token}>Salvar token</button>
            {c.token.has && <button type="button" className={btn} onClick={() => put({ acao: "testar_token" }, "Teste feito.")}>Testar</button>}
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-200">Países pedidos à API</h4>
          <p className="text-xs text-gray-400">A API só traz anúncio comercial que alcançou a União Europeia. Padrão: os 27 países da UE.{c.countriesFromEnv && " Hoje definido pela env OFFERS_AD_COUNTRIES (a tela não muda)."}</p>
          <div className="flex flex-wrap gap-2">
            <input className={`${input} mt-0 flex-1 min-w-[220px]`} value={countries} onChange={(e) => setCountries(e.target.value)} />
            <button type="button" className={btn} onClick={() => put({ acao: "paises", countries }, "Países salvos.")}>Salvar países</button>
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-200">Regras do selo {c.customRules ? "(personalizadas)" : "(padrão)"}</h4>
          <p className="text-xs text-gray-400">Em ordem: a primeira que bate vale. Campos: minCount, maxCount, minDelta7, maxDelta7, minDelta7Pct, maxDelta7Pct; tone: red, orange, green, blue ou gray.</p>
          <textarea className={`${input} font-mono text-xs min-h-40`} value={rules} onChange={(e) => setRules(e.target.value)} spellCheck={false} />
          <div className="flex gap-2">
            <button type="button" className={btn} onClick={() => { try { put({ acao: "regras", heatRules: JSON.parse(rules) }, "Regras salvas."); } catch { setMsg({ tone: "bad", text: "O texto das regras não é um JSON válido." }); } }}>Salvar regras</button>
            {c.customRules && <button type="button" className={linkBtn} onClick={() => put({ acao: "regras_padrao" }, "Regras padrão de volta.")}>Voltar ao padrão</button>}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function OffersTab({ onHelp }: { onHelp?: (id: string) => void }) {
  const [lista, setListaState] = useState<Lista>("minhas");
  const [org, setOrg] = useState<OrgData | null>(null);
  const [house, setHouse] = useState<HouseData | null>(null);
  const [houseError, setHouseError] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("anuncios");
  const [f, setF] = useState({ heat: "", structure: "", niche: "", language: "", country: "" });
  const [form, setForm] = useState<"" | "new" | Offer>("");
  const [manual, setManual] = useState<Offer | null>(null);
  const [historyOf, setHistoryOf] = useState<Offer | null>(null);
  const [panel, setPanel] = useState<"" | "relatorio" | "config" | "regras">("");
  const [busy, setBusy] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad" | "warn" | "info"; text: string } | null>(null);

  useEffect(() => {
    const l = new URLSearchParams(window.location.search).get("lista");
    if (l === "casa" || l === "favoritas") setListaState(l);
  }, []);
  function setLista(l: Lista) {
    setListaState(l);
    setForm("");
    setManual(null);
    const url = new URL(window.location.href);
    if (l === "minhas") url.searchParams.delete("lista");
    else url.searchParams.set("lista", l);
    window.history.replaceState(null, "", url);
  }
  const loadOrg = useCallback(async () => {
    const r = await send<OrgData>("GET", "/api/ofertas");
    if (r.ok) setOrg(r.data!);
    else setMsg({ tone: "bad", text: r.error });
  }, []);
  const loadHouse = useCallback(async () => {
    const r = await send<HouseData>("GET", "/api/ofertas/casa");
    if (r.ok) { setHouse(r.data!); setHouseError(""); } else setHouseError(r.error);
  }, []);
  useEffect(() => { loadOrg(); }, [loadOrg]);
  useEffect(() => { if (org?.module) loadHouse(); }, [org?.module, loadHouse]);
  const reload = () => { loadOrg(); if (org?.module) loadHouse(); };

  const all = useMemo(() => [...(org?.offers || []), ...(house?.offers || [])], [org, house]);
  const base = useMemo(() => (lista === "minhas" ? org?.offers || [] : lista === "casa" ? house?.offers || [] : all.filter((o) => o.favorite)), [lista, org, house, all]);
  const countries = useMemo(() => [...new Set(all.flatMap((o) => o.tags.countries))].sort(), [all]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = base.filter((o) =>
      (!term || `${o.name} ${o.tags.product} ${o.notes}`.toLowerCase().includes(term)) &&
      (!f.heat || o.heat.id === f.heat) && (!f.structure || o.tags.structure === f.structure) && (!f.niche || o.tags.niche === f.niche) &&
      (!f.language || o.tags.language === f.language) && (!f.country || o.tags.countries.includes(f.country)));
    const n = (v: number | null) => (v == null ? -Infinity : v);
    return [...list].sort((a, b) =>
      sort === "anuncios" ? n(b.stats.count) - n(a.stats.count)
        : sort === "alta" ? n(b.stats.delta7) - n(a.stats.delta7) || n(b.stats.delta7Pct) - n(a.stats.delta7Pct)
          : sort === "recentes" ? Date.parse(b.createdAt) - Date.parse(a.createdAt)
            : a.name.localeCompare(b.name, "pt-BR"));
  }, [base, q, f, sort]);

  async function toggleFav(o: Offer) {
    const r = await send("POST", "/api/ofertas/favoritos", { kind: o.kind, id: o._id, on: !o.favorite });
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    const flip = (d: { offers: Offer[] } | null) => d && { ...d, offers: d.offers.map((x) => (x._id === o._id && x.kind === o.kind ? { ...x, favorite: !o.favorite } : x)) };
    if (o.kind === "org") setOrg((d) => flip(d) as OrgData);
    else setHouse((d) => flip(d) as HouseData);
  }
  async function remove(o: Offer) {
    const house = o.kind === "casa";
    if (!window.confirm(house ? `Arquivar "${o.name}" da lista da casa? Some para os clientes; o histórico fica.` : `Apagar "${o.name}" e o histórico dela?`)) return;
    const r = await send("DELETE", house ? `/api/admin/ofertas/${o._id}` : `/api/ofertas/${o._id}`);
    if (!r.ok) setMsg({ tone: "bad", text: r.error });
    reload();
  }
  async function countNow() {
    setBusy(true);
    setMsg(null);
    const r = lista === "casa" ? await send<{ counted: number; pages: number; results: { name: string; status: string; message?: string }[] }>("POST", "/api/admin/ofertas/atualizar", {}) : await send<{ counted: number; pages: number; results: { name: string; status: string; message?: string }[] }>("POST", "/api/ofertas/atualizar", {});
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    const issues = r.data!.results.filter((x) => x.status === "erro" || x.status === "sem_token").map((x) => `${x.name}: ${x.message}`);
    setMsg(issues.length ? { tone: "warn", text: issues.slice(0, 2).join(" | ") } : { tone: "ok", text: `Contagem feita: ${r.data!.counted} de ${r.data!.pages} oferta(s) pela API.` });
    reload();
  }

  if (!org) return <p className="text-sm text-gray-400">{msg?.text || "Carregando ofertas..."}</p>;
  const labels = org.labels;
  const activeFilters = Object.values(f).filter(Boolean).length;
  const isAdminHouse = lista === "casa" && Boolean(house?.canAdmin);
  const canEdit = (o: Offer) => (o.kind === "org" ? true : isAdminHouse);
  const totalAds = base.reduce((s, o) => s + (o.stats.count || 0), 0);
  const hot = base.filter((o) => o.heat.id === "escalando").length;
  const LISTAS: { id: Lista; label: string; show: boolean }[] = [
    { id: "minhas", label: `Minhas ofertas (${org.offers.length})`, show: true },
    { id: "casa", label: `Lista da casa${house ? ` (${house.offers.filter((o) => o.active).length})` : ""}`, show: org.module },
    { id: "favoritas", label: `Favoritas (${all.filter((o) => o.favorite).length})`, show: true },
  ];
  const endpointFor = (o?: Offer) => (o?.kind === "casa" || (!o && lista === "casa") ? "/api/admin/ofertas" : "/api/ofertas");
  const sel = (k: keyof typeof f, label: string, options: [string, string][]) => (
    <select className={select} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-label={label}>
      <option value="">{label}: todos</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  return (
    <div className="space-y-4" data-testid="ofertas">
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex gap-1 overflow-x-auto max-w-full" aria-label="Listas de ofertas">
          {LISTAS.filter((l) => l.show).map((l) => (
            <button key={l.id} type="button" onClick={() => setLista(l.id)} className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border transition ${lista === l.id ? "bg-gray-100 text-gray-900 border-gray-100 font-semibold" : "border-gray-700 text-gray-300 hover:bg-gray-800"}`} aria-current={lista === l.id ? "page" : undefined} data-testid={`lista-${l.id}`}>{l.label}</button>
          ))}
        </nav>
        <span className="flex-1" />
        <Help onHelp={onHelp} />
      </div>

      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      {lista !== "favoritas" && (
        <details className="text-[11px] text-gray-500 leading-snug">
          <summary className="cursor-pointer text-gray-400 hover:text-gray-200 w-fit">De onde vem o número</summary>
          <p className="mt-1">{org.note} Nada é lido das páginas públicas da Biblioteca por robô: o botão Biblioteca só abre a busca para você.</p>
        </details>
      )}
      {lista === "minhas" && !org.token && <Notice tone="info">Sem token para a API: conecte uma conta de anúncio em Tráfego (o mesmo token serve à Biblioteca de Anúncios, depois de confirmar a identidade em facebook.com/ID). Enquanto isso, use a contagem manual.</Notice>}
      {lista === "casa" && houseError && <Notice tone="bad">{houseError}</Notice>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          ["Ofertas na lista", fmt(base.length)],
          ["Anúncios ativos agora", fmt(totalAds)],
          ["Escalando", fmt(hot)],
          lista === "casa" ? ["Novas hoje", fmt(house?.newToday ?? 0)] : ["Favoritas", fmt(base.filter((o) => o.favorite).length)],
        ].map(([l, v]) => (
          <div key={l} className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2"><div className="text-[11px] text-gray-400 truncate">{l}</div><div className="text-lg md:text-xl font-bold text-white tabular-nums">{v}</div></div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <label className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden />
          <input className={`${select} w-full pl-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar página, produto..." aria-label="Buscar" data-testid="ofertas-busca" />
        </label>
        <select className={select} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar" data-testid="ofertas-ordem">
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button type="button" className={`${btn} sm:hidden`} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}>Filtros{activeFilters ? ` (${activeFilters})` : ""}</button>
      </div>
      <div className={`${showFilters ? "grid" : "hidden"} grid-cols-2 sm:flex sm:flex-wrap gap-2 items-center [&>select]:min-w-0`}>
        {sel("heat", "Selo", [...org.rules.map((r) => [r.id, r.label] as [string, string]), ["sem_historico", "Sem histórico"], ["parou", "Parou"]])}
        {sel("structure", "Tipo de página", Object.entries(labels.structure))}
        {sel("niche", "Nicho", Object.entries(labels.niche))}
        {sel("language", "Língua", Object.entries(labels.language))}
        {sel("country", "País", countries.map((c) => [c, c]))}
        {Object.values(f).some(Boolean) && <button type="button" className={linkBtn} onClick={() => setF({ heat: "", structure: "", niche: "", language: "", country: "" })}>Limpar filtros</button>}
      </div>

      <div className="flex gap-2 overflow-x-auto sm:flex-wrap -mx-1 px-1 pb-1">
        {(lista === "minhas" || isAdminHouse) && form !== "new" && <button type="button" className={`${primary} inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap`} onClick={() => { setForm("new"); setManual(null); }} data-testid="oferta-nova"><Plus size={15} /> {lista === "casa" ? "Adicionar à lista da casa" : "Adicionar oferta"}</button>}
        {(lista === "minhas" || isAdminHouse) && <button type="button" className={btn} onClick={countNow} disabled={busy}><RefreshCw size={14} className={busy ? "animate-spin" : ""} /> {busy ? "Contando..." : "Contar agora pela API"}</button>}
        {org.module && <button type="button" className={btn} onClick={() => setPanel(panel === "relatorio" ? "" : "relatorio")} data-testid="ofertas-relatorio"><FileText size={14} /> Mais escaladas do mês</button>}
        <button type="button" className={btn} onClick={() => setPanel(panel === "regras" ? "" : "regras")}>Como o selo é calculado</button>
        {isAdminHouse && <button type="button" className={btn} onClick={() => setPanel(panel === "config" ? "" : "config")}><Settings2 size={14} /> Configurar módulo</button>}
      </div>

      {panel === "regras" && (
        <Card title="Como o selo é calculado" right={<button type="button" onClick={() => setPanel("")} className="p-1 text-gray-400 hover:text-gray-100" aria-label="Fechar"><X size={16} /></button>}>
          <ol className="space-y-1.5 text-sm text-gray-300 list-decimal pl-5">
            {org.rules.map((r) => <li key={r.id}><HeatBadge heat={r} /> <span className="text-gray-400">{r.text}</span></li>)}
          </ol>
          <p className="text-xs text-gray-500 mt-3">A primeira regra que bate vale. Sem uma contagem de 7 a 10 dias antes, o selo fica &quot;Sem histórico&quot;; com zero anúncios depois de ter tido, &quot;Parou&quot;. O administrador da plataforma ajusta os limites.</p>
        </Card>
      )}
      {panel === "relatorio" && org.module && <MonthlyReport onClose={() => setPanel("")} />}
      {panel === "config" && isAdminHouse && <AdminConfigCard onClose={() => setPanel("")} onChanged={reload} />}
      {form === "new" && <OfferForm title={lista === "casa" ? "Nova oferta na lista da casa" : "Nova oferta"} labels={labels} endpoint={endpointFor()} onCancel={() => setForm("")} onDone={() => { setForm(""); reload(); }} />}
      {form && form !== "new" && <OfferForm key={form._id} title={`Editar ${form.name}`} initial={form} labels={labels} endpoint={endpointFor(form)} onCancel={() => setForm("")} onDone={() => { setForm(""); reload(); }} />}
      {manual && <ManualCount key={manual._id} o={manual} endpoint={manual.kind === "casa" ? `/api/admin/ofertas/${manual._id}/contagem` : `/api/ofertas/${manual._id}/contagem`} onCancel={() => setManual(null)} onDone={(t) => { setManual(null); setMsg({ tone: "ok", text: t }); reload(); }} />}

      {!shown.length && (
        <p className="text-sm text-gray-400 py-6 text-center">
          {base.length ? "Nenhuma oferta com esses filtros." : lista === "minhas" ? "Nenhuma oferta ainda. Adicione a página de um anunciante que você quer acompanhar." : lista === "favoritas" ? "Toque no coração de uma oferta para ela aparecer aqui." : "A lista da casa ainda está vazia."}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((o) => (
          <OfferCard
            key={`${o.kind}-${o._id}`}
            o={o}
            labels={labels}
            canEdit={canEdit(o)}
            onFav={() => toggleFav(o)}
            onHistory={() => setHistoryOf(o)}
            onEdit={canEdit(o) ? () => { setForm(o); setManual(null); window.scrollTo({ top: 0, behavior: "smooth" }); } : undefined}
            onDelete={canEdit(o) && o.active ? () => remove(o) : undefined}
            onCount={canEdit(o) ? () => { setManual(o); setForm(""); window.scrollTo({ top: 0, behavior: "smooth" }); } : undefined}
          />
        ))}
      </div>
      {historyOf && <HistoryPanel url={historyOf.kind === "casa" ? `/api/ofertas/casa/${historyOf._id}/historico` : `/api/ofertas/${historyOf._id}/historico`} onClose={() => setHistoryOf(null)} />}
    </div>
  );
}
