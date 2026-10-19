"use client";
/* eslint-disable react-hooks/set-state-in-effect -- carga inicial */

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Globe, Radio, ShoppingCart, Send, Trash2 } from "lucide-react";
import { send, fmtWhen } from "@/components/http";
import { Card, Field, Notice, linkBtn } from "@/components/studio/shared";
import { type Options, HelpDot, btn, chip, input, moneyFull, primary, select } from "./shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Site { _id: string; project: string; name: string; key: string; domains: string[]; requireConsent: boolean; banner: boolean; bannerText: string; checkoutDomains: string[]; pixelId: string; capi: { enabled: boolean; hasToken: boolean; testEventCode: string; initiateCheckout: boolean }; lastHitAt: string | null; hits: number; scriptUrl: string; snippet: string }
interface Integration { _id: string; provider: "hotmart" | "kiwify"; name: string; url: string; hasSecret: boolean; project: string; pipeline: string; stageOnApproved: string; stageOnRefund: string; active: boolean; lastEventAt: string | null; events: number }
interface SaleRow { _id: string; provider: string; kind: string; value: number; product: string; at: string; contact: string | null; contactName: string; matchedBy: string; campaign: string; capi: string }
interface LogRow { _id: string; eventName: string; eventId: string; status: string; reason: string; keys: string[]; actionSource: string; value: number | null; testEventCode: string; response: any; at: string }
interface Overview {
  tracking: { on: boolean; message: string }; capi: { on: boolean; message: string; global: boolean; org: boolean }; canManage: boolean;
  projects: { _id: string; name: string; icon: string }[]; sites: Site[]; integrations: Integration[]; sales: SaleRow[]; logs: LogRow[]; last30: Record<string, { n: number; value: number }>;
}
const KIND: Record<string, { t: string; c: string }> = {
  approved: { t: "aprovada", c: "bg-green-500/15 text-green-300" }, refunded: { t: "reembolso", c: "bg-red-500/15 text-red-300" }, chargeback: { t: "chargeback", c: "bg-red-500/15 text-red-300" },
  abandoned: { t: "abandono", c: "bg-amber-500/15 text-amber-200" }, pending: { t: "aguardando", c: "bg-gray-700 text-gray-300" }, canceled: { t: "cancelada", c: "bg-gray-700 text-gray-300" }, other: { t: "outro", c: "bg-gray-700 text-gray-300" },
};
const MATCH: Record<string, string> = { src: "pelo link (src)", email: "pelo e-mail", phone: "pelo telefone", new: "lead novo", none: "sem lead", "src-visitor": "visitante sem lead", apagado: "apagado (LGPD)" };
const LOG: Record<string, string> = { sent: "bg-green-500/15 text-green-300", test: "bg-sky-500/15 text-sky-200", failed: "bg-red-500/15 text-red-300", skipped: "bg-gray-700 text-gray-300" };
const LOG_PT: Record<string, string> = { sent: "enviado", test: "teste", failed: "falhou", skipped: "não enviado" };

function CopyBtn({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return <button type="button" className={btn} onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* sem área de transferência */ } }}>{ok ? <Check size={14} /> : <Copy size={14} />} {ok ? "Copiado" : label}</button>;
}

function SiteCard({ s, project, canManage, capiMsg, onChanged }: { s: Site; project: string; canManage: boolean; capiMsg: string; onChanged: (m: string) => void }) {
  const [f, setF] = useState({ domains: s.domains.join(", "), checkoutDomains: s.checkoutDomains.join(", "), requireConsent: s.requireConsent, banner: s.banner, bannerText: s.bannerText, pixelId: s.pixelId, capiToken: "", testEventCode: s.capi.testEventCode, initiateCheckout: s.capi.initiateCheckout, capiEnabled: s.capi.enabled });
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  const [test, setTest] = useState("");
  const fe = (k: string) => (err?.field === k ? err.msg : undefined);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await send("PUT", `/api/rastreio/sites/${s._id}`, { ...f, capiToken: f.capiToken || undefined });
    if (!r.ok) return setErr({ msg: r.error, field: r.field });
    setErr(null);
    onChanged("Script salvo.");
  }
  async function runTest() {
    setTest("Enviando...");
    const r = await send<any>("POST", `/api/rastreio/sites/${s._id}/testar`);
    if (!r.ok) return setTest(r.error);
    setTest(r.data.status === "test" ? `A Meta recebeu (${r.data.response?.events_received ?? "?"} evento). Confira em Testar eventos.` : r.data.status === "skipped" ? "Não enviado: as chaves estão desligadas (veja o registro abaixo)." : `Falhou: ${r.data.response?.message || "erro"}`);
    onChanged("");
  }
  async function remove() {
    if (!window.confirm("Apagar o script deste projeto? Visitas guardadas somem; os leads ficam.")) return;
    await send("DELETE", `/api/rastreio/sites/${s._id}`);
    onChanged("Script apagado.");
  }
  return (
    <Card title={project} hint={`${s.hits} evento(s) recebido(s) · último ${fmtWhen(s.lastHitAt)}`} right={canManage ? <button type="button" className="p-1 text-gray-500 hover:text-red-300" onClick={remove} aria-label="Apagar script"><Trash2 size={14} /></button> : undefined}>
      <div className="space-y-3">
        <div>
          <p className="text-xs text-gray-400 mb-1">Cole antes de &lt;/head&gt; em todas as páginas (site, página de vendas, obrigado):</p>
          <div className="flex flex-wrap items-center gap-2"><code className="text-[11px] text-gray-200 bg-gray-950 border border-gray-800 rounded px-2 py-1.5 break-all flex-1 min-w-0">{s.snippet}</code><CopyBtn text={s.snippet} /></div>
          <p className="text-[11px] text-gray-500 mt-1">Formulário com <code>data-ch-lead</code> e a caixinha <code>name=&quot;ch_consent&quot;</code> vira lead sozinho. Links de checkout (Hotmart, Kiwify, Eduzz, Monetizze, Lastlink...) ganham src/sck/UTMs.</p>
        </div>
        {canManage ? (
          <form onSubmit={save} className="space-y-3" data-testid="site-form">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Domínios do site (vazio = qualquer)" hint="ex.: meusite.com.br, pages.hotmart.com"><input className={input} value={f.domains} onChange={(e) => setF({ ...f, domains: e.target.value })} /></Field>
              <Field label="Outros domínios de checkout"><input className={input} value={f.checkoutDomains} onChange={(e) => setF({ ...f, checkoutDomains: e.target.value })} placeholder="checkout.meusite.com.br" /></Field>
            </div>
            <div className="rounded-lg border border-gray-800 p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-200"><input type="checkbox" checked={f.requireConsent} onChange={(e) => setF({ ...f, requireConsent: e.target.checked })} className="accent-[var(--brand-500)]" /> Só rastrear depois do aceite de cookies (recomendado, LGPD)</label>
              {f.requireConsent && <label className="flex items-center gap-2 text-sm text-gray-200"><input type="checkbox" checked={f.banner} onChange={(e) => setF({ ...f, banner: e.target.checked })} className="accent-[var(--brand-500)]" /> Mostrar o nosso aviso de cookies (desmarque se o site já tem um e chama <code>chTrack.consent(true)</code>)</label>}
              {f.requireConsent && f.banner && <Field label="Texto do aviso (opcional)"><input className={input} value={f.bannerText} onChange={(e) => setF({ ...f, bannerText: e.target.value })} maxLength={300} placeholder="Usamos cookies para entender de onde você veio e melhorar os anúncios. Você aceita?" /></Field>}
            </div>
            <div className="rounded-lg border border-gray-800 p-3 space-y-2" data-testid="site-capi">
              <p className="text-sm font-semibold text-gray-100 flex items-center gap-2"><Send size={14} /> API de Conversões da Meta <HelpDot id="rastreamento-capi" label="Pixel e API de Conversões" /></p>
              {capiMsg && <p className="text-xs text-gray-400">{capiMsg}</p>}
              <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Id do pixel" error={fe("pixelId")}><input className={input} value={f.pixelId} onChange={(e) => setF({ ...f, pixelId: e.target.value })} inputMode="numeric" /></Field>
                <Field label={s.capi.hasToken ? "Token (já salvo; cole só para trocar)" : "Token da API de Conversões"} error={fe("capiToken")}><input className={input} type="password" autoComplete="off" value={f.capiToken} onChange={(e) => setF({ ...f, capiToken: e.target.value })} /></Field>
                <Field label="Código de teste (opcional)" hint="tudo vai como teste" error={fe("testEventCode")}><input className={input} value={f.testEventCode} onChange={(e) => setF({ ...f, testEventCode: e.target.value })} placeholder="TEST12345" /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-200"><input type="checkbox" checked={f.initiateCheckout} onChange={(e) => setF({ ...f, initiateCheckout: e.target.checked })} className="accent-[var(--brand-500)]" /> Mandar também InitiateCheckout (clique no link do checkout)</label>
              <label className="flex items-center gap-2 text-sm text-gray-200"><input type="checkbox" checked={f.capiEnabled} onChange={(e) => setF({ ...f, capiEnabled: e.target.checked })} className="accent-[var(--brand-500)]" /> Enviar Lead e Purchase para a Meta</label>
              {fe("capiEnabled") && <p className="text-xs text-red-400">{fe("capiEnabled")}</p>}
              <div className="flex flex-wrap items-center gap-3"><button type="button" className={btn} onClick={runTest} disabled={!s.capi.testEventCode}>Enviar evento de teste</button>{test && <span className="text-xs text-gray-300">{test}</span>}</div>
            </div>
            {err && !["pixelId", "capiToken", "testEventCode", "capiEnabled"].includes(err.field || "") && <p className="text-xs text-red-400">{err.msg}</p>}
            <button type="submit" className={primary}>Salvar</button>
          </form>
        ) : <p className="text-xs text-gray-500">Configurar: só o dono da conta.</p>}
      </div>
    </Card>
  );
}

function IntegrationForm({ opts, projects, onDone, onCancel }: { opts: Options; projects: Overview["projects"]; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ provider: "hotmart", name: "", secret: "", project: projects[0]?._id || "", stageOnApproved: "", stageOnRefund: "" });
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  const pipe = opts.pipelines.find((p) => p.isDefault) || opts.pipelines[0];
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await send("POST", "/api/rastreio/integracoes", f);
    if (!r.ok) return setErr({ msg: r.error, field: r.field });
    onDone();
  }
  return (
    <form onSubmit={save} className="space-y-3 border border-gray-800 rounded-xl p-3" data-testid="integracao-form">
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Plataforma"><select className={`${select} w-full mt-1`} value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}><option value="hotmart">Hotmart</option><option value="kiwify">Kiwify</option></select></Field>
        <Field label="Nome (opcional)"><input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Mentoria" /></Field>
        <Field label="Projeto (pixel do Purchase)"><select className={`${select} w-full mt-1`} value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })}>{projects.map((p) => <option key={p._id} value={p._id}>{p.icon} {p.name}</option>)}</select></Field>
        <Field label={f.provider === "hotmart" ? "Hottok (Webhook › Autenticação)" : "Token do webhook"} className="sm:col-span-3" error={err?.field === "secret" ? err.msg : undefined}><input className={input} type="password" autoComplete="off" value={f.secret} onChange={(e) => setF({ ...f, secret: e.target.value })} /></Field>
        <Field label="Ao aprovar, mover para"><select className={`${select} w-full mt-1`} value={f.stageOnApproved} onChange={(e) => setF({ ...f, stageOnApproved: e.target.value })}><option value="">{pipe?.stages.find((s) => s.kind === "won")?.name || "etapa de ganho"}</option><option value="-">não mexer</option>{pipe?.stages.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select></Field>
        <Field label="Reembolso / chargeback"><select className={`${select} w-full mt-1`} value={f.stageOnRefund} onChange={(e) => setF({ ...f, stageOnRefund: e.target.value })}><option value="">não mexer</option>{pipe?.stages.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select></Field>
      </div>
      {err && err.field !== "secret" && <p className="text-xs text-red-400">{err.msg}</p>}
      <div className="flex items-center gap-3"><button type="submit" className={primary}>Salvar e gerar URL</button><button type="button" className={linkBtn} onClick={onCancel}>Cancelar</button></div>
    </form>
  );
}

export default function TrackingPanel({ opts }: { opts: Options }) {
  const [d, setD] = useState<Overview | null>(null);
  const [msg, setMsg] = useState("");
  const [newSite, setNewSite] = useState("");
  const [adding, setAdding] = useState(false);
  const load = useCallback(async () => {
    const r = await send<Overview>("GET", "/api/rastreio");
    if (r.ok && r.data) { setD(r.data); setNewSite((cur) => cur || r.data!.projects.find((p) => !r.data!.sites.some((s) => s.project === p._id))?._id || ""); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!d) return <p className="text-sm text-gray-400">Carregando...</p>;
  const free = d.projects.filter((p) => !d.sites.some((s) => s.project === p._id));
  async function createSite() {
    const r = await send("POST", "/api/rastreio/sites", { project: newSite });
    setMsg(r.ok ? "Script criado. Copie e cole no site." : r.error);
    setNewSite("");
    load();
  }
  async function removeInt(i: Integration) {
    if (!window.confirm("Apagar esta integração? As vendas já recebidas ficam.")) return;
    await send("DELETE", `/api/rastreio/integracoes/${i._id}`);
    load();
  }
  const l30 = d.last30;
  return (
    <div className="space-y-4 max-w-5xl" data-testid="crm-rastreio">
      {!d.tracking.on && <Notice tone="info">{d.tracking.message}</Notice>}
      {msg && <Notice tone="ok" onClose={() => setMsg("")}>{msg}</Notice>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[["Vendas (30 dias)", l30.approved?.n || 0, l30.approved?.value || 0], ["Reembolsos", l30.refunded?.n || 0, l30.refunded?.value || 0], ["Chargebacks", l30.chargeback?.n || 0, l30.chargeback?.value || 0], ["Carrinhos abandonados", l30.abandoned?.n || 0, null]].map(([label, nn, v]) => (
          <div key={String(label)} className="bg-gray-900 border border-gray-800 rounded-xl p-3"><p className="text-[11px] text-gray-500">{label}</p><p className="text-lg font-bold text-gray-100">{Number(nn).toLocaleString("pt-BR")}</p>{v != null && <p className="text-[11px] text-gray-500">{moneyFull(Number(v))}</p>}</div>
        ))}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-100 flex items-center gap-2"><Globe size={15} /> Script do site <HelpDot id="rastreamento-script" label="Instalar o script" /></h3>
        {d.sites.map((s) => <SiteCard key={s._id + s.capi.hasToken + s.pixelId} s={s} project={(() => { const p = d.projects.find((x) => x._id === s.project); return p ? `${p.icon} ${p.name}` : "Projeto"; })()} canManage={d.canManage} capiMsg={d.capi.on ? "" : d.capi.message} onChanged={(m) => { if (m) setMsg(m); load(); }} />)}
        {d.canManage && free.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-gray-400">Projeto<select className={`${select} block mt-1`} value={newSite} onChange={(e) => setNewSite(e.target.value)}>{free.map((p) => <option key={p._id} value={p._id}>{p.icon} {p.name}</option>)}</select></label>
            <button type="button" className={primary} onClick={createSite} disabled={!newSite}>Criar script</button>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-100 flex items-center gap-2"><ShoppingCart size={15} /> Vendas (Hotmart e Kiwify) <HelpDot id="rastreamento-vendas" label="Webhooks de venda" /></h3>
        <ul className="space-y-2">
          {d.integrations.map((i) => (
            <li key={i._id} className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-gray-100">{i.provider === "hotmart" ? "Hotmart" : "Kiwify"}{i.name ? ` · ${i.name}` : ""}</span>
                <span className={`${chip} ${i.active ? "bg-green-500/15 text-green-300" : "bg-gray-700 text-gray-300"}`}>{i.active ? "ativa" : "pausada"}</span>
                <span className="text-xs text-gray-500 ml-auto whitespace-nowrap">{i.events} evento(s) · último {fmtWhen(i.lastEventAt)}</span>
                {d.canManage && <button type="button" className="p-1 text-gray-500 hover:text-red-300" onClick={() => removeInt(i)} aria-label="Apagar integração"><Trash2 size={14} /></button>}
              </div>
              <div className="flex flex-wrap items-center gap-2"><code className="text-[11px] text-gray-300 bg-gray-950 border border-gray-800 rounded px-2 py-1 truncate max-w-full">{i.url}</code><CopyBtn text={i.url} label="Copiar URL" /></div>
            </li>
          ))}
        </ul>
        {d.canManage && (adding ? <IntegrationForm opts={opts} projects={d.projects} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); setMsg("Integração criada: cole a URL no webhook da plataforma."); load(); }} /> : <button type="button" className={btn} onClick={() => setAdding(true)}>Nova integração</button>)}
        {d.sales.length > 0 && (
          <div className="overflow-x-auto bg-gray-900 border border-gray-800 rounded-xl">
            <table className="w-full text-xs min-w-[760px]" data-testid="vendas-tabela">
              <thead className="text-gray-400 text-left"><tr className="border-b border-gray-800"><th className="py-2 px-3 font-medium">Quando</th><th className="py-2 px-2 font-medium">Tipo</th><th className="py-2 px-2 font-medium">Produto</th><th className="py-2 px-2 font-medium text-right">Valor</th><th className="py-2 px-2 font-medium">Lead</th><th className="py-2 px-2 font-medium">Origem</th><th className="py-2 px-2 font-medium">Meta</th></tr></thead>
              <tbody>
                {d.sales.map((x) => (
                  <tr key={x._id} className="border-b border-gray-800/60">
                    <td className="py-1.5 px-3 whitespace-nowrap text-gray-400">{fmtWhen(x.at)}</td>
                    <td className="py-1.5 px-2"><span className={`${chip} ${KIND[x.kind]?.c}`}>{KIND[x.kind]?.t || x.kind}</span></td>
                    <td className="py-1.5 px-2 max-w-[180px] truncate">{x.product || "–"}</td>
                    <td className="py-1.5 px-2 text-right whitespace-nowrap">{moneyFull(x.value)}</td>
                    <td className="py-1.5 px-2 max-w-[180px] truncate">{x.contact ? <a className="underline" href={`/?view=crm&aba=lista&lead=${x.contact}`}>{x.contactName || "lead"}</a> : <span className="text-gray-500">–</span>} <span className="text-gray-500">{MATCH[x.matchedBy] || ""}</span></td>
                    <td className="py-1.5 px-2 max-w-[140px] truncate text-gray-400">{x.campaign || "–"}</td>
                    <td className="py-1.5 px-2 text-gray-400">{x.capi ? LOG_PT[x.capi] || x.capi : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-100 flex items-center gap-2"><Radio size={15} /> Envios para a Meta (API de Conversões)</h3>
        {!d.logs.length ? <p className="text-sm text-gray-500">Nenhum envio ainda.</p> : (
          <ul className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800 text-xs" data-testid="capi-log">
            {d.logs.map((l) => (
              <li key={l._id} className="px-3 py-2 flex flex-wrap items-center gap-2">
                <span className="text-gray-400 whitespace-nowrap">{fmtWhen(l.at)}</span>
                <span className={`${chip} ${LOG[l.status]}`}>{LOG_PT[l.status] || l.status}</span>
                <span className="text-gray-100">{l.eventName}</span>
                {l.value != null && <span className="text-gray-400">{moneyFull(l.value)}</span>}
                <span className="text-gray-500 truncate" title={l.keys.join(", ")}>dados: {l.keys.join(", ") || "–"}</span>
                <span className="text-gray-500 ml-auto truncate max-w-full" title={JSON.stringify(l.response || {})}>{l.reason || (l.response?.events_received != null ? `Meta recebeu ${l.response.events_received}` : l.response?.message || "")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
