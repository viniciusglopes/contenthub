"use client";
/* eslint-disable react-hooks/set-state-in-effect -- sub-aba lida do link e carga inicial */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Check, Copy, FileSpreadsheet, FileInput, Megaphone, Pencil, Trash2, Upload } from "lucide-react";
import { send, fmtWhen } from "@/components/http";
import { Card, Field, Notice, linkBtn } from "@/components/studio/shared";
import { type Options, HelpDot, btn, chip, input, primary, select, setParam } from "./shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Sub = "captura" | "meta" | "planilha" | "automacao";
const SUBS: { key: Sub; label: string; icon: React.ReactNode }[] = [
  { key: "captura", label: "Página de captura", icon: <FileInput size={14} /> },
  { key: "meta", label: "Formulário da Meta", icon: <Megaphone size={14} /> },
  { key: "planilha", label: "Planilha", icon: <FileSpreadsheet size={14} /> },
  { key: "automacao", label: "Automação do direct", icon: <Bot size={14} /> },
];

function StagePicker({ opts, value, onChange }: { opts: Options; value: { pipeline: string; stage: string; owner: string; tags: string }; onChange: (v: { pipeline: string; stage: string; owner: string; tags: string }) => void }) {
  const pipe = opts.pipelines.find((p) => p._id === value.pipeline) || opts.pipelines[0];
  return (
    <div className="grid sm:grid-cols-4 gap-3">
      {opts.pipelines.length > 1 && <Field label="Funil"><select className={`${select} w-full mt-1`} value={pipe?._id} onChange={(e) => onChange({ ...value, pipeline: e.target.value, stage: "" })}>{opts.pipelines.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></Field>}
      <Field label="Etapa"><select className={`${select} w-full mt-1`} value={value.stage} onChange={(e) => onChange({ ...value, stage: e.target.value })}><option value="">{pipe?.stages.find((s) => s.kind === "open")?.name}</option>{pipe?.stages.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select></Field>
      <Field label="Responsável"><select className={`${select} w-full mt-1`} value={value.owner} onChange={(e) => onChange({ ...value, owner: e.target.value })}><option value="">Ninguém</option>{opts.team.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}</select></Field>
      <Field label="Etiquetas"><input className={input} value={value.tags} onChange={(e) => onChange({ ...value, tags: e.target.value })} placeholder="ebook, quente" /></Field>
    </div>
  );
}

function CopyBtn({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return <button type="button" className={btn} onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* sem área de transferência */ } }}>{ok ? <Check size={14} /> : <Copy size={14} />} {ok ? "Copiado" : label}</button>;
}

// ---------- página de captura ----------

interface CaptureT { _id: string; name: string; url: string; pipeline: string; stage: string; owner: string; tags: string[]; ask: string; consentText: string; defaultConsent: string; redirectUrl: string; postIgId: string; active: boolean; submissions: number; lastAt: string | null; snippet: string }

function CaptureForm({ opts, initial, onDone, onCancel }: { opts: Options; initial?: CaptureT; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ name: initial?.name || "", ask: initial?.ask || "both", consentText: initial?.consentText || "", redirectUrl: initial?.redirectUrl || "", postIgId: initial?.postIgId || "", active: initial?.active ?? true });
  const [crm, setCrm] = useState({ pipeline: initial?.pipeline || "", stage: initial?.stage || "", owner: initial?.owner || "", tags: (initial?.tags || []).join(", ") });
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  const fe = (k: string) => (err?.field === k ? err.msg : undefined);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...f, ...crm, pipeline: crm.pipeline || null };
    const r = initial ? await send("PUT", `/api/crm/capturas/${initial._id}`, body) : await send("POST", "/api/crm/capturas", body);
    if (!r.ok) return setErr({ msg: r.error, field: r.field });
    onDone();
  }
  return (
    <form onSubmit={save} className="space-y-3 border border-gray-800 rounded-xl p-3" data-testid="captura-form">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nome do formulário" error={fe("name")}><input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Página do ebook" /></Field>
        <Field label="Pedir"><select className={`${select} w-full mt-1`} value={f.ask} onChange={(e) => setF({ ...f, ask: e.target.value })}><option value="both">E-mail ou telefone</option><option value="phone">Telefone (WhatsApp)</option><option value="email">E-mail</option></select></Field>
        <Field label="Texto de consentimento (caixinha obrigatória)" className="sm:col-span-2" error={fe("consentText")}><textarea className={`${input} min-h-14`} value={f.consentText} onChange={(e) => setF({ ...f, consentText: e.target.value })} placeholder={initial?.defaultConsent || "Autorizo a {sua empresa} a guardar meus dados deste formulário e entrar em contato comigo sobre este assunto."} maxLength={600} /></Field>
        <Field label="Página de obrigado (opcional)" error={fe("redirectUrl")}><input className={input} value={f.redirectUrl} onChange={(e) => setF({ ...f, redirectUrl: e.target.value })} placeholder="https://seusite.com.br/obrigado" /></Field>
        <Field label="Id do post que divulga (opcional)" hint="liga os leads ao post no relatório" error={fe("postIgId")}><input className={input} value={f.postIgId} onChange={(e) => setF({ ...f, postIgId: e.target.value })} inputMode="numeric" /></Field>
      </div>
      <StagePicker opts={opts} value={crm} onChange={setCrm} />
      {initial && <label className="flex items-center gap-2 text-sm text-gray-200"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="accent-[var(--brand-500)]" /> Recebendo envios</label>}
      {err && !["name", "consentText", "redirectUrl", "postIgId"].includes(err.field || "") && <p className="text-xs text-red-400">{err.msg}</p>}
      <div className="flex items-center gap-3"><button type="submit" className={primary}>Salvar</button><button type="button" className={linkBtn} onClick={onCancel}>Cancelar</button></div>
    </form>
  );
}

function Captures({ opts }: { opts: Options }) {
  const [rows, setRows] = useState<CaptureT[] | null>(null);
  const [editing, setEditing] = useState<CaptureT | "new" | null>(null);
  const [show, setShow] = useState("");
  const load = useCallback(async () => {
    const r = await send<{ captures: CaptureT[] }>("GET", "/api/crm/capturas");
    setRows(r.ok && r.data ? r.data.captures : []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function remove(c: CaptureT) {
    if (!window.confirm(`Apagar o formulário "${c.name}"? Os leads que já vieram ficam.`)) return;
    await send("DELETE", `/api/crm/capturas/${c._id}`);
    load();
  }
  return (
    <div className="space-y-3" data-testid="crm-capturas">
      <p className="text-sm text-gray-300">Um formulário pronto para colar no seu site ou página de vendas. Ele guarda as UTMs do link (utm_source, utm_campaign...), pede a autorização e cria o lead no funil. <HelpDot id="crm-entradas" label="Página de captura" /></p>
      {editing ? <CaptureForm opts={opts} initial={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} /> : <button type="button" className={primary} onClick={() => setEditing("new")}>Novo formulário</button>}
      <ul className="space-y-2">
        {(rows || []).map((c) => (
          <li key={c._id} className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-gray-100 truncate">{c.name}</span>
              <span className={`${chip} ${c.active ? "bg-green-500/15 text-green-300" : "bg-gray-700 text-gray-300"}`}>{c.active ? "recebendo" : "pausado"}</span>
              <span className="text-xs text-gray-500 ml-auto whitespace-nowrap">{c.submissions} envio(s) · último {fmtWhen(c.lastAt)}</span>
              <button type="button" className="p-1 text-gray-400 hover:text-gray-100" onClick={() => setEditing(c)} aria-label={`Editar ${c.name}`}><Pencil size={14} /></button>
              {opts.canManage && <button type="button" className="p-1 text-gray-500 hover:text-red-300" onClick={() => remove(c)} aria-label={`Apagar ${c.name}`}><Trash2 size={14} /></button>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-[11px] text-gray-400 bg-gray-950 border border-gray-800 rounded px-2 py-1 truncate max-w-full">{c.url}</code>
              <CopyBtn text={c.snippet} label="Copiar HTML" />
              <button type="button" className={linkBtn} onClick={() => setShow(show === c._id ? "" : c._id)}>{show === c._id ? "esconder código" : "ver código"}</button>
            </div>
            {show === c._id && <pre className="text-[11px] text-gray-300 bg-gray-950 border border-gray-800 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">{c.snippet}</pre>}
          </li>
        ))}
        {rows && !rows.length && !editing && <li className="text-sm text-gray-500">Nenhum formulário ainda.</li>}
      </ul>
    </div>
  );
}

// ---------- formulário da Meta ----------

interface PageT { _id: string; pageId: string; name: string; active: boolean; hasToken: boolean; pipeline: string; stage: string; owner: string; tags: string[]; fieldMap: Record<string, string>; lastLeadAt: string | null; lastError: string }
interface LeadAdsT { switch: { on: boolean; message: string }; callbackPath: string; verifyTokenSet: boolean; secretSet: boolean; pages: PageT[]; events: { _id: string; pageId: string; leadgenId: string; formId: string; status: string; attempts: number; note: string; contact: string | null; createdAt: string }[] }
const EV_STATUS: Record<string, string> = { pending: "na fila", processing: "buscando", done: "no CRM", failed: "falhou" };

function PageForm({ opts, initial, onDone, onCancel }: { opts: Options; initial?: PageT; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ pageId: initial?.pageId || "", name: initial?.name || "", token: "", fieldMap: Object.entries(initial?.fieldMap || {}).map(([k, v]) => `${k}=${v}`).join("\n"), active: initial?.active ?? true });
  const [crm, setCrm] = useState({ pipeline: initial?.pipeline || "", stage: initial?.stage || "", owner: initial?.owner || "", tags: (initial?.tags || []).join(", ") });
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fe = (k: string) => (err?.field === k ? err.msg : undefined);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const fieldMap: Record<string, string> = {};
    for (const line of f.fieldMap.split("\n").map((x) => x.trim()).filter(Boolean)) {
      const i = line.indexOf("=");
      if (i < 1) return setErr({ msg: `Linha sem "=": ${line.slice(0, 40)}`, field: "fieldMap" });
      fieldMap[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    setBusy(true);
    const body = { ...f, fieldMap, ...crm, pipeline: crm.pipeline || null };
    const r = initial ? await send("PUT", `/api/crm/lead-ads/paginas/${initial._id}`, body) : await send("POST", "/api/crm/lead-ads/paginas", body);
    setBusy(false);
    if (!r.ok) return setErr({ msg: r.error, field: r.field });
    onDone();
  }
  return (
    <form onSubmit={save} className="space-y-3 border border-gray-800 rounded-xl p-3" data-testid="leadads-form">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Id da Página do Facebook" error={fe("pageId")}><input className={input} value={f.pageId} onChange={(e) => setF({ ...f, pageId: e.target.value })} disabled={Boolean(initial)} inputMode="numeric" placeholder="1234567890" /></Field>
        <Field label="Nome (opcional)"><input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={initial ? "Token da Página (só se for trocar)" : "Token da Página"} hint="permissão leads_retrieval; fica criptografado" className="sm:col-span-2" error={fe("token")}><input className={input} value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} type="password" autoComplete="off" /></Field>
        <Field label="Campos do formulário (opcional: um por linha, campo=destino)" hint="destinos: name, email, phone, ignore ou field:nome" className="sm:col-span-2" error={fe("fieldMap")}><textarea className={`${input} min-h-14 font-mono text-xs`} value={f.fieldMap} onChange={(e) => setF({ ...f, fieldMap: e.target.value })} placeholder={"qual_o_seu_whatsapp=phone\ncidade=field:cidade"} /></Field>
      </div>
      <StagePicker opts={opts} value={crm} onChange={setCrm} />
      {initial && <label className="flex items-center gap-2 text-sm text-gray-200"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="accent-[var(--brand-500)]" /> Receber leads desta Página</label>}
      {err && !["pageId", "token", "fieldMap"].includes(err.field || "") && <p className="text-xs text-red-400">{err.msg}</p>}
      <div className="flex items-center gap-3"><button type="submit" className={primary} disabled={busy}>{busy ? "Conferindo o token..." : "Salvar"}</button><button type="button" className={linkBtn} onClick={onCancel}>Cancelar</button></div>
    </form>
  );
}

function MetaLeadAds({ opts }: { opts: Options }) {
  const [d, setD] = useState<LeadAdsT | null>(null);
  const [editing, setEditing] = useState<PageT | "new" | null>(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const r = await send<LeadAdsT>("GET", "/api/crm/lead-ads");
    if (r.ok && r.data) setD(r.data);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function run() {
    const r = await send<any>("POST", "/api/crm/lead-ads/processar");
    setMsg(r.ok ? (r.data?.enabled === false ? r.data.message : `Processados: ${r.data?.processed ?? 0}.`) : r.error);
    load();
  }
  async function remove(p: PageT) {
    if (!window.confirm(`Tirar a Página ${p.name || p.pageId} do CRM? Os leads que já vieram ficam.`)) return;
    await send("DELETE", `/api/crm/lead-ads/paginas/${p._id}`);
    load();
  }
  if (!d) return <p className="text-sm text-gray-400">Carregando...</p>;
  const callback = `${typeof window !== "undefined" ? window.location.origin : ""}${d.callbackPath}`;
  return (
    <div className="space-y-3" data-testid="crm-leadads">
      {!d.switch.on && <Notice tone="info">{d.switch.message}</Notice>}
      <Card title="Ligar na Meta" right={<HelpDot id="meta-lead-ads" label="Passo a passo na Meta" />}>
        <dl className="grid grid-cols-[9rem_1fr] gap-y-1.5 text-xs items-center">
          <dt className="text-gray-500">URL de callback</dt><dd className="flex items-center gap-2 min-w-0"><code className="truncate text-gray-200">{callback}</code><CopyBtn text={callback} /></dd>
          <dt className="text-gray-500">Objeto e campo</dt><dd className="text-gray-200">Page › leadgen</dd>
          <dt className="text-gray-500">Token de verificação</dt><dd className={d.verifyTokenSet ? "text-green-300" : "text-gray-400"}>{d.verifyTokenSet ? "configurado no servidor (peça ao suporte)" : "ainda não configurado no servidor"}</dd>
          <dt className="text-gray-500">Chave secreta do app</dt><dd className={d.secretSet ? "text-green-300" : "text-gray-400"}>{d.secretSet ? "configurada" : "ainda não configurada no servidor"}</dd>
        </dl>
      </Card>
      {opts.canManage && (editing ? <PageForm opts={opts} initial={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} /> : <button type="button" className={primary} onClick={() => setEditing("new")}>Cadastrar Página</button>)}
      <ul className="space-y-2">
        {d.pages.map((p) => (
          <li key={p._id} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-100 truncate">{p.name || p.pageId}</span>
            <span className="text-xs text-gray-500">{p.pageId}</span>
            <span className={`${chip} ${p.active ? "bg-green-500/15 text-green-300" : "bg-gray-700 text-gray-300"}`}>{p.active ? "ativa" : "pausada"}</span>
            {p.lastError && <span className={`${chip} bg-red-500/15 text-red-300 truncate max-w-[50%]`} title={p.lastError}>{p.lastError}</span>}
            <span className="text-xs text-gray-500 ml-auto">último lead {fmtWhen(p.lastLeadAt)}</span>
            {opts.canManage && <button type="button" className="p-1 text-gray-400 hover:text-gray-100" onClick={() => setEditing(p)} aria-label={`Editar ${p.name}`}><Pencil size={14} /></button>}
            {opts.canManage && <button type="button" className="p-1 text-gray-500 hover:text-red-300" onClick={() => remove(p)} aria-label={`Tirar ${p.name}`}><Trash2 size={14} /></button>}
          </li>
        ))}
        {!d.pages.length && !editing && <li className="text-sm text-gray-500">Nenhuma Página cadastrada.</li>}
      </ul>
      {d.events.length > 0 && (
        <Card title="Últimos avisos da Meta" right={<button type="button" className={linkBtn} onClick={run}>processar agora</button>}>
          {msg && <p className="text-xs text-gray-400 mb-2">{msg}</p>}
          <ul className="text-xs divide-y divide-gray-800">
            {d.events.map((e) => <li key={e._id} className="py-1.5 flex items-center gap-2 min-w-0"><span className="text-gray-400 whitespace-nowrap">{fmtWhen(e.createdAt)}</span><span className={`${chip} ${e.status === "done" ? "bg-green-500/15 text-green-300" : e.status === "failed" ? "bg-red-500/15 text-red-300" : "bg-gray-700 text-gray-300"}`}>{EV_STATUS[e.status] || e.status}</span><span className="truncate text-gray-300" title={e.note}>{e.note || `lead ${e.leadgenId}`}</span></li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ---------- planilha ----------

const TARGETS = [["ignore", "Ignorar"], ["name", "Nome"], ["email", "E-mail"], ["phone", "Telefone"], ["username", "Instagram (@)"], ["tags", "Etiquetas"], ["value", "Valor"], ["stage", "Etapa"], ["utm_source", "utm_source"], ["utm_medium", "utm_medium"], ["utm_campaign", "utm_campaign"], ["utm_content", "utm_content"], ["utm_term", "utm_term"]];
interface Preview { header: string[]; mapping: string[]; counts: Record<string, number>; preview: { line: number; status: string; message: string; name: string; email: string; phone: string; existing?: { display: string } }[]; committed: boolean; result?: { created: number; updated: number; failed: number } }
const ROW_TONE: Record<string, string> = { new: "bg-green-500/15 text-green-300", update: "bg-sky-500/15 text-sky-200", dup_file: "bg-gray-700 text-gray-300", invalid: "bg-red-500/15 text-red-300" };
const ROW_PT: Record<string, string> = { new: "novo", update: "já existe", dup_file: "repetida", invalid: "inválida" };

function Importer({ opts, onImported }: { opts: Options; onImported: () => void }) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<string[]>([]);
  const [crm, setCrm] = useState({ pipeline: "", stage: "", owner: "", tags: "" });
  const [consent, setConsent] = useState(false);
  const [basis, setBasis] = useState("");
  const [p, setP] = useState<Preview | null>(null);
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(commit: boolean, map = mapping) {
    setBusy(true);
    setErr(null);
    const r = await send<Preview>("POST", "/api/crm/importar", { csv, fileName, mapping: map.length ? map : undefined, consent, consentBasis: basis, ...crm, pipeline: crm.pipeline || null, commit });
    setBusy(false);
    if (!r.ok || !r.data) return setErr({ msg: r.error, field: r.field });
    setP(r.data);
    setMapping(r.data.mapping);
    if (commit) onImported();
  }
  async function pickFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) return setErr({ msg: "Arquivo grande demais (máximo 2 MB)." });
    const text = await f.text();
    setCsv(text);
    setFileName(f.name);
    setMapping([]);
    setP(null);
  }
  useEffect(() => { if (csv) run(false, []); }, [csv]); // eslint-disable-line react-hooks/exhaustive-deps
  const fe = (k: string) => (err?.field === k ? err.msg : undefined);
  return (
    <div className="space-y-3" data-testid="crm-importar">
      <p className="text-sm text-gray-300">CSV com cabeçalho (vírgula ou ponto e vírgula). Primeiro mostramos o que vai acontecer em cada linha; nada é gravado antes de você confirmar. <HelpDot id="crm-entradas" label="Importar planilha" /></p>
      <label className={`${btn} w-fit cursor-pointer`}><Upload size={14} /> {fileName || "Escolher arquivo CSV"}<input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} /></label>
      {err && <Notice tone="bad" onClose={() => setErr(null)}>{err.msg}</Notice>}
      {p && (
        <>
          <Card title="Colunas">
            <div className="grid sm:grid-cols-3 gap-2">
              {p.header.map((h, i) => (
                <label key={i} className="text-xs text-gray-400 min-w-0">{h || `coluna ${i + 1}`}
                  <select className={`${select} w-full mt-0.5`} value={mapping[i]} onChange={(e) => { const m = [...mapping]; m[i] = e.target.value; setMapping(m); }}>
                    {TARGETS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    {!TARGETS.some(([k]) => k === mapping[i]) && <option value={mapping[i]}>Campo: {mapping[i]?.replace("field:", "")}</option>}
                  </select>
                </label>
              ))}
            </div>
            <button type="button" className={`${linkBtn} mt-2`} onClick={() => run(false)} disabled={busy}>atualizar a prévia</button>
          </Card>
          <StagePicker opts={opts} value={crm} onChange={setCrm} />
          <div className="rounded-lg border border-gray-800 p-3 space-y-2">
            <label className="flex items-start gap-2 text-sm text-gray-200"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 accent-[var(--brand-500)]" /> Essas pessoas autorizaram receber contato (guardar e-mail e telefone)</label>
            <Field label="De onde vieram e como autorizaram" error={fe("consentBasis")}><input className={input} value={basis} onChange={(e) => setBasis(e.target.value)} placeholder="Ex.: inscritos no evento de 10/10, com aceite no formulário" /></Field>
            {!consent && <p className="text-[11px] text-gray-500">Sem marcar, a planilha entra sem e-mail e telefone (só nome, @, etiquetas e campos).</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="crm-importar-resumo">
            <span className={`${chip} ${ROW_TONE.new}`}>{p.counts.new} novo(s)</span>
            <span className={`${chip} ${ROW_TONE.update}`}>{p.counts.update} já existe(m)</span>
            {p.counts.dup_file > 0 && <span className={`${chip} ${ROW_TONE.dup_file}`}>{p.counts.dup_file} repetida(s)</span>}
            {p.counts.invalid > 0 && <span className={`${chip} ${ROW_TONE.invalid}`}>{p.counts.invalid} inválida(s)</span>}
            <span className="text-gray-500">de {p.counts.total} linha(s)</span>
          </div>
          <div className="overflow-x-auto bg-gray-900 border border-gray-800 rounded-xl max-h-80">
            <table className="w-full text-xs min-w-[640px]">
              <thead className="text-gray-400 text-left sticky top-0 bg-gray-900"><tr className="border-b border-gray-800"><th className="py-1.5 px-2 font-medium">Linha</th><th className="py-1.5 px-2 font-medium">Situação</th><th className="py-1.5 px-2 font-medium">Nome</th><th className="py-1.5 px-2 font-medium">Contato</th><th className="py-1.5 px-2 font-medium">O que acontece</th></tr></thead>
              <tbody>
                {p.preview.map((r) => (
                  <tr key={r.line} className="border-b border-gray-800/60">
                    <td className="py-1.5 px-2 text-gray-500">{r.line}</td>
                    <td className="py-1.5 px-2"><span className={`${chip} ${ROW_TONE[r.status]}`}>{ROW_PT[r.status]}</span></td>
                    <td className="py-1.5 px-2 max-w-[160px] truncate">{r.name || "–"}</td>
                    <td className="py-1.5 px-2 max-w-[180px] truncate">{r.email || r.phone || "–"}</td>
                    <td className="py-1.5 px-2 max-w-[320px] truncate text-gray-400" title={r.message}>{r.existing ? `${r.existing.display}: ` : ""}{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.result ? (
            <Notice tone="ok">Importado: {p.result.created} novo(s), {p.result.updated} atualizado(s){p.result.failed ? `, ${p.result.failed} com erro` : ""}.</Notice>
          ) : (
            <button type="button" className={primary} disabled={busy || !(p.counts.new + p.counts.update)} onClick={() => run(true)} data-testid="crm-importar-confirmar">{busy ? "Importando..." : `Importar ${p.counts.new + p.counts.update} lead(s)`}</button>
          )}
        </>
      )}
    </div>
  );
}

export default function CrmInputs({ opts, onImported }: { opts: Options; onImported: () => void }) {
  const [sub, setSubState] = useState<Sub>("captura");
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("entrada") as Sub | null;
    if (s && SUBS.some((x) => x.key === s)) setSubState(s);
  }, []);
  const setSub = (s: Sub) => { setSubState(s); setParam("entrada", s === "captura" ? null : s); };
  return (
    <div className="space-y-3 max-w-4xl">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Por onde o lead entra">
        {SUBS.map((s) => <button key={s.key} type="button" role="tab" aria-selected={sub === s.key} onClick={() => setSub(s.key)} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border whitespace-nowrap ${sub === s.key ? "border-brand-500 text-brand-400 bg-brand-500/10 font-semibold" : "border-gray-700 text-gray-300 hover:border-gray-500"}`}>{s.icon}{s.label}</button>)}
      </div>
      {sub === "captura" && <Captures opts={opts} />}
      {sub === "meta" && <MetaLeadAds opts={opts} />}
      {sub === "planilha" && <Importer opts={opts} onImported={onImported} />}
      {sub === "automacao" && (
        <Card title="Automação do direct">
          <p className="text-sm text-gray-300">Na automação (menu Automações), ligue o passo <b>Enviar para o CRM</b> e escolha a etapa, o responsável e as etiquetas. Quem comentar a palavra ou mandar a mensagem vira lead, com a automação e o post como origem. Quem chega por anúncio que abre o direct ou por link ig.me também fica marcado com a origem.</p>
          {/* a casca lê ?view= só ao abrir: navegação completa para trocar de tela */}
          <Link href="/?view=automacoes" prefetch={false} onClick={(e) => { e.preventDefault(); window.location.assign("/?view=automacoes"); }} className={`${btn} w-fit mt-3`}><Bot size={14} /> Abrir Automações</Link>
        </Card>
      )}
    </div>
  );
}
