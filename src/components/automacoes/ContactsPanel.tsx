"use client";
/* eslint-disable react-hooks/set-state-in-effect -- filtros lidos do link e carga inicial */

import { useCallback, useEffect, useState } from "react";
import { Download, Search, Trash2, X } from "lucide-react";
import { send, fmtWhen } from "@/components/http";
import { Field, Notice, linkBtn } from "@/components/studio/shared";
import { HelpDot } from "./AutomationsPanel";

interface ContactT {
  _id: string; account: string; igsid: string; username: string; tags: string[]; fields: Record<string, string>; email: string; phone: string;
  consent: { given: boolean; at: string | null; version: string; text: string; refusedAt: string | null };
  optOutAt: string | null; source: string; firstSeenAt: string; lastInboundAt: string | null; windowOpen: boolean;
}
interface ProjectOpt { _id: string; name: string; icon?: string }

const input = "block w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 mt-1";
const primary = "bg-brand-500 text-brand-ink px-4 py-2 rounded-lg font-semibold text-sm hover:bg-brand-400 transition disabled:opacity-60";
const chip = "text-[11px] px-1.5 py-0.5 rounded whitespace-nowrap";
const SOURCE_PT: Record<string, string> = { comment: "comentário", dm: "direct", postback: "botão" };

function ContactModal({ c, canManage, onClose, onChanged }: { c: ContactT; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const [tags, setTags] = useState(c.tags.join(", "));
  const [fields, setFields] = useState(Object.entries(c.fields).map(([k, v]) => `${k}=${v}`).join("\n"));
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const obj: Record<string, string> = {};
    for (const line of fields.split("\n").map((l) => l.trim()).filter(Boolean)) {
      const i = line.indexOf("=");
      if (i < 1) return setErr({ msg: `Linha sem "=": ${line.slice(0, 40)}`, field: "fields" });
      obj[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    setBusy(true);
    const r = await send("PUT", `/api/contatos/${c._id}`, { tags, fields: obj });
    setBusy(false);
    if (!r.ok) return setErr({ msg: r.error, field: r.field });
    onChanged();
  }
  async function erase() {
    if (!window.confirm(`Excluir @${c.username || c.igsid} e tudo que foi guardado dele? (pedido de exclusão, LGPD). Não dá para desfazer.`)) return;
    const r = await send("DELETE", `/api/contatos/${c._id}`);
    if (!r.ok) return setErr({ msg: r.error });
    onChanged();
  }
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-t-2xl sm:rounded-2xl max-w-lg w-full max-h-[92vh] overflow-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Contato" data-testid="contato-modal">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h3 className="font-bold text-white truncate">@{c.username || c.igsid}</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-800 rounded" aria-label="Fechar"><X size={18} /></button>
        </div>
        <form onSubmit={save} className="p-4 space-y-3">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-xs">
            <dt className="text-gray-500">E-mail</dt><dd className="text-gray-200 truncate">{c.email || "–"}</dd>
            <dt className="text-gray-500">Telefone</dt><dd className="text-gray-200">{c.phone || "–"}</dd>
            <dt className="text-gray-500">Consentimento</dt>
            <dd className="text-gray-200">{c.consent.given ? `sim, em ${fmtWhen(c.consent.at)} (texto ${c.consent.version})` : c.consent.refusedAt ? `recusou em ${fmtWhen(c.consent.refusedAt)}` : "não pedido"}</dd>
            {c.consent.text && <><dt className="text-gray-500">Texto aceito</dt><dd className="text-gray-400">{c.consent.text}</dd></>}
            <dt className="text-gray-500">Janela de 24h</dt><dd className={c.windowOpen ? "text-green-300" : "text-gray-400"}>{c.windowOpen ? "aberta" : "fechada"} · última mensagem {fmtWhen(c.lastInboundAt)}</dd>
            <dt className="text-gray-500">Pediu para parar</dt><dd className="text-gray-200">{c.optOutAt ? fmtWhen(c.optOutAt) : "não"}</dd>
            <dt className="text-gray-500">Veio de</dt><dd className="text-gray-200">{SOURCE_PT[c.source] || c.source} · desde {fmtWhen(c.firstSeenAt)}</dd>
          </dl>
          <Field label="Etiquetas (separe por vírgula)" error={err?.field === "tags" ? err.msg : undefined}><input className={input} value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
          <Field label="Campos (um por linha: nome=valor)" hint="nome com letras minúsculas, números e _" error={err?.field === "fields" ? err.msg : undefined}>
            <textarea className={`${input} min-h-16 font-mono text-xs`} value={fields} onChange={(e) => setFields(e.target.value)} placeholder="cidade=Sorocaba" />
          </Field>
          {err && !err.field && <p className="text-xs text-red-400" role="alert">{err.msg}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy} className={primary}>{busy ? "Salvando..." : "Salvar"}</button>
            {canManage && <button type="button" onClick={erase} className="ml-auto flex items-center gap-1 text-xs text-red-300 hover:text-red-200"><Trash2 size={13} /> Excluir a pedido (LGPD)</button>}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ContactsPanel({ projects, selectedProject, onSelectProject, canManage }: { projects: ProjectOpt[]; selectedProject: string; onSelectProject: (id: string) => void; canManage: boolean }) {
  const project = projects.some((p) => p._id === selectedProject) ? selectedProject : projects[0]?._id || "";
  const [data, setData] = useState<{ contacts: ContactT[]; tags: string[] } | null>(null);
  const [filter, setFilterState] = useState({ q: "", tag: "", lead: false });
  const [open, setOpen] = useState<ContactT | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setFilterState({ q: p.get("q") || "", tag: p.get("etiqueta") || "", lead: p.get("lead") === "1" });
  }, []);
  function setFilter(f: typeof filter) {
    setFilterState(f);
    const url = new URL(window.location.href);
    for (const [k, v] of [["q", f.q], ["etiqueta", f.tag], ["lead", f.lead ? "1" : ""]] as const) if (v) url.searchParams.set(k, v); else url.searchParams.delete(k);
    window.history.replaceState(null, "", url);
  }
  const query = useCallback((extra = "") => {
    const q = new URLSearchParams({ project });
    if (filter.q) q.set("q", filter.q);
    if (filter.tag) q.set("tag", filter.tag);
    if (filter.lead) q.set("lead", "1");
    return `/api/contatos?${q}${extra}`;
  }, [project, filter]);
  const load = useCallback(async () => {
    if (!project) return;
    const r = await send<{ contacts: ContactT[]; tags: string[] }>("GET", query());
    if (r.ok) setData(r.data);
    else setErr(r.error);
  }, [project, query]);
  useEffect(() => { load(); }, [load]);

  if (!projects.length) return <p className="text-sm text-gray-400 py-16 text-center">Crie um projeto primeiro.</p>;
  const rows = data?.contacts || [];
  return (
    <div className="flex-1 overflow-auto p-3 md:p-6" data-testid="contatos">
      <div className="max-w-5xl mx-auto space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-gray-400 flex items-center gap-2">Projeto
            <select className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-gray-100 max-w-[200px]" value={project} onChange={(e) => onSelectProject(e.target.value)}>
              {projects.map((p) => <option key={p._id} value={p._id}>{p.icon} {p.name}</option>)}
            </select>
          </label>
          <label className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-100" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Buscar @ ou e-mail" aria-label="Buscar contato" />
          </label>
          <a href={query("&formato=csv")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-gray-700 text-gray-200 hover:bg-gray-800 whitespace-nowrap" download><Download size={14} /> Exportar CSV</a>
          <HelpDot id="contatos-e-lgpd" label="Contatos e LGPD" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtros">
          <button type="button" onClick={() => setFilter({ ...filter, lead: !filter.lead })} className={`${chip} px-2.5 py-1.5 text-xs border ${filter.lead ? "border-brand-500 text-white bg-gray-800" : "border-gray-700 text-gray-400"}`}>com e-mail ou telefone</button>
          {(data?.tags || []).map((t) => (
            <button key={t} type="button" onClick={() => setFilter({ ...filter, tag: filter.tag === t ? "" : t })} className={`${chip} px-2.5 py-1.5 text-xs border ${filter.tag === t ? "border-brand-500 text-white bg-gray-800" : "border-gray-700 text-gray-400"}`}>#{t}{filter.tag === t && " ×"}</button>
          ))}
          <span className="text-xs text-gray-500 ml-auto">{data ? `${rows.length} contato(s)` : "Carregando..."}</span>
        </div>
        {err && <Notice tone="bad" onClose={() => setErr("")}>{err}</Notice>}
        {data && !rows.length && <p className="text-sm text-gray-400">Nenhum contato {filter.q || filter.tag || filter.lead ? "com esses filtros" : "ainda: eles aparecem quando uma automação dispara ou alguém manda mensagem"}.</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto bg-gray-900 border border-gray-800 rounded-xl">
            <table className="w-full text-xs md:text-sm min-w-[720px]" data-testid="contatos-tabela">
              <thead className="text-gray-400 text-left"><tr className="border-b border-gray-800">
                <th className="py-2 px-3 font-medium">Contato</th><th className="py-2 px-2 font-medium">E-mail / telefone</th><th className="py-2 px-2 font-medium">Etiquetas</th><th className="py-2 px-2 font-medium">Consentimento</th><th className="py-2 px-2 font-medium">Janela 24h</th><th className="py-2 px-2 font-medium">Última mensagem</th>
              </tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c._id} className="border-b border-gray-800/60 hover:bg-gray-800/40 cursor-pointer" onClick={() => setOpen(c)}>
                    <td className="py-2 px-3 text-gray-100 max-w-[180px] truncate" title={c.username}>@{c.username || c.igsid}{c.optOutAt && <span className={`${chip} ml-1 bg-gray-700 text-gray-300`}>parou</span>}</td>
                    <td className="py-2 px-2 max-w-[200px] truncate" title={c.email || c.phone}>{c.email || c.phone || "–"}</td>
                    <td className="py-2 px-2 max-w-[180px] truncate" title={c.tags.join(", ")}>{c.tags.map((t) => `#${t}`).join(" ") || "–"}</td>
                    <td className="py-2 px-2 whitespace-nowrap">{c.consent.given ? <span className="text-green-300">sim · {fmtWhen(c.consent.at)}</span> : c.consent.refusedAt ? <span className="text-gray-400">recusou</span> : "–"}</td>
                    <td className="py-2 px-2 whitespace-nowrap">{c.windowOpen ? <span className="text-green-300">aberta</span> : <span className="text-gray-500">fechada</span>}</td>
                    <td className="py-2 px-2 whitespace-nowrap text-gray-400">{fmtWhen(c.lastInboundAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-gray-500">Mensagem automática só sai dentro de 24h da última mensagem da pessoa (regra da Meta). <button type="button" className={linkBtn} onClick={load}>atualizar</button></p>
      </div>
      {open && <ContactModal c={open} canManage={canManage} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }} />}
    </div>
  );
}
