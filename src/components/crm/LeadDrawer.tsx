"use client";
/* eslint-disable react-hooks/set-state-in-effect -- carga do lead ao abrir */

import { Fragment, useCallback, useEffect, useState } from "react";
import { AlarmClock, Bot, Download, GitMerge, Megaphone, MessageSquare, MousePointerClick, Pencil, Shield, StickyNote, Trash2, X, ArrowRightLeft, FileInput, UserRound, Inbox } from "lucide-react";
import { send, fmtWhen } from "@/components/http";
import { Field, linkBtn } from "@/components/studio/shared";
import { type LeadT, type Options, type TaskT, type TeamUser, HelpDot, SOURCE_TONE, chip, input, moneyFull, primary, select } from "./shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface EventT { _id: string; kind: string; at: string; text: string; byName: string; data: any }
interface Detail {
  lead: LeadT; events: EventT[]; tasks: TaskT[]; team: TeamUser[];
  consents: { action: string; channel: string; fields: string; text: string; version: string; basis: string; at: string }[];
  duplicates: { _id: string; display: string; email: string; phone: string; lead: boolean }[];
}
type Pane = "tempo" | "tarefas" | "dados" | "origem" | "lgpd";

const EVENT_ICON: Record<string, React.ReactNode> = {
  note: <StickyNote size={13} />, stage: <ArrowRightLeft size={13} />, automation: <Bot size={13} />, message: <MessageSquare size={13} />, click: <MousePointerClick size={13} />,
  referral: <Megaphone size={13} />, lead_ads: <Megaphone size={13} />, capture: <FileInput size={13} />, import: <FileInput size={13} />, task: <AlarmClock size={13} />,
  owner: <UserRound size={13} />, merge: <GitMerge size={13} />, created: <Inbox size={13} />, manual: <Inbox size={13} />, edit: <Pencil size={13} />, value: <Pencil size={13} />,
};
const CONSENT_PT: Record<string, string> = { given: "autorizou", refused: "recusou", revoked: "revogou", erased: "apagado", exported: "dados exportados" };
const CHANNEL_PT: Record<string, string> = { dm: "direct", meta_lead_form: "formulário da Meta", landing: "página de captura", manual: "informado pela equipe", import: "planilha" };

function Timeline({ d, onNote }: { d: Detail; onNote: (t: string) => Promise<boolean> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3" data-testid="lead-tempo">
      <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; setBusy(true); if (await onNote(note)) setNote(""); setBusy(false); }}>
        <input className={`${input} mt-0`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Escrever uma nota..." aria-label="Nota" maxLength={2000} />
        <button type="submit" className={primary} disabled={busy || !note.trim()}>Anotar</button>
      </form>
      <ol className="relative border-l border-gray-800 ml-2 space-y-3">
        {d.events.map((e) => (
          <li key={e._id} className="ml-4">
            <span className="absolute -left-[9px] mt-0.5 w-[18px] h-[18px] rounded-full bg-gray-800 border border-gray-700 grid place-items-center text-gray-300">{EVENT_ICON[e.kind] || <Inbox size={12} />}</span>
            <p className={`text-sm ${e.kind === "note" ? "text-gray-100 whitespace-pre-wrap" : "text-gray-300"}`}>{e.text}</p>
            <p className="text-[11px] text-gray-500">{fmtWhen(e.at)}{e.byName ? ` · ${e.byName}` : ""}</p>
          </li>
        ))}
        {!d.events.length && <li className="ml-4 text-xs text-gray-500">Nada ainda.</li>}
      </ol>
    </div>
  );
}

function Tasks({ d, reload }: { d: Detail; reload: () => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [err, setErr] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const r = await send("POST", `/api/crm/leads/${d.lead._id}/tarefas`, { title, dueAt: due ? new Date(due).toISOString() : null });
    if (!r.ok) return setErr(r.error);
    setTitle("");
    setDue("");
    reload();
  }
  async function toggle(t: TaskT) {
    await send("PUT", `/api/crm/tarefas/${t._id}`, { done: !t.done });
    reload();
  }
  async function remove(t: TaskT) {
    await send("DELETE", `/api/crm/tarefas/${t._id}`);
    reload();
  }
  return (
    <div className="space-y-3" data-testid="lead-tarefas">
      <form onSubmit={add} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_12rem_auto] gap-2 items-end">
        <Field label="Tarefa / lembrete"><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ligar para mandar a proposta" maxLength={200} /></Field>
        <Field label="Quando" className="hidden sm:block"><input type="datetime-local" className={`${input} [color-scheme:dark]`} value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <button type="submit" className={primary} disabled={!title.trim()}>Criar</button>
        <input type="datetime-local" aria-label="Quando" className={`${input} [color-scheme:dark] sm:hidden col-span-2`} value={due} onChange={(e) => setDue(e.target.value)} />
      </form>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <ul className="divide-y divide-gray-800 border border-gray-800 rounded-lg">
        {d.tasks.map((t) => (
          <li key={t._id} className="flex items-center gap-2 px-3 py-2">
            <input type="checkbox" checked={t.done} onChange={() => toggle(t)} aria-label={`Concluir ${t.title}`} className="accent-[var(--brand-500)]" />
            <span className={`flex-1 text-sm truncate ${t.done ? "line-through text-gray-500" : "text-gray-100"}`} title={t.title}>{t.title}</span>
            <span className={`text-xs whitespace-nowrap ${t.overdue ? "text-red-300" : "text-gray-500"}`}>{t.dueAt ? fmtWhen(t.dueAt) : ""}</span>
            <button type="button" onClick={() => remove(t)} className="p-1 text-gray-500 hover:text-red-300" aria-label={`Apagar ${t.title}`}><Trash2 size={13} /></button>
          </li>
        ))}
        {!d.tasks.length && <li className="px-3 py-3 text-xs text-gray-500">Nenhuma tarefa.</li>}
      </ul>
    </div>
  );
}

function DataForm({ d, onSaved }: { d: Detail; onSaved: (msg: string) => void }) {
  const l = d.lead;
  const [f, setF] = useState({ name: l.name, email: l.email, phone: l.phone, tags: l.tags.join(", "), fields: Object.entries(l.fields).map(([k, v]) => `${k}=${v}`).join("\n"), consent: false, consentBasis: "" });
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const contactChanged = (f.email.trim() && f.email.trim() !== l.email) || (f.phone.trim() && f.phone.trim() !== l.phone);
  const needsConsent = contactChanged && !l.consent.given;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const obj: Record<string, string> = {};
    for (const line of f.fields.split("\n").map((x) => x.trim()).filter(Boolean)) {
      const i = line.indexOf("=");
      if (i < 1) return setErr({ msg: `Linha sem "=": ${line.slice(0, 40)}`, field: "fields" });
      obj[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    setBusy(true);
    const r = await send("PUT", `/api/crm/leads/${l._id}`, { name: f.name, email: f.email, phone: f.phone, tags: f.tags, fields: obj, consent: f.consent, consentBasis: f.consentBasis });
    setBusy(false);
    if (!r.ok) return setErr({ msg: r.error, field: r.field });
    setErr(null);
    onSaved("Dados salvos.");
  }
  const fe = (k: string) => (err?.field === k ? err.msg : undefined);
  return (
    <form onSubmit={save} className="space-y-3" data-testid="lead-dados">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nome"><input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Instagram"><input className={`${input} opacity-70`} value={l.username ? `@${l.username}` : "–"} readOnly /></Field>
        <Field label="WhatsApp / telefone" error={fe("phone")}><input className={input} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" /></Field>
        <Field label="E-mail" error={fe("email")}><input className={input} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} inputMode="email" /></Field>
      </div>
      {needsConsent && (
        <div className="rounded-lg border border-gray-800 p-3 space-y-2">
          <label className="flex items-start gap-2 text-sm text-gray-200"><input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} className="mt-1 accent-[var(--brand-500)]" /> A pessoa autorizou guardar este contato</label>
          {fe("consent") && <p className="text-xs text-red-400">{fe("consent")}</p>}
          <Field label="Como autorizou"><input className={input} value={f.consentBasis} onChange={(e) => setF({ ...f, consentBasis: e.target.value })} placeholder="Ex.: mandou o e-mail pelo direct pedindo o material" /></Field>
        </div>
      )}
      <Field label="Etiquetas (vírgula)" error={fe("tags")}><input className={input} value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
      <Field label="Campos (um por linha: nome=valor)" error={fe("fields")}><textarea className={`${input} min-h-20 font-mono text-xs`} value={f.fields} onChange={(e) => setF({ ...f, fields: e.target.value })} placeholder="cidade=Sorocaba" /></Field>
      {err && !["phone", "email", "consent", "tags", "fields"].includes(err.field || "") && <p className="text-xs text-red-400" role="alert">{err.msg}</p>}
      <button type="submit" className={primary} disabled={busy}>{busy ? "Salvando..." : "Salvar"}</button>
    </form>
  );
}

function TouchBox({ title, t }: { title: string; t: LeadT["firstTouch"] }) {
  if (!t?.kind) return <div className="rounded-lg border border-gray-800 p-3"><p className="text-xs text-gray-500">{title}: –</p></div>;
  const rows: [string, string][] = [["Quando", fmtWhen(t.at)], ["Por onde", t.label || t.kind], ["Campanha", t.campaignId], ["Conjunto", t.adsetId], ["Anúncio", t.adId], ["Formulário", t.formId], ["Post", t.postIgId], ...Object.entries(t.utm || {}).filter(([, v]) => v).map(([k, v]) => [`utm_${k}`, String(v)] as [string, string])];
  return (
    <div className="rounded-lg border border-gray-800 p-3">
      <p className="text-xs font-semibold text-gray-300 mb-1">{title}</p>
      <dl className="grid grid-cols-[6.5rem_1fr] gap-y-0.5 text-xs">
        {rows.filter(([, v]) => v).map(([k, v]) => <Fragment key={k}><dt className="text-gray-500">{k}</dt><dd className="text-gray-200 truncate" title={v}>{v}</dd></Fragment>)}
      </dl>
    </div>
  );
}

export default function LeadDrawer({ id, opts, onClose, onChanged, onSwitch }: { id: string; opts: Options; onClose: () => void; onChanged: () => void; onSwitch: (id: string) => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [pane, setPane] = useState<Pane>("tempo");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [value, setValue] = useState("");
  const [lostReason, setLostReason] = useState("");
  const load = useCallback(async () => {
    const r = await send<Detail>("GET", `/api/crm/leads/${id}`);
    if (!r.ok || !r.data) return setErr(r.error || "Lead não encontrado.");
    setD(r.data);
    setValue(r.data.lead.value == null ? "" : String(r.data.lead.value).replace(".", ","));
    setLostReason(r.data.lead.lostReason || "");
  }, [id]);
  useEffect(() => { setD(null); setErr(""); setOk(""); load(); }, [load]);

  async function put(body: Record<string, unknown>, okMsg = "") {
    setErr("");
    const r = await send<Detail>("PUT", `/api/crm/leads/${id}`, body);
    if (!r.ok || !r.data) { setErr(r.error); return false; }
    setD(r.data);
    setOk(okMsg);
    onChanged();
    return true;
  }
  const pipeline = opts.pipelines.find((p) => p._id === d?.lead.pipeline) || opts.pipelines[0];
  const stage = pipeline?.stages.find((s) => s.key === d?.lead.stage);

  async function merge(other: string) {
    if (!window.confirm("Juntar os dois cadastros? O outro some e tudo dele (linha do tempo, tarefas, consentimentos) passa para este.")) return;
    const r = await send<Detail>("POST", `/api/crm/leads/${id}/mesclar`, { other });
    if (!r.ok || !r.data) return setErr(r.error);
    onChanged();
    if (r.data.lead._id !== id) onSwitch(r.data.lead._id);
    else { setD(r.data); setOk("Cadastros juntados."); }
  }
  async function erase() {
    if (!window.confirm(`Excluir ${d?.lead.display} e tudo que foi guardado (pedido de exclusão, LGPD)? Não dá para desfazer.`)) return;
    const r = await send("DELETE", `/api/crm/leads/${id}`);
    if (!r.ok) return setErr(r.error);
    onChanged();
    onClose();
  }

  const PANES: { key: Pane; label: string }[] = [{ key: "tempo", label: "Linha do tempo" }, { key: "tarefas", label: `Tarefas${d?.tasks.filter((t) => !t.done).length ? ` (${d.tasks.filter((t) => !t.done).length})` : ""}` }, { key: "dados", label: "Dados" }, { key: "origem", label: "Origem" }, { key: "lgpd", label: "LGPD" }];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside className="w-full sm:max-w-xl h-full bg-gray-950 border-l border-gray-800 flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Lead" data-testid="lead-drawer">
        <header className="p-4 border-b border-gray-800 space-y-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold text-white truncate">{d?.lead.display || "Carregando..."}</h3>
              {d && <p className="text-xs text-gray-400 truncate">{[d.lead.username && `@${d.lead.username}`, d.lead.phone, d.lead.email].filter(Boolean).join(" · ") || "sem contato guardado"}</p>}
            </div>
            {d && <span className={`${chip} ${SOURCE_TONE[d.lead.source] || "bg-gray-700 text-gray-300"}`}>{d.lead.sourceLabel}</span>}
            <button type="button" onClick={onClose} className="p-1 hover:bg-gray-800 rounded" aria-label="Fechar"><X size={18} /></button>
          </div>
          {d && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <label className="text-[11px] text-gray-500">Etapa
                <select className={`${select} w-full mt-0.5`} value={d.lead.stage} onChange={(e) => put({ stage: e.target.value, pipeline: pipeline?._id }, "Etapa alterada.")} data-testid="lead-etapa">
                  {pipeline?.stages.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-gray-500">Responsável
                <select className={`${select} w-full mt-0.5`} value={d.lead.owner || ""} onChange={(e) => put({ owner: e.target.value || null }, "Responsável alterado.")}>
                  <option value="">Ninguém</option>
                  {d.team.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
                </select>
              </label>
              <form className="text-[11px] text-gray-500 col-span-2 sm:col-span-1" onSubmit={(e) => { e.preventDefault(); put({ value: value || null }, "Valor salvo."); }}>Valor (R$)
                <div className="flex gap-1 mt-0.5"><input className={`${select} w-full`} value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0,00" aria-label="Valor" /><button type="submit" className="px-2 rounded-lg border border-gray-700 text-gray-200 text-xs hover:bg-gray-800">Salvar</button></div>
              </form>
            </div>
          )}
          {d && stage?.kind === "lost" && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); put({ lostReason }, "Motivo salvo."); }}>
              <input className={`${input} mt-0`} value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="Motivo da perda" aria-label="Motivo da perda" maxLength={200} />
              <button type="submit" className="px-3 rounded-lg border border-gray-700 text-gray-200 text-sm hover:bg-gray-800">Salvar</button>
            </form>
          )}
          {d && d.duplicates.length > 0 && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2 text-xs text-amber-100 space-y-1" data-testid="lead-duplicado">
              <p>Parece a mesma pessoa:</p>
              {d.duplicates.map((x) => (
                <div key={x._id} className="flex items-center gap-2">
                  <button type="button" className="underline truncate" onClick={() => onSwitch(x._id)}>{x.display}</button>
                  <span className="text-amber-200/70 truncate">{x.email || x.phone}</span>
                  <button type="button" className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded border border-amber-400/40 hover:bg-amber-500/20" onClick={() => merge(x._id)}><GitMerge size={11} /> Juntar</button>
                </div>
              ))}
            </div>
          )}
          {err && <p className="text-xs text-red-400" role="alert">{err}</p>}
          {ok && <p className="text-xs text-green-400" role="status">{ok}</p>}
        </header>
        {d && (
          <>
            <nav className="flex gap-1 px-3 pt-2 border-b border-gray-800 overflow-x-auto" aria-label="Seções do lead">
              {PANES.map((p) => <button key={p.key} type="button" onClick={() => setPane(p.key)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 ${pane === p.key ? "border-brand-500 text-white" : "border-transparent text-gray-400 hover:text-gray-200"}`}>{p.label}</button>)}
            </nav>
            <div className="flex-1 overflow-y-auto p-4">
              {pane === "tempo" && <Timeline d={d} onNote={async (text) => { const r = await send("POST", `/api/crm/leads/${id}/notas`, { text }); if (!r.ok) { setErr(r.error); return false; } await load(); return true; }} />}
              {pane === "tarefas" && <Tasks d={d} reload={() => { load(); onChanged(); }} />}
              {pane === "dados" && <DataForm key={d.lead._id + (d.events[0]?._id || "")} d={d} onSaved={(m) => { setOk(m); load(); onChanged(); }} />}
              {pane === "origem" && (
                <div className="space-y-3" data-testid="lead-origem">
                  <p className="text-sm text-gray-300">Entrou por <b>{d.lead.sourceLabel || "–"}</b>{d.lead.origin?.label ? ` (${d.lead.origin.label})` : ""} em {fmtWhen(d.lead.leadAt, "–")}. <HelpDot id="crm-relatorios" label="Primeiro e último toque" /></p>
                  <div className="grid sm:grid-cols-2 gap-2"><TouchBox title="Primeiro toque" t={d.lead.firstTouch} /><TouchBox title="Último toque" t={d.lead.lastTouch} /></div>
                  {d.lead.value != null && <p className="text-xs text-gray-400">Valor do negócio: {moneyFull(d.lead.value)}</p>}
                </div>
              )}
              {pane === "lgpd" && (
                <div className="space-y-3" data-testid="lead-lgpd">
                  <p className="text-sm text-gray-300 flex items-center gap-2"><Shield size={14} /> Consentimento: {d.lead.consent.given ? <span className="text-green-300">autorizou em {fmtWhen(d.lead.consent.at)} ({CHANNEL_PT[d.lead.consent.channel] || d.lead.consent.channel || "–"})</span> : <span className="text-gray-400">sem autorização registrada (e-mail e telefone não são guardados)</span>} <HelpDot id="contatos-e-lgpd" label="Consentimento e LGPD" /></p>
                  {d.lead.consent.text && <p className="text-xs text-gray-400 border-l border-gray-700 pl-2">{d.lead.consent.text}</p>}
                  <ul className="text-xs space-y-1">
                    {d.consents.map((c, i) => <li key={i} className="text-gray-300">{fmtWhen(c.at)} · {CONSENT_PT[c.action] || c.action}{c.fields ? ` (${c.fields.replace("phone", "telefone")})` : ""} · {CHANNEL_PT[c.channel] || c.channel}{c.basis ? ` · ${c.basis}` : ""}</li>)}
                    {!d.consents.length && <li className="text-gray-500">Nenhum registro.</li>}
                  </ul>
                  {opts.canManage ? (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800">
                      <a className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-gray-700 text-gray-200 hover:bg-gray-800" href={`/api/crm/leads/${id}/exportar`} download onClick={() => setTimeout(load, 800)}><Download size={14} /> Exportar dados da pessoa</a>
                      <button type="button" onClick={erase} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-red-500/40 text-red-300 hover:bg-red-500/10"><Trash2 size={14} /> Excluir a pedido</button>
                    </div>
                  ) : <p className="text-xs text-gray-500">Exportar e excluir a pedido: só o dono da conta.</p>}
                  {d.lead.lead && <button type="button" className={linkBtn} onClick={() => put({ lead: false }, "Saiu do funil.")}>Tirar do funil (continua em Contatos)</button>}
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
