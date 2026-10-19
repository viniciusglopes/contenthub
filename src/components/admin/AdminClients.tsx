"use client";
/* eslint-disable react-hooks/set-state-in-effect -- filtros lidos do link; dados carregados ao abrir */

import { useCallback, useEffect, useMemo, useState } from "react";
import { LogIn, Search, UserPlus, X } from "lucide-react";
import { type BrandInfo, fieldCls, ghostBtn, primaryBtn } from "@/components/brand";
import { type PendingInvite, type TeamUser, fmtWhen, send } from "@/components/http";
import { type BrandForm, BrandFields, InviteRows, LinkBox, UserRows, toBrandForm } from "@/components/team/parts";

interface OrgRow {
  _id: string;
  name: string;
  slug: string;
  active: boolean;
  publishEnabled: boolean;
  brand: BrandInfo;
  users: number;
  accounts: number;
  projects: number;
  lastSync: string | null;
  pendingInvites: number;
}
interface OrgDetail {
  _id: string;
  name: string;
  slug: string;
  active: boolean;
  publishEnabled: boolean;
  publishGlobal: boolean;
  commentReplyEnabled: boolean;
  commentReplyGlobal: boolean;
  adsWriteEnabled: boolean;
  adsWriteGlobal: boolean;
  automationsEnabled?: boolean;
  leadAdsEnabled?: boolean;
  leadAdsGlobal?: boolean;
  trackingEnabled?: boolean;
  trackingGlobal?: boolean;
  capiEnabled?: boolean;
  capiGlobal?: boolean;
  automationsGlobal?: boolean;
  offersEnabled: boolean;
  rawBrand: Partial<BrandInfo>;
  users: TeamUser[];
  invites: PendingInvite[];
  impersonations: { action: string; actorEmail: string; at: string }[];
}
type Status = "todos" | "ativos" | "inativos" | "sem-dono";
const STATUS_LABEL: Record<Status, string> = { todos: "Todos", ativos: "Ativos", inativos: "Inativos", "sem-dono": "Aguardando o dono" };

function setQuery(key: string, value: string) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  window.history.replaceState(null, "", url);
}

// Admin › Clientes: lista (uma linha por cliente), criar, convidar, entrar como, ativar/desativar.
export default function AdminClients({ homeOrgId }: { homeOrgId: string }) {
  const [rows, setRows] = useState<OrgRow[] | null>(null);
  const [orphans, setOrphans] = useState(0);
  const [orphansClosed, setOrphansClosed] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState<Status>("todos");
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<{ msg: string; field?: string } | null>(null);
  const [link, setLink] = useState<{ link: string; title: string } | null>(null);
  const [openId, setOpenId] = useState("");
  const [busyRow, setBusyRow] = useState("");

  const load = useCallback(async () => {
    const r = await send<{ organizations: OrgRow[]; orphans: number }>("GET", "/api/admin/organizations");
    if (r.ok && r.data) {
      setRows(r.data.organizations);
      setOrphans(r.data.orphans);
      setLoadError("");
    } else setLoadError(r.error);
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("status") as Status | null;
    if (s && STATUS_LABEL[s]) setStatus(s);
    setQ(p.get("q") || "");
    setOpenId(p.get("cliente") || "");
    try { setOrphansClosed(Number(window.localStorage.getItem("ch-orfaos-visto") || 0)); } catch { /* navegação privada */ }
    load();
  }, [load]);

  const match = useCallback((o: OrgRow, s: Status) =>
    s === "todos" || (s === "ativos" && o.active) || (s === "inativos" && !o.active) || (s === "sem-dono" && o.users === 0), []);
  const searched = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows || []).filter((o) => !term || o.name.toLowerCase().includes(term) || o.slug.includes(term));
  }, [rows, q]);
  const visible = searched.filter((o) => match(o, status));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    const r = await send<{ link: string; organization: { name: string } }>("POST", "/api/admin/organizations", { name, ownerEmail: ownerEmail || undefined });
    setCreating(false);
    if (!r.ok || !r.data) return setCreateError({ msg: r.error, field: r.field === "email" ? "ownerEmail" : r.field });
    setLink({ link: r.data.link, title: `${r.data.organization.name} criado. Envie este link para o dono definir a senha:` });
    setName("");
    setOwnerEmail("");
    load();
  }

  async function inviteOwner(o: OrgRow) {
    setBusyRow(o._id);
    const r = await send<{ link: string }>("POST", `/api/admin/organizations/${o._id}/invites`, { kind: "owner" });
    setBusyRow("");
    if (r.ok && r.data) {
      setLink({ link: r.data.link, title: `Convite de dono para ${o.name}:` });
      load();
    } else setLoadError(r.error);
  }

  async function enterAs(o: OrgRow) {
    setBusyRow(o._id);
    const r = await send("POST", "/api/admin/impersonate", { organization: o._id });
    if (r.ok) window.location.href = "/";
    else {
      setBusyRow("");
      setLoadError(r.error);
    }
  }

  function open(id: string) {
    setOpenId(id);
    setQuery("cliente", id);
  }
  function pickStatus(s: Status) {
    setStatus(s);
    setQuery("status", s === "todos" ? "" : s);
  }

  const chip = (active: boolean) =>
    `shrink-0 text-xs px-3 py-1.5 rounded-full border transition whitespace-nowrap ${active ? "border-brand-500 text-brand-400 bg-brand-500/10" : "border-gray-700 text-gray-300 hover:border-gray-500"}`;
  const cols = "grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_10.5rem_7.5rem_16.5rem] items-center gap-x-3";

  return (
    <div className="flex-1 overflow-auto" data-testid="admin-clients">
      <div className="max-w-6xl mx-auto p-3 md:p-6 space-y-4">
        {orphans > 0 && orphans !== orphansClosed && (
          <div className="flex items-start gap-3 rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-gray-300" role="status">
            <p className="flex-1">
              Há {orphans} registro(s) antigo(s) sem cliente definido. Ninguém os enxerga até a migração rodar (scripts/migrate-white-label.ts).
            </p>
            <button type="button" aria-label="Fechar aviso" className="p-1 -m-1 text-gray-400 hover:text-white" onClick={() => { setOrphansClosed(orphans); try { window.localStorage.setItem("ch-orfaos-visto", String(orphans)); } catch { /* navegação privada */ } }}><X size={16} /></button>
          </div>
        )}

        {/* Novo cliente: formulário na própria página, um botão */}
        <form onSubmit={create} className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4" data-testid="new-client">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 md:items-end">
            <div>
              <label htmlFor="nc-name" className="text-xs text-gray-400">Novo cliente</label>
              <input id="nc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da empresa" maxLength={80} className={fieldCls(createError?.field === "name")} />
            </div>
            <div>
              <label htmlFor="nc-email" className="text-xs text-gray-400">E-mail do dono (opcional)</label>
              <input id="nc-email" type="email" inputMode="email" autoCapitalize="none" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="Trava o convite nesse e-mail" className={fieldCls(createError?.field === "ownerEmail")} />
            </div>
            <button type="submit" disabled={creating || name.trim().length < 2} className={primaryBtn}>
              {creating ? "Criando..." : "Criar e gerar convite"}
            </button>
          </div>
          {createError && <p className="text-xs text-red-400 mt-2" role="alert">{createError.msg}</p>}
        </form>

        {link && <LinkBox link={link.link} title={link.title} onClose={() => setLink(null)} />}

        {/* Filtros à vista, com contagem ao vivo */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setQuery("q", e.target.value); }} placeholder="Buscar cliente" aria-label="Buscar cliente" className="w-full bg-gray-900 border border-gray-700 rounded-full pl-8 pr-8 py-1.5 text-sm text-gray-100 outline-none focus:border-brand-500" />
            {q && <button type="button" aria-label="Limpar busca" onClick={() => { setQ(""); setQuery("q", ""); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"><X size={14} /></button>}
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <button key={s} type="button" onClick={() => pickStatus(s)} className={chip(status === s)} aria-pressed={status === s}>
                {STATUS_LABEL[s]} <span className="opacity-70">{searched.filter((o) => match(o, s)).length}</span>
              </button>
            ))}
          </div>
        </div>

        {loadError && <p className="text-sm text-red-400" role="alert">{loadError}</p>}

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className={`${cols} px-3 md:px-4 py-2 text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-800`}>
            <span>Cliente</span>
            <span className="hidden md:block text-right">Usuários</span>
            <span className="hidden md:block text-right">Contas</span>
            <span className="hidden md:block">Última sincronização</span>
            <span className="hidden md:block">Situação</span>
            <span className="text-right">Ações</span>
          </div>
          {rows === null && !loadError && <p className="text-sm text-gray-400 py-10 text-center">Carregando...</p>}
          {rows && visible.length === 0 && (
            <p className="text-sm text-gray-400 py-10 text-center">{rows.length === 0 ? "Nenhum cliente ainda. Crie o primeiro no formulário acima." : "Nenhum cliente com esse filtro."}</p>
          )}
          {visible.map((o) => (
            <div key={o._id} className={`${cols} px-3 md:px-4 py-2.5 border-b border-gray-800 last:border-b-0 hover:bg-gray-800/40 cursor-pointer ${o.active ? "" : "opacity-60"}`} onClick={() => open(o._id)} data-testid="client-row">
              <div className="min-w-0 flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: o.brand.color }} />
                <span className="text-sm text-gray-100 font-medium truncate" title={o.name}>{o.name}</span>
                {o._id === homeOrgId && <span className="text-[11px] text-gray-500 whitespace-nowrap">sua conta</span>}
                <span className="md:hidden text-xs text-gray-500 whitespace-nowrap ml-auto">{o.users} usu. · {o.accounts} conta{o.accounts === 1 ? "" : "s"}</span>
              </div>
              <span className="hidden md:block text-sm text-gray-300 text-right tabular-nums">{o.users}</span>
              <span className="hidden md:block text-sm text-gray-300 text-right tabular-nums">{o.accounts}</span>
              <span className="hidden md:block text-xs text-gray-400 whitespace-nowrap">{fmtWhen(o.lastSync, "ainda não sincronizou")}</span>
              <span className="hidden md:block">
                <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${!o.active ? "bg-gray-800 text-gray-500" : o.users === 0 ? "bg-gray-800 text-gray-300" : "bg-green-500/15 text-green-400"}`}>
                  {!o.active ? "Inativo" : o.users === 0 ? (o.pendingInvites ? "Convite enviado" : "Sem dono") : "Ativo"}
                </span>
                {o.publishEnabled && <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap bg-sky-500/15 text-sky-300" title="Publicação automática no Instagram ligada para este cliente">Publica sozinho</span>}
              </span>
              <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                {o.active && o.users === 0 && (
                  <button type="button" className={`${ghostBtn} hidden md:inline-flex items-center gap-1`} disabled={busyRow === o._id} onClick={() => inviteOwner(o)} title="Gerar um novo link de convite para o dono">
                    <UserPlus size={13} /> Convidar dono
                  </button>
                )}
                {o._id !== homeOrgId && (
                  <button type="button" className={`${ghostBtn} inline-flex items-center gap-1`} disabled={busyRow === o._id} onClick={() => enterAs(o)} title={`Ver o ContentHub como ${o.name}`} aria-label={`Entrar como ${o.name}`}>
                    <LogIn size={13} /> <span className="hidden sm:inline">Entrar como</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500">Toque num cliente para ver usuários, convites, marca e ativar ou desativar. Desativar bloqueia o acesso e a sincronização; nada é apagado.</p>
      </div>

      {openId && <ClientModal id={openId} isHome={openId === homeOrgId} onClose={() => open("")} onChanged={load} />}
    </div>
  );
}

function ClientModal({ id, isHome, onClose, onChanged }: { id: string; isHome: boolean; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<OrgDetail | null>(null);
  const [error, setError] = useState<{ msg: string; field?: string } | null>(null);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [publishOn, setPublishOn] = useState(false);
  const [replyOn, setReplyOn] = useState(false);
  const [adsOn, setAdsOn] = useState(false);
  const [autoOn, setAutoOn] = useState(false);
  const [leadAdsOn, setLeadAdsOn] = useState(false);
  const [trackOn, setTrackOn] = useState(false);
  const [capiOn, setCapiOn] = useState(false);
  const [offersOn, setOffersOn] = useState(false);
  const [brand, setBrand] = useState<BrandForm>(toBrandForm(null));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [link, setLink] = useState<{ link: string; title: string } | null>(null);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    const r = await send<OrgDetail>("GET", `/api/admin/organizations/${id}`);
    if (!r.ok || !r.data) return setError({ msg: r.error });
    setD(r.data);
    setName(r.data.name);
    setActive(r.data.active);
    setPublishOn(r.data.publishEnabled);
    setReplyOn(r.data.commentReplyEnabled);
    setAdsOn(r.data.adsWriteEnabled === true);
    setAutoOn(r.data.automationsEnabled === true);
    setLeadAdsOn(r.data.leadAdsEnabled === true);
    setTrackOn(r.data.trackingEnabled === true);
    setCapiOn(r.data.capiEnabled === true);
    setOffersOn(r.data.offersEnabled === true);
    setBrand(toBrandForm(r.data.rawBrand));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const r = await send("PUT", `/api/admin/organizations/${id}`, { name, active, publishEnabled: publishOn, commentReplyEnabled: replyOn, adsWriteEnabled: adsOn, automationsEnabled: autoOn, leadAdsEnabled: leadAdsOn, trackingEnabled: trackOn, capiEnabled: capiOn, offersEnabled: offersOn, ...brand });
    setSaving(false);
    if (!r.ok) return setError({ msg: r.error, field: r.field });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    onChanged();
  }
  async function invite(body: Record<string, unknown>, title: string) {
    setBusyId(String(body.user || "novo"));
    const r = await send<{ link: string }>("POST", `/api/admin/organizations/${id}/invites`, body);
    setBusyId("");
    if (!r.ok || !r.data) return setError({ msg: r.error });
    setLink({ link: r.data.link, title });
    load();
    onChanged();
  }
  async function cancel(i: PendingInvite) {
    await send("DELETE", `/api/admin/organizations/${id}/invites?invite=${i._id}`);
    load();
    onChanged();
  }

  const hasOwner = d?.users.some((u) => u.role !== "member" && u.active);
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-t-2xl sm:rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Cliente" data-testid="client-modal">
        <div className="flex items-center justify-between p-4 border-b border-gray-800 sticky top-0 bg-gray-900 z-10">
          <h3 className="font-bold text-white truncate">{d?.name || "Cliente"}</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-800 rounded" aria-label="Fechar"><X size={18} /></button>
        </div>
        {!d ? (
          <p className="text-sm text-gray-400 p-6">{error?.msg || "Carregando..."}</p>
        ) : (
          <div className="p-4 space-y-5">
            <form onSubmit={save} className="space-y-3">
              <div>
                <label htmlFor="cm-name" className="text-xs text-gray-400">Nome do cliente</label>
                <input id="cm-name" value={name} onChange={(e) => setName(e.target.value)} className={fieldCls(error?.field === "name")} />
              </div>
              <BrandFields value={brand} onChange={setBrand} error={error} />
              <label className={`flex items-center gap-2 text-sm ${isHome ? "text-gray-500" : "text-gray-200"}`}>
                <input type="checkbox" checked={active} disabled={isHome} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4 accent-[var(--brand-500)]" />
                Cliente ativo {isHome ? "(sua própria conta não pode ser desativada)" : "(desmarcar bloqueia o acesso de todos os usuários dele)"}
              </label>
              <div className="rounded-lg border border-gray-800 p-3 space-y-1" data-testid="publish-switch">
                <label className="flex items-center gap-2 text-sm text-gray-200">
                  <input type="checkbox" checked={publishOn} onChange={(e) => setPublishOn(e.target.checked)} className="w-4 h-4 accent-[var(--brand-500)]" />
                  Publicação automática no Instagram
                </label>
                <p className="text-xs text-gray-400">
                  {publishOn
                    ? "Ligada: os posts aprovados deste cliente sobem sozinhos na data e hora marcadas."
                    : "Desligada: o cliente cria, aprova e agenda, mas nada sai sozinho."}
                  {!d.publishGlobal && " A chave geral do sistema (IG_PUBLISH_ENABLED) está desligada: mesmo ligando aqui, nada é publicado até ela ser ligada no servidor."}
                </p>
              </div>
              <div className="rounded-lg border border-gray-800 p-3 space-y-1" data-testid="reply-switch">
                <label className="flex items-center gap-2 text-sm text-gray-200">
                  <input type="checkbox" checked={replyOn} onChange={(e) => setReplyOn(e.target.checked)} className="w-4 h-4 accent-[var(--brand-500)]" />
                  Responder comentários pelo ContentHub
                </label>
                <p className="text-xs text-gray-400">
                  {replyOn
                    ? "Ligada: a equipe deste cliente pode responder comentários em público daqui (com confirmação e registro de quem respondeu)."
                    : "Desligada: os comentários aparecem para leitura e estudo; responder, só pelo Instagram."}
                  {!d.commentReplyGlobal && " A chave geral do sistema (IG_COMMENT_REPLY_ENABLED) está desligada: mesmo ligando aqui, nenhuma resposta é enviada."}
                </p>
              </div>
              <div className="rounded-lg border border-gray-800 p-3 space-y-1" data-testid="ads-write-switch">
                <label className="flex items-center gap-2 text-sm text-gray-200">
                  <input type="checkbox" checked={adsOn} onChange={(e) => setAdsOn(e.target.checked)} className="w-4 h-4 accent-[var(--brand-500)]" />
                  Ações nos anúncios da Meta (Tráfego)
                </label>
                <p className="text-xs text-gray-400">
                  {adsOn
                    ? "Ligada: o dono deste cliente pode pausar, ativar, mudar orçamento diário e criar anúncio pausado a partir de um post (com confirmação e registro)."
                    : "Desligada: Tráfego é só leitura para este cliente."}
                  {!d.adsWriteGlobal && " A chave geral do sistema (TRAFEGO_WRITE_ENABLED) está desligada: mesmo ligando aqui, nada é alterado na Meta."}
                </p>
              </div>
              <div className="rounded-lg border border-gray-800 p-3 space-y-1" data-testid="automations-switch">
                <label className="flex items-center gap-2 text-sm text-gray-200">
                  <input type="checkbox" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} className="w-4 h-4 accent-[var(--brand-500)]" />
                  Automações do direct (comentou palavra, DM, contatos)
                </label>
                <p className="text-xs text-gray-400">
                  {autoOn
                    ? "Ligada: o webhook guarda os comentários e mensagens das contas deste cliente e as automações ativas rodam (cada uma começa em modo ensaio)."
                    : "Desligada: o cliente monta e simula automações, mas nada é recebido nem enviado."}
                  {!d.automationsGlobal && " A chave geral do sistema (AUTOMACOES_ENABLED) está desligada: mesmo ligando aqui, nada é recebido nem enviado."}
                </p>
              </div>
              <div className="rounded-lg border border-gray-800 p-3 space-y-1" data-testid="leadads-switch">
                <label className="flex items-center gap-2 text-sm text-gray-200">
                  <input type="checkbox" checked={leadAdsOn} onChange={(e) => setLeadAdsOn(e.target.checked)} className="w-4 h-4 accent-[var(--brand-500)]" />
                  CRM: leads dos formulários da Meta (Lead Ads)
                </label>
                <p className="text-xs text-gray-400">
                  {leadAdsOn
                    ? "Ligada: os avisos de formulário das Páginas cadastradas por este cliente entram no CRM (o lead é buscado na Meta só com leitura)."
                    : "Desligada: o cliente cadastra a Página, mas nenhum aviso é guardado nem lead é buscado."}
                  {!d.leadAdsGlobal && " A chave geral do sistema (CRM_LEAD_ADS_ENABLED) está desligada: mesmo ligando aqui, nada entra."}
                </p>
              </div>
              <div className="rounded-lg border border-gray-800 p-3 space-y-1" data-testid="tracking-switch">
                <label className="flex items-center gap-2 text-sm text-gray-200">
                  <input type="checkbox" checked={trackOn} onChange={(e) => setTrackOn(e.target.checked)} className="w-4 h-4 accent-[var(--brand-500)]" />
                  Rastreamento (script do site e vendas da Hotmart/Kiwify)
                </label>
                <p className="text-xs text-gray-400">
                  {trackOn ? "Ligado: o script do site deste cliente grava visitas e leads, e os webhooks de venda entram no CRM." : "Desligado: o cliente configura, mas nenhum evento nem venda é guardado."}
                  {!d.trackingGlobal && " A chave geral do sistema (TRACKING_ENABLED) está desligada: mesmo ligando aqui, nada entra."}
                </p>
              </div>
              <div className="rounded-lg border border-gray-800 p-3 space-y-1" data-testid="capi-switch">
                <label className="flex items-center gap-2 text-sm text-gray-200">
                  <input type="checkbox" checked={capiOn} onChange={(e) => setCapiOn(e.target.checked)} className="w-4 h-4 accent-[var(--brand-500)]" />
                  API de Conversões da Meta (Lead e Purchase pelo servidor)
                </label>
                <p className="text-xs text-gray-400">
                  {capiOn ? "Ligada: os sites deste cliente com pixel e token mandam Lead/Purchase para a Meta (cada envio fica registrado)." : "Desligada: nada é enviado à Meta; o registro mostra \"não enviado\"."}
                  {!d.capiGlobal && " A chave geral do sistema (CAPI_ENABLED) está desligada: mesmo ligando aqui, nada é enviado."}
                </p>
              </div>
              <div className="rounded-lg border border-gray-800 p-3 space-y-1" data-testid="offers-module-switch">
                <label className="flex items-center gap-2 text-sm text-gray-200">
                  <input type="checkbox" checked={offersOn} onChange={(e) => setOffersOn(e.target.checked)} className="w-4 h-4 accent-[var(--brand-500)]" />
                  Módulo Ofertas (lista da casa)
                </label>
                <p className="text-xs text-gray-400">
                  {offersOn
                    ? "Ligado: este cliente vê a lista da casa em Concorrentes › Ofertas, as novas do dia e o relatório \"mais escaladas do mês\". Se ele não tiver conta de anúncio, a contagem das ofertas dele usa o token da casa."
                    : "Desligado: este cliente acompanha só as ofertas que ele mesmo cadastra."}
                </p>
              </div>
              {error && error.field !== "color" && error.field !== "logo" && <p className="text-xs text-red-400" role="alert">{error.msg}</p>}
              <div className="flex items-center gap-3">
                <button type="submit" disabled={saving} className={primaryBtn}>{saving ? "Salvando..." : "Salvar"}</button>
                {saved && <span className="text-xs text-green-400" role="status">Salvo.</span>}
                <span className="text-xs text-gray-500 truncate ml-auto" title="Endereço de entrada com a marca do cliente">/login?c={d.slug}</span>
              </div>
            </form>

            {link && <LinkBox link={link.link} title={link.title} onClose={() => setLink(null)} />}

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-gray-200">Usuários</h4>
                <button type="button" className={ghostBtn} disabled={!d.active || busyId === "novo"} onClick={() => invite({ kind: hasOwner ? "member" : "owner" }, hasOwner ? `Convite de membro para ${d.name}:` : `Convite de dono para ${d.name}:`)}>
                  {hasOwner ? "Convidar membro" : "Convidar dono"}
                </button>
              </div>
              <UserRows users={d.users} busyId={busyId} onReset={(u) => invite({ kind: "reset", user: u._id }, `Link de nova senha para ${u.name}:`)} />
              <InviteRows invites={d.invites} onCancel={cancel} />
            </section>

            {d.impersonations.length > 0 && (
              <section>
                <h4 className="text-sm font-semibold text-gray-200 mb-1.5">Acessos do administrador (entrar como)</h4>
                <ul className="text-xs text-gray-400 space-y-1">
                  {d.impersonations.map((l, i) => (
                    <li key={i} className="truncate">{fmtWhen(l.at)} · {l.action.endsWith("inicio") ? "entrou" : "saiu"} · {l.actorEmail}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
