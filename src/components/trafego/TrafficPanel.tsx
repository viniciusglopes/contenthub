"use client";
/* eslint-disable react-hooks/set-state-in-effect -- estado inicial lido do link */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, History, Megaphone, Pause, Play, Plug, RefreshCw, Sparkles } from "lucide-react";
import { send } from "@/components/http";
import { DEFAULT_PRESET, type Period, type PeriodPreset } from "@/lib/instagram/period";
import { PRESET_KEYS, PeriodBar, type Selection, selectionQuery } from "@/components/instagram/InstagramPanel";
import { fmt, fmtDateTime, fmtPct } from "@/components/instagram/shared";
import { Card, Field, Notice, linkBtn } from "@/components/studio/shared";

interface Totals {
  spend: number; impressions: number; reachDaily: number; clicks: number; linkClicks: number; purchases: number; purchaseValue: number; leads: number;
  cpm: number | null; cpc: number | null; ctr: number | null; costPerPurchase: number | null; costPerLead: number | null; roas: number | null;
}
interface Row {
  id: string; name: string; level: "campaign" | "adset" | "ad"; status: string; statusText: string; active: boolean; objective: string;
  campaignName: string; adsetName: string; dailyBudget: number | null; lifetimeBudget: number | null; igMediaId: string; igPermalink: string; totals: Totals;
}
interface Candidate { igId: string; kind: string; caption: string; permalink: string; timestamp: string; thumbnailUrl: string; reach?: number; saved?: number; shares?: number; comments?: number; likes?: number; score: number; inAds: boolean; adSpend: number }
interface Account {
  _id: string; adAccountId: string; name: string; currency: string; accountStatus: number | null; accountStatusText: string; metaUserName: string;
  igAccounts: { id: string; username: string; pageName: string }[]; igUserId: string; active: boolean; lastSync: string | null; lastSyncError: string; insightsSince: string;
}
interface Payload {
  accounts: Account[];
  account: Account | null;
  period: Period;
  dashboard: null | {
    totals: Totals; compare: Record<string, number | null>; canCompare: boolean;
    reach: { value: number; exact: boolean };
    series: { date: string; spend: number; purchases: number; leads: number }[];
    rows: Record<"campaign" | "adset" | "ad", Row[]>;
    coverage: { since: string | null; lastSync: string | null; partial: boolean };
  };
  candidates: { widened: boolean; posts: number; items: Candidate[] };
  write: { on: boolean; global: boolean; org: boolean; message: string };
}
interface ProjectOpt { _id: string; name: string; icon?: string }

const LEVELS = [
  { id: "campaign", label: "Campanhas" },
  { id: "adset", label: "Conjuntos" },
  { id: "ad", label: "Anúncios" },
] as const;

const input = "block w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 mt-1";
const btn = "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-gray-700 text-gray-200 hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap";
const primary = "bg-brand-500 text-brand-ink px-4 py-2 rounded-lg font-semibold text-sm hover:bg-brand-400 transition disabled:opacity-60";

function money(v: number | null | undefined, currency = "BRL") {
  if (v == null) return "–";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${currency} ${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
  }
}
const pct = (v: number | null | undefined) => (v == null ? "–" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);

/** Seta de variação; para custo, subir é ruim (vermelho). */
function Delta({ v, inverse = false }: { v: number | null | undefined; inverse?: boolean }) {
  const t = fmtPct(v ?? null);
  if (t == null) return <span className="text-gray-500">sem comparação</span>;
  const good = inverse ? (v as number) <= 0 : (v as number) >= 0;
  return <span className={good ? "text-green-400" : "text-red-400"}>{(v as number) >= 0 ? <ArrowUp size={12} className="inline -mt-0.5" /> : <ArrowDown size={12} className="inline -mt-0.5" />} {t}</span>;
}

function Kpi({ label, value, hint, children, testid }: { label: string; value: string; hint?: string; children?: React.ReactNode; testid?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 min-w-0" data-testid={testid}>
      <div className="text-xs text-gray-400 truncate" title={hint}>{label}</div>
      <div className="text-xl md:text-2xl font-bold text-white mt-1 tabular-nums truncate">{value}</div>
      <div className="text-[11px] mt-1 leading-snug">{children}</div>
    </div>
  );
}

function SpendBars({ series, currency }: { series: { date: string; spend: number; purchases: number; leads: number }[]; currency: string }) {
  const max = Math.max(1, ...series.map((s) => s.spend));
  return (
    <div className="flex items-end gap-px h-24" role="img" aria-label="Investimento por dia">
      {series.map((s) => (
        <div key={s.date} className="flex-1 min-w-[2px] bg-brand-500/70 hover:bg-brand-400 rounded-t-sm relative group" style={{ height: `${Math.max(2, (s.spend / max) * 100)}%` }} title={`${s.date.split("-").reverse().join("/")}: ${money(s.spend, currency)}${s.purchases ? ` · ${s.purchases} compra(s)` : ""}${s.leads ? ` · ${s.leads} lead(s)` : ""}`} />
      ))}
    </div>
  );
}

function ConnectForm({ project, onDone, onCancel }: { project: string; onDone: () => void; onCancel?: () => void }) {
  const [actId, setActId] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await send("POST", "/api/trafego/contas", { project, adAccountId: actId, token });
    setBusy(false);
    if (!r.ok) return setErr({ msg: r.error, field: r.field });
    setToken("");
    onDone();
  }
  return (
    <Card title="Conectar conta de anúncio da Meta" hint="Só leitura: o ContentHub não pausa, não muda orçamento e não cria anúncio.">
      <form onSubmit={submit} className="space-y-3" data-testid="trafego-conectar">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="ID da conta de anúncio" hint="Gerenciador de Anúncios › conta" error={err?.field === "adAccountId" ? err.msg : undefined}>
            <input className={input} value={actId} onChange={(e) => setActId(e.target.value)} placeholder="act_803239545032201" inputMode="numeric" autoComplete="off" />
          </Field>
          <Field label="Token de acesso (login do Facebook)" error={err?.field === "token" ? err.msg : undefined}>
            <input className={input} value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder="EAA..." autoComplete="off" />
          </Field>
        </div>
        <details className="text-xs text-gray-400">
          <summary className="cursor-pointer text-gray-300">Como gerar o token</summary>
          <ol className="list-decimal ml-5 mt-2 space-y-1">
            <li>No Gerenciador de Negócios da Meta, crie um usuário do sistema (o token dele não vence) ou use o Explorador da Graph API.</li>
            <li>Marque a permissão <b>ads_read</b>. Para ler o Instagram de concorrentes, marque também <b>instagram_basic</b>, <b>instagram_manage_insights</b>, <b>pages_show_list</b> e <b>pages_read_engagement</b>.</li>
            <li>Dê acesso desse usuário à conta de anúncio e cole o token aqui. Ele fica guardado criptografado e nunca volta para a tela.</li>
          </ol>
        </details>
        {err && !["adAccountId", "token"].includes(err.field || "") && <p className="text-xs text-red-400" role="alert">{err.msg}</p>}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={busy || !actId || !token} className={primary}>{busy ? "Conferindo na Meta..." : "Conectar"}</button>
          {onCancel && <button type="button" className={linkBtn} onClick={onCancel}>Cancelar</button>}
        </div>
      </form>
    </Card>
  );
}

function Candidates({ c, title }: { c: Payload["candidates"]; title: string }) {
  return (
    <Card title={title} hint={c.widened ? "Poucos posts no período: olhando os últimos 90 dias." : "Posts do período que mais prenderam quem viu (salvou, compartilhou, comentou) em relação ao alcance."}>
      {!c.items.length ? (
        <p className="text-sm text-gray-400" data-testid="trafego-candidatos-vazio">{c.posts ? "Nenhum post com alcance suficiente para comparar." : "Sem posts do Instagram sincronizados neste projeto. Conecte o Instagram na tela Instagram."}</p>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="trafego-candidatos">
          {c.items.map((m, i) => (
            <li key={m.igId} className="border border-gray-800 rounded-lg p-3 flex gap-3 min-w-0">
              {m.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.thumbnailUrl} alt="" width={56} height={56} loading="lazy" className="w-14 h-14 rounded-md object-cover bg-gray-800 shrink-0" />
              ) : <span className="w-14 h-14 rounded-md bg-gray-800 shrink-0" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-100 truncate" title={m.caption}>{i + 1}. {(m.caption || "(sem legenda)").split("\n")[0]}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">alcance {fmt(m.reach)} · salv. {fmt(m.saved)} · comp. {fmt(m.shares)} · coment. {fmt(m.comments)}</p>
                <p className="text-[11px] mt-1 flex flex-wrap gap-x-2">
                  <span className="text-brand-400 font-semibold">interesse {m.score.toLocaleString("pt-BR")}%</span>
                  {m.inAds ? <span className="text-sky-300">já é anúncio</span> : <span className="text-amber-200">ainda não anunciado</span>}
                  {m.permalink && <a href={m.permalink} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-gray-200 inline-flex items-center gap-0.5">abrir <ExternalLink size={10} /></a>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function TrafficPanel({ projects, selectedProject, onSelectProject, canManage }: { projects: ProjectOpt[]; selectedProject: string; onSelectProject: (id: string) => void; canManage: boolean }) {
  const project = projects.some((p) => p._id === selectedProject) ? selectedProject : projects[0]?._id || "";
  const [sel, setSel] = useState<Selection | null>(null);
  const [accountId, setAccountId] = useState("");
  const [level, setLevel] = useState<"campaign" | "adset" | "ad">("campaign");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [periodError, setPeriodError] = useState<{ msg: string; field?: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const de = p.get("de") || "";
    const ate = p.get("ate") || "";
    const preset = p.get("periodo") as PeriodPreset | null;
    if (de || ate) setSel({ preset: "datas", de, ate });
    else setSel({ preset: preset && PRESET_KEYS.has(preset) && preset !== "datas" ? preset : DEFAULT_PRESET, de: "", ate: "" });
    const n = p.get("nivel");
    if (n === "adset" || n === "ad") setLevel(n);
  }, []);
  const setParam = (k: string, v: string | null) => {
    const url = new URL(window.location.href);
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
    window.history.replaceState(null, "", url);
  };
  const periodQuery = sel ? selectionQuery(sel) : "";

  const load = useCallback(async () => {
    if (!project || !sel) return;
    setLoading(true);
    const q = new URLSearchParams({ project });
    if (accountId) q.set("account", accountId);
    const r = await send<Payload>("GET", `/api/trafego/painel?${q}${periodQuery ? `&${periodQuery}` : ""}`);
    setLoading(false);
    if (r.ok) {
      setData(r.data);
      setError("");
      setPeriodError(null);
    } else if (["de", "ate", "periodo", "dias"].includes(r.field || "")) setPeriodError({ msg: r.error, field: r.field });
    else setError(r.error);
  }, [project, sel, accountId, periodQuery]);
  useEffect(() => { setData(null); setAccountId(""); setMsg(null); setConnecting(false); }, [project]);
  useEffect(() => { load(); }, [load]);

  function pickPeriod(next: Selection) {
    setSel(next);
    setParam("periodo", next.preset === "datas" || next.preset === DEFAULT_PRESET ? null : next.preset);
    setParam("de", next.preset === "datas" ? next.de : null);
    setParam("ate", next.preset === "datas" ? next.ate : null);
  }
  async function sync(days?: number) {
    if (!data?.account) return;
    setSyncing(days ? "history" : "sync");
    setMsg(null);
    const r = await send<{ results: { ok: boolean; error?: string; rows?: number; days?: number }[] }>("POST", "/api/trafego/sync", { account: data.account._id, ...(days ? { dias: days } : {}) });
    setSyncing("");
    const res = r.data?.results?.[0];
    if (!r.ok || !res) setMsg({ tone: "bad", text: r.error || "Não deu certo." });
    else if (!res.ok) setMsg({ tone: "bad", text: res.error || "Não deu certo." });
    else setMsg({ tone: "ok", text: `Pronto: ${res.days} dias buscados, ${fmt(res.rows)} linhas de números por anúncio e dia.` });
    load();
  }
  async function act(row: Row, action: "pause" | "activate" | "budget") {
    if (!data?.account) return;
    let dailyBudget: string | null = null;
    if (action === "budget") {
      dailyBudget = window.prompt(`Novo orçamento diário de "${row.name}" (${data.account.currency}):`, row.dailyBudget != null ? String(row.dailyBudget / 100) : "");
      if (!dailyBudget) return;
    }
    if (!window.confirm(`Isso muda o anúncio DE VERDADE na Meta (${action === "pause" ? "pausar" : action === "activate" ? "ativar" : `orçamento diário ${dailyBudget}`}). Continuar?`)) return;
    const r = await send("POST", "/api/trafego/acoes", { account: data.account._id, level: row.level, id: row.id, action, dailyBudget, confirm: true });
    setMsg(r.ok ? { tone: "ok", text: "Feito na Meta." } : { tone: "bad", text: r.error });
    load();
  }

  const d = data?.dashboard;
  const cur = data?.account?.currency || "BRL";
  const rows = useMemo(() => (d ? d.rows[level] : []), [d, level]);

  if (!projects.length) return <p className="text-sm text-gray-400 py-16 text-center">Crie um projeto primeiro.</p>;
  return (
    <div className="flex-1 overflow-auto p-3 md:p-6" data-testid="trafego">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-gray-400 flex items-center gap-2">Projeto
            <select className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-gray-100 max-w-[200px]" value={project} onChange={(e) => onSelectProject(e.target.value)} data-testid="trafego-projeto">
              {projects.map((p) => <option key={p._id} value={p._id}>{p.icon} {p.name}</option>)}
            </select>
          </label>
          {data && data.accounts.length > 1 && (
            <label className="text-xs text-gray-400 flex items-center gap-2">Conta
              <select className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-gray-100 max-w-[220px]" value={data.account?._id || ""} onChange={(e) => setAccountId(e.target.value)}>
                {data.accounts.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
              </select>
            </label>
          )}
          {data?.account && (
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <button type="button" className={btn} onClick={() => sync()} disabled={Boolean(syncing)} data-testid="trafego-sync"><RefreshCw size={14} className={syncing === "sync" ? "animate-spin" : ""} /> {syncing === "sync" ? "Buscando..." : "Sincronizar agora"}</button>
              <button type="button" className={btn} onClick={() => sync(365)} disabled={Boolean(syncing)} title="Busca os últimos 12 meses (pode levar 1 a 2 minutos)"><History size={14} /> {syncing === "history" ? "Buscando 12 meses..." : "Buscar 12 meses"}</button>
              <button type="button" className={btn} onClick={() => setConnecting(true)}><Plug size={14} /> Outra conta</button>
            </div>
          )}
        </div>

        {error && <Notice tone="bad">{error}</Notice>}
        {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}

        {data && !data.account && !connecting && (
          <Card>
            <div className="flex items-start gap-3">
              <Megaphone className="text-brand-400 shrink-0 mt-0.5" size={20} />
              <div className="space-y-2">
                <p className="text-sm text-gray-100 font-semibold">Este projeto ainda não tem conta de anúncio conectada.</p>
                <p className="text-sm text-gray-400">Conecte a conta da Meta para ver investimento, alcance, CPM, CPC, CTR, compras e custo por resultado no período que você escolher, por campanha, conjunto e anúncio.</p>
                <button type="button" className={primary} onClick={() => setConnecting(true)} data-testid="trafego-abrir-conectar">Conectar conta de anúncio</button>
              </div>
            </div>
          </Card>
        )}
        {connecting && <ConnectForm project={project} onCancel={() => setConnecting(false)} onDone={() => { setConnecting(false); setMsg({ tone: "ok", text: "Conta conectada. Clique em Sincronizar agora para trazer os números (a primeira busca traz 90 dias)." }); load(); }} />}

        {sel && (data?.account || !data) && <PeriodBar sel={sel} period={data?.period || null} busy={loading} serverError={periodError} onPick={pickPeriod} />}

        {data?.account && (
          <p className="text-xs text-gray-400" data-testid="trafego-conta">
            <span className="text-gray-200 font-semibold">{data.account.name}</span> · {data.account.adAccountId}
            {data.account.accountStatusText && <> · {data.account.accountStatusText}</>}
            {" · "}{data.account.lastSync ? `sincronizado em ${fmtDateTime(data.account.lastSync)}` : "ainda não sincronizado"}
            {data.account.lastSyncError && <span className="text-amber-300"> · {data.account.lastSyncError}</span>}
          </p>
        )}

        {d && (
          <>
            {d.coverage.partial && <Notice tone="warn">Os números começam em {d.coverage.since?.split("-").reverse().join("/")}, depois do início do período. Use &quot;Buscar 12 meses&quot; para trazer o que falta.</Notice>}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3" data-testid="trafego-kpis">
              <Kpi label="Investimento" value={money(d.totals.spend, cur)} testid="kpi-spend"><Delta v={d.compare.spend} /></Kpi>
              <Kpi label="Impressões" value={fmt(d.totals.impressions)}><Delta v={d.compare.impressions} /></Kpi>
              <Kpi label="Alcance" value={fmt(d.reach.value)} hint="Pessoas diferentes que viram os anúncios">
                <span className="text-gray-500">{d.reach.exact ? "pessoas únicas no período (Meta)" : "soma do alcance de cada dia: a mesma pessoa pode contar mais de uma vez"}</span>
              </Kpi>
              <Kpi label="CPM" value={money(d.totals.cpm, cur)} hint="Custo por mil impressões"><Delta v={d.compare.cpm} inverse /></Kpi>
              <Kpi label="CPC" value={money(d.totals.cpc, cur)} hint="Custo por clique (todos os cliques)"><Delta v={d.compare.cpc} inverse /></Kpi>
              <Kpi label="CTR" value={pct(d.totals.ctr)} hint="Cliques ÷ impressões"><Delta v={d.compare.ctr} /></Kpi>
              <Kpi label="Compras" value={fmt(d.totals.purchases)} hint="Compras atribuídas pela Meta (pixel/API de conversões)"><Delta v={d.compare.purchases} /></Kpi>
              <Kpi label="Custo por compra" value={money(d.totals.costPerPurchase, cur)}><Delta v={d.compare.costPerPurchase} inverse /></Kpi>
              {(d.totals.leads > 0 || (d.compare.leads ?? null) !== null) && <Kpi label="Leads" value={fmt(d.totals.leads)}><Delta v={d.compare.leads} /></Kpi>}
              {d.totals.leads > 0 && <Kpi label="Custo por lead" value={money(d.totals.costPerLead, cur)}><Delta v={d.compare.costPerLead} inverse /></Kpi>}
              {d.totals.roas != null && <Kpi label="ROAS (Meta)" value={`${d.totals.roas.toLocaleString("pt-BR")}x`} hint="Valor das compras ÷ investimento, pelo que a Meta atribui"><span className="text-gray-500">confira com as vendas reais</span></Kpi>}
            </div>
            <p className="text-[11px] text-gray-500">Compras e leads são os que a Meta atribui ao anúncio (janela padrão da conta). Venda de verdade se confere na plataforma de pagamento. {d.canCompare ? `Setas: comparação com ${data!.period.compareLabel}.` : "Sem comparação: ainda não temos os números do período anterior."}</p>

            <Card title="Investimento por dia">
              <SpendBars series={d.series} currency={cur} />
            </Card>

            <section className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <nav className="flex gap-1" aria-label="Nível">
                  {LEVELS.map((l) => (
                    <button key={l.id} type="button" onClick={() => { setLevel(l.id); setParam("nivel", l.id === "campaign" ? null : l.id); }} aria-pressed={level === l.id} data-testid={`trafego-nivel-${l.id}`} className={`text-sm px-3 py-1.5 rounded-lg ${level === l.id ? "bg-gray-800 text-white font-semibold" : "text-gray-400 hover:bg-gray-800/50"}`}>
                      {l.label} <span className="text-gray-500">{d.rows[l.id].length}</span>
                    </button>
                  ))}
                </nav>
                {!data!.write.on && <span className="text-[11px] text-gray-500 sm:ml-auto" data-testid="trafego-so-leitura">Só leitura</span>}
              </div>
              {!rows.length ? (
                <p className="text-sm text-gray-400 py-6 text-center">{data!.account!.lastSync ? "Nada com investimento no período e nada ativo." : "Clique em Sincronizar agora para trazer as campanhas."}</p>
              ) : (
                <div className="overflow-x-auto -mx-3 md:mx-0">
                  <table className="w-full text-xs md:text-sm min-w-[860px]" data-testid="trafego-tabela">
                    <thead className="text-gray-400 text-left">
                      <tr className="border-b border-gray-800">
                        <th className="py-2 px-3 font-medium">Nome</th>
                        <th className="py-2 px-2 font-medium">Situação</th>
                        <th className="py-2 px-2 font-medium text-right">Orçamento/dia</th>
                        <th className="py-2 px-2 font-medium text-right">Investido</th>
                        <th className="py-2 px-2 font-medium text-right">Impr.</th>
                        <th className="py-2 px-2 font-medium text-right">CPM</th>
                        <th className="py-2 px-2 font-medium text-right">CPC</th>
                        <th className="py-2 px-2 font-medium text-right">CTR</th>
                        <th className="py-2 px-2 font-medium text-right">Compras</th>
                        <th className="py-2 px-2 font-medium text-right">Custo/compra</th>
                        <th className="py-2 px-2 font-medium text-right">Leads</th>
                        {data!.write.on && canManage && <th className="py-2 px-2 font-medium">Ações</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                          <td className="py-2 px-3 max-w-[280px]">
                            <div className="text-gray-100 truncate" title={r.name}>{r.name}</div>
                            {(r.campaignName || r.adsetName) && r.level !== "campaign" && <div className="text-[11px] text-gray-500 truncate">{r.level === "ad" ? r.adsetName : r.campaignName}</div>}
                            {r.igPermalink && <a href={r.igPermalink} target="_blank" rel="noreferrer" className="text-[11px] text-sky-300 hover:underline">post do Instagram</a>}
                          </td>
                          <td className="py-2 px-2 whitespace-nowrap"><span className={`text-[11px] px-2 py-0.5 rounded-full ${r.active ? "bg-green-500/15 text-green-300" : "bg-gray-700/60 text-gray-300"}`}>{r.statusText}</span></td>
                          <td className="py-2 px-2 text-right tabular-nums">{r.dailyBudget != null ? money(r.dailyBudget / 100, cur) : r.lifetimeBudget != null ? <span title="Orçamento vitalício">{money(r.lifetimeBudget / 100, cur)} total</span> : "–"}</td>
                          <td className="py-2 px-2 text-right tabular-nums text-gray-100">{money(r.totals.spend, cur)}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{fmt(r.totals.impressions)}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{money(r.totals.cpm, cur)}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{money(r.totals.cpc, cur)}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{pct(r.totals.ctr)}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{fmt(r.totals.purchases)}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{money(r.totals.costPerPurchase, cur)}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{fmt(r.totals.leads)}</td>
                          {data!.write.on && canManage && (
                            <td className="py-2 px-2 whitespace-nowrap">
                              {r.status !== "DELETED" && (r.active ? <button type="button" className={linkBtn} onClick={() => act(r, "pause")}><Pause size={12} className="inline" /> pausar</button> : <button type="button" className={linkBtn} onClick={() => act(r, "activate")}><Play size={12} className="inline" /> ativar</button>)}
                              {r.level !== "ad" && r.dailyBudget != null && <button type="button" className={`${linkBtn} ml-2`} onClick={() => act(r, "budget")}>orçamento</button>}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {data && <Candidates c={data.candidates} title="Orgânicos com melhor desempenho = candidatos a anúncio" />}
        {data && !data.write.on && (
          <p className="text-[11px] text-gray-500 flex items-start gap-1.5"><Sparkles size={12} className="shrink-0 mt-0.5" /> {data.write.message}</p>
        )}
      </div>
    </div>
  );
}
