"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { send } from "@/components/http";
import { Card, Notice, linkBtn } from "@/components/studio/shared";
import { type Options, type PipelineT, type Stage, HelpDot, input, primary, select } from "./shared";

const KIND_PT: Record<string, string> = { open: "Em andamento", won: "Ganhou (venda)", lost: "Perdeu" };

function Editor({ p, onChanged }: { p: PipelineT; onChanged: (msg: string) => void }) {
  const [name, setName] = useState(p.name);
  const [stages, setStages] = useState<Stage[]>(p.stages.map((s) => ({ ...s })));
  const [moveTo, setMoveTo] = useState<Record<string, string>>({});
  const [ask, setAsk] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<Stage>) => setStages(stages.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const swap = (i: number, j: number) => { const n = [...stages]; [n[i], n[j]] = [n[j], n[i]]; setStages(n); };
  const removed = p.stages.filter((s) => !stages.some((x) => x.key === s.key));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await send("PUT", `/api/crm/funis/${p._id}`, { name, stages, moveTo });
    setBusy(false);
    if (r.ok) { setAsk([]); return onChanged("Etapas salvas."); }
    if (r.status === 409 && r.field === "moveTo") setAsk(removed.map((s) => s.key));
    setErr(r.error);
  }
  async function makeDefault() {
    const r = await send("PUT", `/api/crm/funis/${p._id}`, { isDefault: true });
    if (r.ok) onChanged("Funil padrão alterado.");
    else setErr(r.error);
  }
  async function remove() {
    if (!window.confirm(`Apagar o funil ${p.name}?`)) return;
    const r = await send("DELETE", `/api/crm/funis/${p._id}`);
    if (r.ok) onChanged("Funil apagado.");
    else setErr(r.error);
  }
  return (
    <Card title={p.name} hint={p.isDefault ? "Funil padrão: leads novos entram nele quando a origem não diz outro." : undefined} right={!p.isDefault ? <div className="flex gap-3"><button type="button" className={linkBtn} onClick={makeDefault}>tornar padrão</button><button type="button" className={linkBtn} onClick={remove}>apagar</button></div> : undefined}>
      <form onSubmit={save} className="space-y-3" data-testid="funil-form">
        <label className="text-xs text-gray-400 block">Nome do funil<input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
        <ol className="space-y-2">
          {stages.map((s, i) => (
            <li key={s.key + i} className="flex items-center gap-2">
              <input type="color" value={s.color || "#6b7280"} onChange={(e) => set(i, { color: e.target.value })} className="w-8 h-8 rounded bg-transparent border border-gray-700 shrink-0" aria-label={`Cor de ${s.name}`} />
              <input className={`${input} mt-0 flex-1 min-w-0`} value={s.name} onChange={(e) => set(i, { name: e.target.value })} maxLength={30} aria-label={`Nome da etapa ${i + 1}`} />
              <select className={`${select} w-36 sm:w-44`} value={s.kind} onChange={(e) => set(i, { kind: e.target.value as Stage["kind"] })} aria-label={`Tipo de ${s.name}`}>
                {Object.entries(KIND_PT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button type="button" className="p-1 text-gray-400 disabled:opacity-30" disabled={i === 0} onClick={() => swap(i, i - 1)} aria-label="Subir"><ArrowUp size={14} /></button>
              <button type="button" className="p-1 text-gray-400 disabled:opacity-30" disabled={i === stages.length - 1} onClick={() => swap(i, i + 1)} aria-label="Descer"><ArrowDown size={14} /></button>
              <button type="button" className="p-1 text-gray-500 hover:text-red-300 disabled:opacity-30" disabled={stages.length <= 1} onClick={() => setStages(stages.filter((_, j) => j !== i))} aria-label={`Remover ${s.name}`}><Trash2 size={14} /></button>
            </li>
          ))}
        </ol>
        <button type="button" className={`${linkBtn} flex items-center gap-1`} onClick={() => setStages([...stages, { key: "", name: "Nova etapa", kind: "open", color: "#6b7280" }])} disabled={stages.length >= 12}><Plus size={12} /> etapa</button>
        {ask.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
            {removed.filter((s) => ask.includes(s.key)).map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-xs text-amber-100">Leads de <b>{s.name}</b> vão para
                <select className={select} value={moveTo[s.key] || ""} onChange={(e) => setMoveTo({ ...moveTo, [s.key]: e.target.value })}>
                  <option value="">escolha...</option>
                  {stages.filter((x) => x.key).map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
        {err && <p className="text-xs text-red-400" role="alert">{err}</p>}
        <button type="submit" className={primary} disabled={busy}>{busy ? "Salvando..." : "Salvar"}</button>
      </form>
    </Card>
  );
}

export default function PipelineEditor({ opts, onChanged }: { opts: Options; onChanged: () => void }) {
  const [msg, setMsg] = useState("");
  const [newName, setNewName] = useState("");
  const [err, setErr] = useState("");
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await send("POST", "/api/crm/funis", { name: newName });
    if (!r.ok) return setErr(r.error);
    setNewName("");
    setErr("");
    setMsg("Funil criado com as etapas padrão.");
    onChanged();
  }
  return (
    <div className="space-y-3 max-w-3xl" data-testid="crm-funis">
      <p className="text-sm text-gray-300">Etapas do funil: renomeie, mude a ordem e diga quais contam como venda (Ganhou) ou perda. Etapa com lead dentro só sai depois de dizer para onde os leads vão. <HelpDot id="crm" label="Etapas do funil" /></p>
      {msg && <Notice tone="ok" onClose={() => setMsg("")}>{msg}</Notice>}
      {opts.pipelines.map((p) => <Editor key={p._id + p.stages.map((s) => s.key + s.name + s.kind).join()} p={p} onChanged={(m) => { setMsg(m); onChanged(); }} />)}
      <form onSubmit={create} className="flex gap-2 items-end">
        <label className="text-xs text-gray-400 flex-1">Outro funil (ex.: Pós-venda)<input className={input} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} /></label>
        <button type="submit" className={primary} disabled={newName.trim().length < 2}>Criar funil</button>
      </form>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}
