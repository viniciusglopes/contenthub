"use client";
/* eslint-disable react-hooks/set-state-in-effect -- aba e filtros lidos do link e carga inicial */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlarmClock, Download, KanbanSquare, List, ListChecks, Plus, Search, Settings2, BarChart3, Inbox, X } from "lucide-react";
import { send, fmtWhen } from "@/components/http";
import { Field, Notice, linkBtn } from "@/components/studio/shared";
import LeadDrawer from "./LeadDrawer";
import CrmReports from "./CrmReports";
import CrmInputs from "./CrmInputs";
import PipelineEditor from "./PipelineEditor";
import { type LeadT, type Options, type Stage, type TaskT, HelpDot, SOURCE_TONE, btn, chip, initials, input, money, primary, select, setParam } from "./shared";


type Tab = "funil" | "lista" | "tarefas" | "relatorios" | "entradas" | "funis";
const TABS: { key: Tab; label: string; icon: React.ReactNode; owner?: boolean }[] = [
  { key: "funil", label: "Funil", icon: <KanbanSquare size={14} /> },
  { key: "lista", label: "Lista", icon: <List size={14} /> },
  { key: "tarefas", label: "Tarefas", icon: <ListChecks size={14} /> },
  { key: "relatorios", label: "Relatórios", icon: <BarChart3 size={14} /> },
  { key: "entradas", label: "Entradas", icon: <Inbox size={14} /> },
  { key: "funis", label: "Etapas", icon: <Settings2 size={14} />, owner: true },
];
const PERIODS = [{ key: "", label: "Sempre" }, { key: "7d", label: "7 dias" }, { key: "30d", label: "30 dias" }, { key: "90d", label: "90 dias" }, { key: "mes", label: "Este mês" }];
interface Filters { funil: string; q: string; responsavel: string; origem: string; campanha: string; etiqueta: string; periodo: string }
const EMPTY: Filters = { funil: "", q: "", responsavel: "", origem: "", campanha: "", etiqueta: "", periodo: "" };
const FILTER_KEYS = Object.keys(EMPTY) as (keyof Filters)[];
interface ListPayload { pipeline: { _id: string; name: string }; leads: LeadT[]; byStage: Record<string, { n: number; value: number }>; total: number; capped: boolean }

// ---------- novo lead ----------

function NewLeadModal({ opts, pipeline, onClose, onSaved }: { opts: Options; pipeline: string; onClose: () => void; onSaved: (id: string, msg: string) => void }) {
  const pipe = opts.pipelines.find((p) => p._id === pipeline) || opts.pipelines[0];
  const [f, setF] = useState({ name: "", username: "", email: "", phone: "", consent: false, consentBasis: "", stage: "", owner: opts.me, value: "", tags: "", sourceNote: "" });
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const needsConsent = Boolean(f.email.trim() || f.phone.trim());
  const fe = (k: string) => (err?.field === k ? err.msg : undefined);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await send<{ lead: LeadT; created: boolean; deduped: boolean }>("POST", "/api/crm/leads", { ...f, pipeline: pipe?._id, value: f.value || null });
    setBusy(false);
    if (!r.ok || !r.data) return setErr({ msg: r.error, field: r.field });
    onSaved(r.data.lead._id, r.data.deduped ? "Esse contato já existia (mesmo e-mail ou telefone): atualizei o cadastro dele." : "Lead criado.");
  }
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-t-2xl sm:rounded-2xl max-w-lg w-full max-h-[92vh] overflow-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Novo lead" data-testid="crm-novo">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h3 className="font-bold text-white">Novo lead</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-800 rounded" aria-label="Fechar"><X size={18} /></button>
        </div>
        <form onSubmit={save} className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nome" error={fe("name")}><input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
            <Field label="Instagram (@)"><input className={input} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="@usuario" /></Field>
            <Field label="WhatsApp / telefone" error={fe("phone")}><input className={input} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="11 91234-5678" inputMode="tel" /></Field>
            <Field label="E-mail" error={fe("email")}><input className={input} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} inputMode="email" /></Field>
          </div>
          {needsConsent && (
            <div className="rounded-lg border border-gray-800 p-3 space-y-2" data-testid="crm-novo-consent">
              <label className="flex items-start gap-2 text-sm text-gray-200"><input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} className="mt-1 accent-[var(--brand-500)]" /> A pessoa autorizou guardar este contato (LGPD)</label>
              {fe("consent") && <p className="text-xs text-red-400">{fe("consent")}</p>}
              <Field label="Como autorizou" error={fe("consentBasis")}><input className={input} value={f.consentBasis} onChange={(e) => setF({ ...f, consentBasis: e.target.value })} placeholder="Ex.: pediu orçamento pelo telefone em 18/10" /></Field>
            </div>
          )}
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Etapa"><select className={`${select} w-full mt-1`} value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}><option value="">{pipe?.stages.find((s) => s.kind === "open")?.name || "Primeira"}</option>{pipe?.stages.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select></Field>
            <Field label="Responsável"><select className={`${select} w-full mt-1`} value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}><option value="">Ninguém</option>{opts.team.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}</select></Field>
            <Field label="Valor (R$)" error={fe("value")}><input className={input} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} inputMode="decimal" placeholder="0,00" /></Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Etiquetas (vírgula)" error={fe("tags")}><input className={input} value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
            <Field label="De onde veio (opcional)"><input className={input} value={f.sourceNote} onChange={(e) => setF({ ...f, sourceNote: e.target.value })} placeholder="Indicação, evento, ligação..." /></Field>
          </div>
          {err && !err.field && <p className="text-xs text-red-400" role="alert">{err.msg}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy} className={primary} data-testid="crm-novo-salvar">{busy ? "Salvando..." : "Salvar"}</button>
            <button type="button" className={linkBtn} onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- perdeu: motivo ----------

function LostReason({ onSave, onCancel }: { onSave: (r: string) => void; onCancel: () => void }) {
  const [r, setR] = useState("");
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={onCancel}>
      <form className="bg-gray-900 rounded-t-2xl sm:rounded-2xl max-w-sm w-full p-4 space-y-3" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onSave(r); }} role="dialog" aria-label="Motivo da perda">
        <h3 className="font-bold text-white">Por que perdeu?</h3>
        <input className={input} value={r} onChange={(e) => setR(e.target.value)} placeholder="Preço, sumiu, comprou do concorrente..." autoFocus maxLength={200} />
        <div className="flex items-center gap-3"><button type="submit" className={primary}>Salvar</button><button type="button" className={linkBtn} onClick={onCancel}>Cancelar</button></div>
      </form>
    </div>
  );
}

// ---------- cartão e coluna ----------

function LeadCard({ l, now, onOpen, onDragStart }: { l: LeadT; now: number; onOpen: () => void; onDragStart: (e: React.DragEvent) => void }) {
  const late = l.tasks?.next && new Date(l.tasks.next).getTime() < now;
  return (
    <button type="button" draggable onDragStart={onDragStart} onClick={onOpen} className="w-full text-left bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-lg p-2.5 space-y-1.5 cursor-grab active:cursor-grabbing" data-testid="crm-card">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-gray-100 font-medium truncate flex-1" title={l.display}>{l.display}</span>
        {l.value != null && <span className="text-xs text-green-300 shrink-0">{money(l.value)}</span>}
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`${chip} ${SOURCE_TONE[l.source] || "bg-gray-700 text-gray-300"} truncate max-w-[60%]`} title={`${l.sourceLabel}${l.firstTouch?.label ? `: ${l.firstTouch.label}` : ""}`}>{l.sourceLabel || "–"}</span>
        {l.tasks && l.tasks.n > 0 && <span className={`${chip} flex items-center gap-0.5 ${late ? "bg-red-500/15 text-red-300" : "bg-gray-800 text-gray-400"}`} title={late ? "Tarefa atrasada" : "Tarefa aberta"}><AlarmClock size={10} />{l.tasks.n}</span>}
        <span className="ml-auto w-5 h-5 rounded-full bg-gray-700 text-[10px] grid place-items-center text-gray-200 shrink-0" title={l.ownerName || "Sem responsável"}>{l.ownerName ? initials(l.ownerName) : "–"}</span>
      </div>
    </button>
  );
}

function Kanban({ stages, leads, byStage, onOpen, onMove }: { stages: Stage[]; leads: LeadT[]; byStage: ListPayload["byStage"]; onOpen: (id: string) => void; onMove: (id: string, stage: Stage) => void }) {
  const [over, setOver] = useState("");
  const [now] = useState(() => Date.now());
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:snap-none -mx-3 px-3 md:mx-0 md:px-0" data-testid="crm-kanban">
      {stages.map((s) => {
        const items = leads.filter((l) => l.stage === s.key);
        return (
          <section
            key={s.key}
            onDragOver={(e) => { e.preventDefault(); setOver(s.key); }}
            onDragLeave={() => setOver("")}
            onDrop={(e) => { e.preventDefault(); setOver(""); const id = e.dataTransfer.getData("text/plain"); if (id) onMove(id, s); }}
            className={`snap-start shrink-0 w-[78vw] sm:w-64 lg:w-auto lg:flex-1 lg:min-w-[200px] lg:shrink rounded-xl border ${over === s.key ? "border-brand-500 bg-gray-800/60" : "border-gray-800 bg-gray-900/40"} flex flex-col max-h-[calc(100vh-15rem)]`}
            aria-label={`Etapa ${s.name}`}
          >
            <header className="px-3 py-2 border-b border-gray-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color || "#6b7280" }} />
              <h4 className="text-sm font-semibold text-gray-100 truncate">{s.name}</h4>
              <span className="text-xs text-gray-500">{byStage[s.key]?.n || 0}</span>
              {(byStage[s.key]?.value || 0) > 0 && <span className="ml-auto text-[11px] text-gray-400">{money(byStage[s.key].value)}</span>}
            </header>
            <div className="p-2 space-y-2 overflow-y-auto">
              {items.map((l) => <LeadCard key={l._id} l={l} now={now} onOpen={() => onOpen(l._id)} onDragStart={(e) => { e.dataTransfer.setData("text/plain", l._id); e.dataTransfer.effectAllowed = "move"; }} />)}
              {!items.length && <p className="text-xs text-gray-600 text-center py-4">Arraste um lead para cá</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LeadList({ stages, leads, onOpen }: { stages: Stage[]; leads: LeadT[]; onOpen: (id: string) => void }) {
  const name = (k: string) => stages.find((s) => s.key === k)?.name || k;
  return (
    <div className="overflow-x-auto bg-gray-900 border border-gray-800 rounded-xl">
      <table className="w-full text-xs md:text-sm min-w-[820px]" data-testid="crm-lista">
        <thead className="text-gray-400 text-left"><tr className="border-b border-gray-800">
          <th className="py-2 px-3 font-medium">Lead</th><th className="py-2 px-2 font-medium">Etapa</th><th className="py-2 px-2 font-medium">Origem</th><th className="py-2 px-2 font-medium">Campanha / post</th><th className="py-2 px-2 font-medium">Responsável</th><th className="py-2 px-2 font-medium text-right">Valor</th><th className="py-2 px-2 font-medium">Entrou</th>
        </tr></thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l._id} className="border-b border-gray-800/60 hover:bg-gray-800/40 cursor-pointer" onClick={() => onOpen(l._id)}>
              <td className="py-2 px-3 text-gray-100 max-w-[220px] truncate" title={[l.display, l.phone, l.email].filter(Boolean).join(" · ")}>{l.display}{l.phone && <span className="text-gray-500"> · {l.phone.replace(/^\+55/, "")}</span>}</td>
              <td className="py-2 px-2 whitespace-nowrap">{name(l.stage)}</td>
              <td className="py-2 px-2 whitespace-nowrap"><span className={`${chip} ${SOURCE_TONE[l.source] || "bg-gray-700 text-gray-300"}`}>{l.sourceLabel || "–"}</span></td>
              <td className="py-2 px-2 max-w-[200px] truncate text-gray-300" title={l.firstTouch?.label || ""}>{l.firstTouch?.label || l.utm?.campaign || "–"}</td>
              <td className="py-2 px-2 whitespace-nowrap text-gray-300">{l.ownerName || "–"}</td>
              <td className="py-2 px-2 whitespace-nowrap text-right text-green-300">{money(l.value) || "–"}</td>
              <td className="py-2 px-2 whitespace-nowrap text-gray-400">{fmtWhen(l.leadAt, "–")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TasksTab({ onOpen }: { onOpen: (id: string) => void }) {
  const [mine, setMine] = useState(true);
  const [tasks, setTasks] = useState<TaskT[] | null>(null);
  const load = useCallback(async () => {
    const r = await send<{ tasks: TaskT[] }>("GET", `/api/crm/tarefas${mine ? "?minhas=1" : ""}`);
    setTasks(r.ok && r.data ? r.data.tasks : []);
  }, [mine]);
  useEffect(() => { load(); }, [load]);
  async function done(t: TaskT) {
    await send("PUT", `/api/crm/tarefas/${t._id}`, { done: true });
    load();
  }
  return (
    <div className="space-y-3" data-testid="crm-tarefas">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setMine(true)} className={`${chip} px-2.5 py-1.5 text-xs border ${mine ? "border-brand-500 text-white bg-gray-800" : "border-gray-700 text-gray-400"}`}>Minhas</button>
        <button type="button" onClick={() => setMine(false)} className={`${chip} px-2.5 py-1.5 text-xs border ${!mine ? "border-brand-500 text-white bg-gray-800" : "border-gray-700 text-gray-400"}`}>Da equipe</button>
        <span className="text-xs text-gray-500 ml-auto">{tasks ? `${tasks.length} aberta(s)` : "Carregando..."}</span>
      </div>
      {tasks && !tasks.length && <p className="text-sm text-gray-400">Nenhuma tarefa aberta. Crie lembretes dentro do lead (aba Tarefas).</p>}
      <ul className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
        {(tasks || []).map((t) => (
          <li key={t._id} className="flex items-center gap-3 px-3 py-2">
            <input type="checkbox" aria-label={`Concluir ${t.title}`} onChange={() => done(t)} className="accent-[var(--brand-500)]" />
            <button type="button" className="flex-1 min-w-0 text-left" onClick={() => onOpen(t.contact)}>
              <p className="text-sm text-gray-100 truncate">{t.title}</p>
              <p className="text-xs text-gray-500 truncate">{t.contactName}</p>
            </button>
            <span className={`text-xs whitespace-nowrap ${t.overdue ? "text-red-300" : "text-gray-400"}`}>{t.dueAt ? fmtWhen(t.dueAt) : "sem data"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- painel ----------

export default function CrmPanel() {
  const [tab, setTabState] = useState<Tab>("funil");
  const [opts, setOpts] = useState<Options | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<ListPayload | null>(null);
  const [open, setOpen] = useState("");
  const [creating, setCreating] = useState(false);
  const [lost, setLost] = useState<{ id: string; stage: Stage } | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const loadOpts = useCallback(async () => {
    const r = await send<Options>("GET", "/api/crm/opcoes");
    if (r.ok && r.data) setOpts(r.data);
    else setMsg({ tone: "bad", text: r.error });
  }, []);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("aba") as Tab | null;
    if (t && TABS.some((x) => x.key === t)) setTabState(t);
    const f = { ...EMPTY };
    for (const k of FILTER_KEYS) f[k] = p.get(k) || "";
    setFilters(f);
    const lead = p.get("lead");
    if (lead && /^[0-9a-f]{24}$/.test(lead)) setOpen(lead);
    setReady(true);
    loadOpts();
  }, [loadOpts]);

  function setTab(t: Tab) {
    setTabState(t);
    setParam("aba", t === "funil" ? null : t);
  }
  function setFilter(f: Filters) {
    setFilters(f);
    for (const k of FILTER_KEYS) setParam(k, f[k] || null);
  }
  function openLead(id: string) {
    setOpen(id);
    setParam("lead", id || null);
  }
  const query = useMemo(() => {
    const q = new URLSearchParams();
    for (const k of FILTER_KEYS) if (filters[k]) q.set(k, filters[k]);
    return q.toString();
  }, [filters]);
  const load = useCallback(async () => {
    if (!ready) return;
    const r = await send<ListPayload>("GET", `/api/crm/leads${query ? `?${query}` : ""}`);
    if (r.ok && r.data) setData(r.data);
    else setMsg({ tone: "bad", text: r.error });
  }, [query, ready]);
  useEffect(() => { if (tab === "funil" || tab === "lista") load(); }, [load, tab]);

  const pipeline = opts?.pipelines.find((p) => p._id === (filters.funil || data?.pipeline._id)) || opts?.pipelines[0];
  const stages = pipeline?.stages || [];

  async function move(id: string, stage: Stage, lostReason?: string) {
    const lead = data?.leads.find((l) => l._id === id);
    if (!lead || lead.stage === stage.key) return;
    if (stage.kind === "lost" && lostReason === undefined) return setLost({ id, stage });
    // otimista: o cartão já muda de coluna
    setData((d) => d && { ...d, leads: d.leads.map((l) => (l._id === id ? { ...l, stage: stage.key } : l)) });
    const r = await send("PUT", `/api/crm/leads/${id}`, { stage: stage.key, ...(lostReason !== undefined ? { lostReason } : {}) });
    if (!r.ok) setMsg({ tone: "bad", text: r.error });
    load();
  }

  const chips: { k: keyof Filters; label: string }[] = [];
  if (opts) {
    if (filters.q) chips.push({ k: "q", label: `"${filters.q}"` });
    if (filters.responsavel) chips.push({ k: "responsavel", label: filters.responsavel === "eu" ? "Meus" : filters.responsavel === "ninguem" ? "Sem responsável" : opts.team.find((u) => u._id === filters.responsavel)?.name || "Responsável" });
    if (filters.origem) chips.push({ k: "origem", label: opts.allSources.find((s) => s.key === filters.origem)?.label || filters.origem });
    if (filters.campanha) chips.push({ k: "campanha", label: opts.campaigns.find((c) => c.id === filters.campanha)?.name || filters.campanha });
    if (filters.etiqueta) chips.push({ k: "etiqueta", label: `#${filters.etiqueta}` });
    if (filters.periodo) chips.push({ k: "periodo", label: PERIODS.find((p) => p.key === filters.periodo)?.label || filters.periodo });
  }
  const showFilters = tab === "funil" || tab === "lista";
  const visibleTabs = TABS.filter((t) => !t.owner || opts?.canManage);

  return (
    <div className="flex-1 overflow-auto p-3 md:p-6" data-testid="crm">
      <div className="max-w-[1400px] mx-auto space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex bg-gray-800/70 rounded-lg p-0.5 overflow-x-auto max-w-full" aria-label="Abas do CRM">
            {visibleTabs.map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${tab === t.key ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`} aria-current={tab === t.key ? "page" : undefined}>
                {t.icon}{t.label}{t.key === "tarefas" && (opts?.overdueMine || 0) > 0 && <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5">{opts!.overdueMine}</span>}
              </button>
            ))}
          </nav>
          {showFilters && (
            <div className="ml-auto flex items-center gap-2">
              <a href={`/api/crm/leads?${query}${query ? "&" : ""}formato=csv`} className={btn} download><Download size={14} /> <span className="hidden sm:inline">CSV</span></a>
              <button type="button" className={`${primary} flex items-center gap-1.5`} onClick={() => setCreating(true)} disabled={!opts} data-testid="crm-novo-btn"><Plus size={15} /> Novo lead</button>
            </div>
          )}
        </div>

        {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}

        {showFilters && opts && (
          <div className="space-y-2" aria-label="Filtros">
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <label className="relative flex-1 min-w-[160px]">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-100" value={filters.q} onChange={(e) => setFilter({ ...filters, q: e.target.value })} placeholder="Nome, @, e-mail ou telefone" aria-label="Buscar lead" />
              </label>
              <div className="flex items-center gap-2 overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0 md:overflow-visible [&>select]:shrink-0">
              {opts.pipelines.length > 1 && (
                <select className={select} value={filters.funil || pipeline?._id || ""} onChange={(e) => setFilter({ ...filters, funil: e.target.value })} aria-label="Funil">
                  {opts.pipelines.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              )}
              <select className={select} value={filters.responsavel} onChange={(e) => setFilter({ ...filters, responsavel: e.target.value })} aria-label="Responsável">
                <option value="">Todos</option><option value="eu">Meus</option><option value="ninguem">Sem responsável</option>
                {opts.team.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
              </select>
              <select className={select} value={filters.origem} onChange={(e) => setFilter({ ...filters, origem: e.target.value })} aria-label="Origem">
                <option value="">Toda origem</option>
                {opts.allSources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              {opts.campaigns.length > 0 && (
                <select className={`${select} max-w-[180px]`} value={filters.campanha} onChange={(e) => setFilter({ ...filters, campanha: e.target.value })} aria-label="Campanha">
                  <option value="">Toda campanha</option>
                  {opts.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {opts.tags.length > 0 && (
                <select className={select} value={filters.etiqueta} onChange={(e) => setFilter({ ...filters, etiqueta: e.target.value })} aria-label="Etiqueta">
                  <option value="">Toda etiqueta</option>
                  {opts.tags.map((t) => <option key={t} value={t}>#{t}</option>)}
                </select>
              )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0 md:flex-wrap [&>*]:shrink-0">
              {PERIODS.map((p) => (
                <button key={p.key} type="button" onClick={() => setFilter({ ...filters, periodo: p.key })} className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap ${filters.periodo === p.key ? "border-brand-500 text-brand-400 bg-brand-500/10 font-semibold" : "border-gray-700 text-gray-300 hover:border-gray-500"}`}>{p.label}</button>
              ))}
              {chips.filter((c) => c.k !== "periodo").map((c) => (
                <button key={c.k} type="button" onClick={() => setFilter({ ...filters, [c.k]: "" })} className={`${chip} px-2.5 py-1.5 text-xs border border-brand-500 text-white bg-gray-800 flex items-center gap-1`} aria-label={`Tirar filtro ${c.label}`}>{c.label}<X size={11} /></button>
              ))}
              {chips.length > 0 && <button type="button" className={linkBtn} onClick={() => setFilter({ ...EMPTY, funil: filters.funil })}>limpar</button>}
              <span className="text-xs text-gray-500 ml-auto" data-testid="crm-contagem">{data ? `${data.total} lead(s)${data.capped ? " (mostrando os 1.000 mais recentes)" : ""}` : "Carregando..."}</span>
              <HelpDot id="crm" label="Como funciona o CRM" />
            </div>
          </div>
        )}

        {tab === "funil" && data && <Kanban stages={stages} leads={data.leads} byStage={data.byStage} onOpen={openLead} onMove={(id, s) => move(id, s)} />}
        {tab === "lista" && data && (data.leads.length ? <LeadList stages={stages} leads={data.leads} onOpen={openLead} /> : <p className="text-sm text-gray-400 py-8 text-center">Nenhum lead {chips.length ? "com esses filtros" : "ainda. Eles chegam pelas automações, formulários da Meta, páginas de captura, planilha ou pelo botão Novo lead"}.</p>)}
        {tab === "tarefas" && <TasksTab onOpen={openLead} />}
        {tab === "relatorios" && <CrmReports />}
        {tab === "entradas" && opts && <CrmInputs opts={opts} onImported={() => { load(); loadOpts(); }} />}
        {tab === "funis" && opts && <PipelineEditor opts={opts} onChanged={() => { loadOpts(); load(); }} />}
      </div>
      {open && opts && <LeadDrawer id={open} opts={opts} onClose={() => openLead("")} onChanged={load} onSwitch={openLead} />}
      {creating && opts && <NewLeadModal opts={opts} pipeline={pipeline?._id || ""} onClose={() => setCreating(false)} onSaved={(id, text) => { setCreating(false); setMsg({ tone: "ok", text }); load(); loadOpts(); openLead(id); }} />}
      {lost && <LostReason onCancel={() => setLost(null)} onSave={(r) => { const l = lost; setLost(null); move(l.id, l.stage, r); }} />}
    </div>
  );
}
