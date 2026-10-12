"use client";
/* eslint-disable react-hooks/set-state-in-effect -- estado inicial lido do link e do navegador */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, ExternalLink, RefreshCw, X } from "lucide-react";
import { type PublicAccount, api, fmt, fmtDateTime, fmtDay, fmtPct, readLocal, tokenLabel, writeLocal } from "./shared";

interface Metrics {
  reach?: number;
  views?: number;
  likes?: number;
  comments?: number;
  saved?: number;
  shares?: number;
  totalInteractions?: number;
  avgWatchTimeMs?: number;
}
interface MediaItem {
  igId: string;
  kind: "reel" | "carrossel" | "imagem" | "video" | "story";
  caption?: string;
  permalink?: string;
  timestamp: string;
  thumbnailUrl?: string;
  metrics: Metrics;
  postTitle?: string;
}
interface Delta {
  start: number;
  end: number;
  delta: number;
  pct: number | null;
  since: string;
  partial: boolean;
}
interface Compare {
  current: number;
  previous: number;
  pct: number | null;
  days: number;
}
interface Dashboard {
  followers: number | null;
  followers7: Delta | null;
  followers30: Delta | null;
  reach7: Compare;
  reach30: Compare;
  views7: Compare;
  views30: Compare;
  posts30: MediaItem[];
  top10: MediaItem[];
}
interface Payload {
  account: PublicAccount | null;
  accounts: PublicAccount[];
  dashboard: Dashboard | null;
  demo: boolean;
}
interface ProjectOpt {
  _id: string;
  name: string;
  icon?: string;
  color?: string;
}

const KIND: Record<string, { label: string; cls: string }> = {
  reel: { label: "Reel", cls: "bg-purple-500/20 text-purple-300" },
  carrossel: { label: "Carrossel", cls: "bg-cyan-500/20 text-cyan-300" },
  imagem: { label: "Imagem", cls: "bg-blue-500/20 text-blue-300" },
  video: { label: "Vídeo", cls: "bg-orange-500/20 text-orange-300" },
  story: { label: "Story", cls: "bg-orange-500/20 text-orange-300" },
};

type SortKey = "ss" | "date" | "reach" | "views" | "likes" | "comments" | "saved" | "shares" | "watch";
const ss = (m: Metrics) => (m.saved ?? 0) + (m.shares ?? 0);
const SORT_VALUE: Record<SortKey, (m: MediaItem) => number> = {
  ss: (m) => ss(m.metrics),
  date: (m) => new Date(m.timestamp).getTime(),
  reach: (m) => m.metrics.reach ?? -1,
  views: (m) => m.metrics.views ?? -1,
  likes: (m) => m.metrics.likes ?? -1,
  comments: (m) => m.metrics.comments ?? -1,
  saved: (m) => m.metrics.saved ?? -1,
  shares: (m) => m.metrics.shares ?? -1,
  watch: (m) => m.metrics.avgWatchTimeMs ?? -1,
};
const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: "ss", label: "Salv.+Comp.", title: "Salvamentos + compartilhamentos: o sinal mais forte de conteúdo útil" },
  { key: "date", label: "Data", title: "Data da publicação" },
  { key: "reach", label: "Alcance", title: "Contas únicas que viram o post" },
  { key: "views", label: "Views", title: "Vezes que o post foi visto (substituiu impressões)" },
  { key: "likes", label: "Curtidas", title: "Curtidas" },
  { key: "comments", label: "Coment.", title: "Comentários" },
  { key: "saved", label: "Salvos", title: "Salvamentos" },
  { key: "shares", label: "Compart.", title: "Compartilhamentos" },
  { key: "watch", label: "Tempo médio", title: "Tempo médio assistido (só reels)" },
];

const title = (m: MediaItem) =>
  (m.postTitle || (m.caption || "").split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#")) || "").replace(/\s+/g, " ").trim() || "(sem legenda)";
const watch = (ms?: number) => (ms == null ? "–" : `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}s`);

function setUrlParam(key: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  window.history.replaceState(null, "", url);
}

function Thumb({ m, size }: { m: MediaItem; size: number }) {
  const [broken, setBroken] = useState(false);
  return m.thumbnailUrl && !broken ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={m.thumbnailUrl} alt="" width={size} height={size} loading="lazy" onError={() => setBroken(true)} className="rounded-md object-cover shrink-0 bg-gray-800" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-md bg-gray-800 shrink-0 inline-block" style={{ width: size, height: size }} aria-hidden />
  );
}

function Trend({ pct, suffix }: { pct: number | null; suffix: string }) {
  const text = fmtPct(pct);
  if (text == null) return <span className="text-gray-500">sem comparação ainda</span>;
  const up = (pct as number) >= 0;
  return (
    <span className={up ? "text-green-400" : "text-red-400"}>
      {up ? <ArrowUp size={12} className="inline -mt-0.5" /> : <ArrowDown size={12} className="inline -mt-0.5" />} {text}
      <span className="text-gray-500"> {suffix}</span>
    </span>
  );
}

function Card({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 min-w-0">
      <div className="text-xs text-gray-400 truncate">{label}</div>
      <div className="text-2xl md:text-3xl font-bold text-white mt-1 tabular-nums">{value}</div>
      <div className="text-xs mt-1 space-y-0.5">{children}</div>
    </div>
  );
}

function FollowersLine({ d, label }: { d: Delta | null; label: string }) {
  if (!d) return <div className="text-gray-500 truncate">{label}: sem histórico ainda</div>;
  const cls = d.delta > 0 ? "text-green-400" : d.delta < 0 ? "text-red-400" : "text-gray-300";
  return (
    <div className="truncate" title={d.partial ? `Histórico começou em ${d.since.split("-").reverse().slice(0, 2).join("/")}` : undefined}>
      <span className="text-gray-400">{d.partial ? `desde ${d.since.split("-").reverse().slice(0, 2).join("/")}` : label}: </span>
      <span className={cls}>
        {d.delta > 0 ? "+" : ""}
        {fmt(d.delta)}
        {fmtPct(d.pct) ? ` (${fmtPct(d.pct)})` : ""}
      </span>
    </div>
  );
}

/** Aviso fechável no X: some até aparecer um fato novo (a chave muda). */
function Notice({ id, tone = "info", children }: { id: string; tone?: "info" | "error"; children: React.ReactNode }) {
  const [closed, setClosed] = useState(true);
  useEffect(() => setClosed(readLocal(`ig-aviso:${id}`) === "1"), [id]);
  if (closed) return null;
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs border ${tone === "error" ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-gray-700 bg-gray-800/60 text-gray-300"}`}>
      <div className="flex-1">{children}</div>
      <button
        type="button"
        aria-label="Fechar aviso"
        onClick={() => {
          writeLocal(`ig-aviso:${id}`, "1");
          setClosed(true);
        }}
        className="p-0.5 rounded hover:bg-gray-700 text-gray-400"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function ReportBox({ projectId }: { projectId: string }) {
  const [tipo, setTipo] = useState<"segunda" | "raiox">("segunda");
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    setText(null);
    api<{ reports: { text: string }[] }>(`/api/instagram/report?project=${projectId}&tipo=${tipo}`).then((r) => {
      if (alive) setText(r.ok ? r.data?.reports?.[0]?.text || "Sem conta ativa para montar o relatório." : r.error);
    });
    return () => {
      alive = false;
    };
  }, [projectId, tipo]);
  const chip = (active: boolean) => `text-xs px-3 py-1.5 rounded-full border transition ${active ? "border-brand-500 text-brand-400 bg-brand-500/10" : "border-gray-700 text-gray-400 hover:border-gray-500"}`;
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4" data-testid="ig-report">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-200 mr-auto">Relatório em texto (o mesmo que vai para o Telegram)</h3>
        <button type="button" className={chip(tipo === "segunda")} onClick={() => setTipo("segunda")}>Relatório da segunda</button>
        <button type="button" className={chip(tipo === "raiox")} onClick={() => setTipo("raiox")}>Raio-x de 30 dias</button>
        <button
          type="button"
          disabled={!text}
          onClick={() => {
            navigator.clipboard?.writeText(text || "");
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-800 flex items-center gap-1 disabled:opacity-50"
        >
          {copied ? <><Check size={12} className="text-green-400" /> Copiado</> : <><Copy size={12} /> Copiar</>}
        </button>
      </div>
      <pre className="text-xs md:text-sm text-gray-200 whitespace-pre-wrap break-words font-sans bg-gray-950/60 rounded-lg p-3 min-h-24">
        {text ?? "Montando..."}
      </pre>
    </section>
  );
}

export default function InstagramPanel({
  projects,
  selectedProject,
  onSelectProject,
  onConnect,
}: {
  projects: ProjectOpt[];
  selectedProject: string; // "all" ou id
  onSelectProject: (id: string) => void;
  onConnect: (projectId: string) => void;
}) {
  const [connectedByProject, setConnectedByProject] = useState<Record<string, string> | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ tone: "ok" | "wait" | "bad"; msg: string } | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "ss", dir: -1 });
  const [kind, setKind] = useState<string>("");
  const [showReport, setShowReport] = useState(false);

  // Filtro e ordem ficam no link.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const k = p.get("tipo");
    if (k && KIND[k]) setKind(k);
    const o = p.get("ordem") as SortKey | null;
    if (o && SORT_VALUE[o]) setSort({ key: o, dir: p.get("dir") === "asc" ? 1 : -1 });
    if (p.get("relatorio") === "1") setShowReport(true);
  }, []);

  useEffect(() => {
    api<PublicAccount[]>("/api/social-accounts").then((r) => {
      const map: Record<string, string> = {};
      for (const a of r.data || []) {
        if (a.platform !== "instagram" || !a.connected) continue;
        const pid = typeof a.project === "string" ? a.project : a.project?._id;
        if (pid && !map[pid]) map[pid] = a.username;
      }
      setConnectedByProject(map);
    });
  }, []);

  // "Todos os projetos": abre no primeiro que tem Instagram conectado.
  const projectId = useMemo(() => {
    if (selectedProject !== "all") return selectedProject;
    if (!connectedByProject) return "";
    return projects.find((p) => connectedByProject[p._id])?._id || projects[0]?._id || "";
  }, [selectedProject, connectedByProject, projects]);

  const load = useCallback(async () => {
    if (!projectId) return;
    const r = await api<Payload>(`/api/instagram/dashboard?project=${projectId}`);
    if (r.ok) {
      setData(r.data);
      setLoadError("");
    } else setLoadError(r.error);
  }, [projectId]);

  useEffect(() => {
    setData(null);
    setSyncMsg(null);
    load();
  }, [load]);

  async function syncNow() {
    if (!data?.account) return;
    setSyncing(true);
    setSyncMsg({ tone: "wait", msg: "Buscando os dados no Instagram. Pode levar um minuto..." });
    const r = await api<{ results: { ok: boolean; media: number; error?: string; warnings: string[] }[] }>("/api/instagram/sync", { account: data.account._id });
    const res = r.data?.results?.[0];
    if (r.ok && res?.ok) setSyncMsg({ tone: "ok", msg: `Pronto: ${res.media} posts atualizados.${res.warnings.length ? ` Aviso: ${res.warnings[0]}` : ""}` });
    else setSyncMsg({ tone: "bad", msg: res?.error || r.error || "Não foi possível sincronizar." });
    await load();
    setSyncing(false);
  }

  const dash = data?.dashboard;
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of dash?.posts30 || []) c[m.kind] = (c[m.kind] || 0) + 1;
    return c;
  }, [dash]);
  const rows = useMemo(() => {
    const list = (dash?.posts30 || []).filter((m) => !kind || m.kind === kind);
    const f = SORT_VALUE[sort.key];
    return [...list].sort((a, b) => (f(a) - f(b)) * sort.dir || ss(b.metrics) - ss(a.metrics));
  }, [dash, kind, sort]);

  function changeSort(key: SortKey) {
    const next = { key, dir: (sort.key === key ? -sort.dir : -1) as 1 | -1 };
    setSort(next);
    setUrlParam("ordem", key === "ss" && next.dir === -1 ? null : key);
    setUrlParam("dir", next.dir === 1 ? "asc" : null);
  }
  function changeKind(k: string) {
    setKind(k);
    setUrlParam("tipo", k || null);
  }

  const account = data?.account;
  const project = projects.find((p) => p._id === projectId);
  const chip = (active: boolean) =>
    `shrink-0 text-xs px-3 py-1.5 rounded-full border transition whitespace-nowrap ${active ? "border-brand-500 text-brand-400 bg-brand-500/10" : "border-gray-700 text-gray-300 hover:border-gray-500"}`;

  return (
    <div className="flex-1 overflow-auto" data-testid="ig-panel">
      <div className="max-w-6xl mx-auto p-3 md:p-6 space-y-4">
        {/* Projetos à vista */}
        {projects.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 md:mx-0 md:px-0">
            {projects.map((p) => (
              <button key={p._id} type="button" onClick={() => onSelectProject(p._id)} className={chip(p._id === projectId)}>
                {p.icon} {p.name}
                {connectedByProject && !connectedByProject[p._id] && <span className="text-gray-500"> · sem Instagram</span>}
              </button>
            ))}
          </div>
        )}

        {loadError && <p className="text-sm text-red-400" role="alert">{loadError}</p>}

        {!loadError && (!projectId || (projectId && !data)) && (
          <p className="text-sm text-gray-400 py-16 text-center">{projects.length === 0 ? "Crie um projeto para começar." : "Carregando..."}</p>
        )}

        {/* Estado vazio: projeto sem conta */}
        {data && !account && (
          <div className="text-center py-14 md:py-20 px-4 bg-gray-900 border border-gray-800 rounded-xl" data-testid="ig-empty">
            <h3 className="text-lg font-bold text-white">
              {project ? `${project.name} ainda não tem Instagram conectado` : "Nenhum Instagram conectado"}
            </h3>
            <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto">
              Conecte a conta do Instagram desse projeto. Depois disso aparecem aqui os seguidores, o alcance e o desempenho de cada post.
            </p>
            <button
              type="button"
              onClick={() => onConnect(projectId)}
              className="mt-5 bg-brand-500 text-brand-ink font-bold px-5 py-2.5 rounded-lg hover:bg-brand-400 transition text-sm"
            >
              Conectar Instagram
            </button>
          </div>
        )}

        {data && account && dash && (
          <>
            {/* Cabeçalho da conta + ação principal */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 mr-auto">
                <h2 className="text-lg md:text-xl font-bold text-white truncate">@{account.username}</h2>
                <p className="text-xs text-gray-400 md:truncate">
                  {account.lastSync ? `Última sincronização: ${fmtDateTime(account.lastSync)}` : "Ainda não sincronizada"}
                  <span className="text-gray-600"> · </span>
                  <span className={tokenLabel(account).tone === "ok" ? "" : "text-yellow-400"}>token {tokenLabel(account).text}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowReport(!showReport);
                  setUrlParam("relatorio", showReport ? null : "1");
                }}
                className="text-sm text-gray-300 hover:text-white underline-offset-4 hover:underline"
              >
                {showReport ? "Esconder relatório" : "Ver relatório"}
              </button>
              <button
                type="button"
                onClick={syncNow}
                disabled={syncing}
                className="flex items-center gap-2 bg-brand-500 text-brand-ink px-4 py-2 rounded-lg font-semibold text-sm hover:bg-brand-400 transition disabled:opacity-60"
              >
                <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
                {syncing ? "Sincronizando..." : "Sincronizar agora"}
              </button>
            </div>

            {syncMsg && (
              <p role="status" className={`text-xs ${syncMsg.tone === "ok" ? "text-green-400" : syncMsg.tone === "bad" ? "text-red-400" : "text-gray-400"}`}>
                {syncMsg.msg}
              </p>
            )}
            {data.demo && (
              <div className="rounded-lg px-3 py-2 text-xs border border-yellow-500/40 bg-yellow-500/10 text-yellow-300">
                Dados de exemplo (modo demonstração). Nada aqui veio do Instagram de verdade.
              </div>
            )}
            {account.lastSyncError && !syncMsg && (
              <Notice id={`erro:${account._id}:${account.lastSyncError}`} tone="error">
                A última sincronização falhou: {account.lastSyncError}
              </Notice>
            )}
            <Notice id="atraso-48h-v1">
              Os dados da Meta podem atrasar até 48h. Alcance e views dos últimos 2 dias ainda podem subir.
            </Notice>

            {!account.lastSync ? (
              <div className="text-center py-14 px-4 bg-gray-900 border border-gray-800 rounded-xl">
                <h3 className="text-lg font-bold text-white">Conta conectada. Falta a primeira sincronização.</h3>
                <p className="text-sm text-gray-400 mt-2">Clique em Sincronizar agora para buscar os posts e as métricas dos últimos 30 dias.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="ig-cards">
                  <Card label="Seguidores" value={fmt(dash.followers ?? account.followersCount)}>
                    <FollowersLine d={dash.followers7} label="7 dias" />
                    <FollowersLine d={dash.followers30} label="30 dias" />
                  </Card>
                  <Card label="Alcance · 7 dias" value={dash.reach7.days ? fmt(dash.reach7.current) : "–"}>
                    <div className="truncate"><Trend pct={dash.reach7.pct} suffix="vs 7 dias antes" /></div>
                  </Card>
                  <Card label="Views · 7 dias" value={dash.views7.days ? fmt(dash.views7.current) : "–"}>
                    <div className="truncate"><Trend pct={dash.views7.pct} suffix="vs 7 dias antes" /></div>
                  </Card>
                  <Card label="Alcance · 30 dias" value={dash.reach30.days ? fmt(dash.reach30.current) : "–"}>
                    <div className="truncate"><Trend pct={dash.reach30.pct} suffix="vs 30 dias antes" /></div>
                  </Card>
                </div>

                {showReport && <ReportBox projectId={projectId} />}

                {dash.posts30.length === 0 ? (
                  <div className="text-center py-12 px-4 bg-gray-900 border border-gray-800 rounded-xl">
                    <h3 className="text-base font-bold text-white">Nenhum post nos últimos 30 dias</h3>
                    <p className="text-sm text-gray-400 mt-2">Assim que a conta publicar, o post aparece aqui na próxima sincronização.</p>
                  </div>
                ) : (
                  <>
                    <section data-testid="ig-top10">
                      <h3 className="text-sm font-semibold text-gray-200 mb-2">
                        Top {dash.top10.length} dos últimos 30 dias <span className="text-gray-500 font-normal">por salvamentos + compartilhamentos</span>
                      </h3>
                      <div className="flex gap-3 overflow-x-auto pb-2 -mx-3 px-3 md:mx-0 md:px-0">
                        {dash.top10.map((m, i) => (
                          <a
                            key={m.igId}
                            href={m.permalink || "#"}
                            target="_blank"
                            rel="noreferrer"
                            title={title(m)}
                            className="shrink-0 w-36 bg-gray-900 border border-gray-800 rounded-xl p-2 hover:border-gray-600 transition"
                          >
                            <div className="relative">
                              <Thumb m={m} size={128} />
                              <span className="absolute top-1 left-1 bg-black/70 text-brand-400 text-xs font-bold rounded px-1.5 py-0.5">{i + 1}º</span>
                              <span className={`absolute bottom-1 left-1 text-[10px] rounded px-1.5 py-0.5 bg-black/70 ${KIND[m.kind]?.cls.split(" ")[1]}`}>{KIND[m.kind]?.label}</span>
                            </div>
                            <div className="text-xs text-gray-300 truncate mt-2">{title(m)}</div>
                            <div className="text-sm font-bold text-white tabular-nums mt-0.5">
                              {fmt(ss(m.metrics))} <span className="text-[10px] font-normal text-gray-400">salv.+comp.</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    </section>

                    <section data-testid="ig-table">
                      <div className="flex items-center gap-2 mb-2 overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
                        <h3 className="text-sm font-semibold text-gray-200 mr-1 shrink-0">Posts dos últimos 30 dias</h3>
                        <button type="button" className={chip(!kind)} onClick={() => changeKind("")}>Todos ({dash.posts30.length})</button>
                        {Object.keys(KIND).filter((k) => counts[k]).map((k) => (
                          <button key={k} type="button" className={chip(kind === k)} onClick={() => changeKind(kind === k ? "" : k)}>
                            {KIND[k].label} ({counts[k]})
                            {kind === k && <X size={12} className="inline ml-1 -mt-0.5" />}
                          </button>
                        ))}
                      </div>
                      <div className="overflow-x-auto bg-gray-900 border border-gray-800 rounded-xl">
                        <table className="w-full text-sm whitespace-nowrap">
                          <thead>
                            <tr className="text-xs text-gray-400 border-b border-gray-800">
                              <th className="text-left font-medium px-3 py-2 sticky left-0 bg-gray-900 z-10">Post</th>
                              {COLUMNS.map((c) => (
                                <th key={c.key} className="text-right font-medium px-2 py-2" aria-sort={sort.key === c.key ? (sort.dir === -1 ? "descending" : "ascending") : undefined}>
                                  <button type="button" title={c.title} onClick={() => changeSort(c.key)} className={`inline-flex items-center gap-0.5 hover:text-white ${sort.key === c.key ? "text-brand-400" : ""}`}>
                                    {c.label}
                                    {sort.key === c.key && (sort.dir === -1 ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                                  </button>
                                </th>
                              ))}
                              <th className="px-2 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((m) => (
                              <tr key={m.igId} className="border-b border-gray-800/60 last:border-0 hover:bg-gray-800/40">
                                <td className="px-3 py-1.5 sticky left-0 bg-gray-900 z-10">
                                  <div className="flex items-center gap-2 w-44 sm:w-64 lg:w-80">
                                    <Thumb m={m} size={32} />
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 hidden sm:inline ${KIND[m.kind]?.cls}`}>{KIND[m.kind]?.label}</span>
                                    <span className="truncate text-gray-100" title={title(m)}>{title(m)}</span>
                                  </div>
                                </td>
                                <td className="text-right px-2 tabular-nums font-bold text-brand-400">{fmt(ss(m.metrics))}</td>
                                <td className="text-right px-2 text-gray-300 tabular-nums">{fmtDay(m.timestamp)}</td>
                                <td className="text-right px-2 tabular-nums">{fmt(m.metrics.reach)}</td>
                                <td className="text-right px-2 tabular-nums">{fmt(m.metrics.views)}</td>
                                <td className="text-right px-2 tabular-nums">{fmt(m.metrics.likes)}</td>
                                <td className="text-right px-2 tabular-nums">{fmt(m.metrics.comments)}</td>
                                <td className="text-right px-2 tabular-nums">{fmt(m.metrics.saved)}</td>
                                <td className="text-right px-2 tabular-nums">{fmt(m.metrics.shares)}</td>
                                <td className="text-right px-2 tabular-nums text-gray-300">{m.kind === "reel" ? watch(m.metrics.avgWatchTimeMs) : "–"}</td>
                                <td className="px-2">
                                  {m.permalink && (
                                    <a href={m.permalink} target="_blank" rel="noreferrer" aria-label="Abrir no Instagram" title="Abrir no Instagram" className="text-gray-400 hover:text-white inline-flex p-1">
                                      <ExternalLink size={14} />
                                    </a>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 md:hidden">Arraste a tabela para o lado para ver todas as colunas.</p>
                    </section>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
