"use client";
/* eslint-disable react-hooks/set-state-in-effect -- estado inicial lido do link e do navegador */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CalendarDays, Check, Copy, ExternalLink, History, RefreshCw, X } from "lucide-react";
import { dayKey, formatDayBR } from "@/lib/instagram/dates";
import { DEFAULT_PRESET, PERIOD_PRESETS, type Period, type PeriodPreset, resolvePeriod } from "@/lib/instagram/period";
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
  expectedDays: number;
  prevDays: number;
}
interface Dashboard {
  today: string;
  followers: number | null;
  followersDelta: Delta | null;
  reach: Compare;
  views: Compare;
  posts: MediaItem[];
  top10: MediaItem[];
  postsReach: number;
  postsViews: number;
  prevPosts: number | null;
  prevPostsReach: number | null;
  coverage: { accountSince: string | null; followersSince: string | null; mediaSince: string | null };
  postsIncomplete: boolean;
  accountIncomplete: boolean;
}
interface Payload {
  account: PublicAccount | null;
  accounts: PublicAccount[];
  dashboard: Dashboard | null;
  period: Period;
  totals?: { posts: number; oldestPost: string | null };
  demo: boolean;
}
interface Selection {
  preset: PeriodPreset;
  de: string;
  ate: string;
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

const NO_COMPARE = "sem comparação ainda";

function Trend({ pct, suffix }: { pct: number | null; suffix: string }) {
  const text = fmtPct(pct);
  if (text == null) return <span className="text-gray-500">{NO_COMPARE}</span>;
  const up = (pct as number) >= 0;
  return (
    <span className={up ? "text-green-400" : "text-red-400"}>
      {up ? <ArrowUp size={12} className="inline -mt-0.5" /> : <ArrowDown size={12} className="inline -mt-0.5" />} {text}
      <span className="text-gray-500"> {suffix}</span>
    </span>
  );
}

function Card({ label, value, testid, children }: { label: string; value: string; testid?: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 min-w-0" data-testid={testid}>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-2xl md:text-3xl font-bold text-white mt-1 tabular-nums">{value}</div>
      <div className="text-xs mt-1 space-y-1">{children}</div>
    </div>
  );
}

const Hint = ({ children }: { children: React.ReactNode }) => <p className="text-[11px] leading-snug text-gray-500">{children}</p>;

function FollowersLine({ d, period, since }: { d: Delta | null; period: Period; since: string | null }) {
  if (!d)
    return (
      <>
        <div className="text-gray-500">{NO_COMPARE}</div>
        <Hint>
          {since
            ? `O Instagram não entrega seguidores de antes da conexão. Histórico desde ${formatDayBR(since, true)}.`
            : "Começa a contar na primeira sincronização."}
        </Hint>
      </>
    );
  const cls = d.delta > 0 ? "text-green-400" : d.delta < 0 ? "text-red-400" : "text-gray-300";
  return (
    <>
      <div>
        <span className={cls}>
          {d.delta > 0 ? "+" : ""}
          {fmt(d.delta)}
          {fmtPct(d.pct) ? ` (${fmtPct(d.pct)})` : ""}
        </span>
        <span className="text-gray-500"> {d.partial ? `desde ${formatDayBR(d.since)}` : `em ${period.label}`}</span>
      </div>
      {d.partial && <Hint>O histórico de seguidores começou em {formatDayBR(d.since, true)}, depois do início do período.</Hint>}
    </>
  );
}

/** Seletor de período: atalhos à vista + "Datas" (de/até) na própria tela. O que vale fica no link. */
function PeriodBar({
  sel,
  period,
  busy,
  serverError,
  onPick,
}: {
  sel: Selection;
  period: Period | null;
  busy: boolean;
  serverError: { msg: string; field?: string } | null;
  onPick: (s: Selection) => void;
}) {
  const [today] = useState(() => dayKey(Date.now()));
  const [open, setOpen] = useState(sel.preset === "datas");
  const [de, setDe] = useState(sel.de);
  const [ate, setAte] = useState(sel.ate);
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  useEffect(() => {
    if (sel.preset === "datas") {
      setOpen(true);
      setDe(sel.de);
      setAte(sel.ate);
    }
  }, [sel]);
  const shown = err || (open ? serverError : null);
  const chip = (active: boolean) =>
    `text-xs px-3 py-1.5 rounded-full border transition whitespace-nowrap ${active ? "border-brand-500 text-brand-400 bg-brand-500/10 font-semibold" : "border-gray-700 text-gray-300 hover:border-gray-500"}`;
  const input = (bad: boolean) =>
    `block w-full bg-gray-800 border rounded-lg px-2 py-1.5 text-sm text-gray-100 [color-scheme:dark] ${bad ? "border-red-500" : "border-gray-700"}`;

  function apply(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!de) throw Object.assign(new Error("Escolha a data inicial."), { field: "de" });
      if (!ate) throw Object.assign(new Error("Escolha a data final."), { field: "ate" });
      resolvePeriod({ de, ate });
    } catch (x) {
      const f = x as { message: string; field?: string };
      setErr({ msg: f.message, field: f.field });
      return;
    }
    setErr(null);
    onPick({ preset: "datas", de, ate });
  }

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2" data-testid="ig-period" aria-label="Período">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400 w-full sm:w-auto sm:mr-1">Período</span>
        {PERIOD_PRESETS.map((p) => {
          const active = p.key === "datas" ? open : !open && sel.preset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={active}
              data-testid={`ig-period-${p.key}`}
              className={chip(active)}
              onClick={() => {
                setErr(null);
                if (p.key === "datas") {
                  // abre o formulário já com o período que está na tela
                  if (!open) {
                    setDe(sel.preset === "datas" ? sel.de : period?.from || "");
                    setAte(sel.preset === "datas" ? sel.ate : period?.to || "");
                  }
                  setOpen(true);
                } else {
                  setOpen(false);
                  onPick({ preset: p.key, de: "", ate: "" });
                }
              }}
            >
              {p.key === "datas" && <CalendarDays size={12} className="inline mr-1 -mt-0.5" />}
              {p.label}
            </button>
          );
        })}
      </div>

      {open && (
        <form onSubmit={apply} className="flex flex-wrap items-end gap-2" data-testid="ig-period-dates" noValidate>
          <label className="text-xs text-gray-400 flex-1 min-w-[8.5rem] max-w-[12rem]">
            De
            <input type="date" value={de} max={ate || today} onChange={(e) => { setDe(e.target.value); setErr(null); }} className={input(shown?.field === "de")} aria-invalid={shown?.field === "de"} />
          </label>
          <label className="text-xs text-gray-400 flex-1 min-w-[8.5rem] max-w-[12rem]">
            Até
            <input type="date" value={ate} min={de || undefined} max={today} onChange={(e) => { setAte(e.target.value); setErr(null); }} className={input(shown?.field === "ate")} aria-invalid={shown?.field === "ate"} />
          </label>
          <button type="submit" disabled={busy} className="bg-brand-500 text-brand-ink px-4 py-1.5 rounded-lg font-semibold text-sm hover:bg-brand-400 transition disabled:opacity-60">
            Aplicar
          </button>
          {shown && <p role="alert" className="text-xs text-red-400 w-full" data-testid="ig-period-error">{shown.msg}</p>}
        </form>
      )}

      {period && (
        <p className="text-xs text-gray-400" data-testid="ig-period-label">
          Mostrando <span className="text-gray-100 font-semibold">{formatDayBR(period.from, true)} a {formatDayBR(period.to, true)}</span>
          <span className="text-gray-500"> · {period.days} {period.days === 1 ? "dia" : "dias"} · comparado com {period.compareLabel} ({period.prevLabel})</span>
          {busy && <span className="text-gray-500"> · atualizando...</span>}
        </p>
      )}
    </section>
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

function ReportBox({ projectId, periodQuery, periodName }: { projectId: string; periodQuery: string; periodName: string }) {
  const [tipo, setTipo] = useState<"periodo" | "segunda" | "raiox">("periodo");
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    setText(null);
    const q = tipo === "periodo" ? periodQuery || `periodo=${DEFAULT_PRESET}` : `tipo=${tipo}`;
    api<{ reports: { text: string }[] }>(`/api/instagram/report?project=${projectId}&${q}`).then((r) => {
      if (alive) setText(r.ok ? r.data?.reports?.[0]?.text || "Sem conta ativa para montar o relatório." : r.error);
    });
    return () => {
      alive = false;
    };
  }, [projectId, tipo, periodQuery]);
  const chip = (active: boolean) => `text-xs px-3 py-1.5 rounded-full border transition ${active ? "border-brand-500 text-brand-400 bg-brand-500/10" : "border-gray-700 text-gray-400 hover:border-gray-500"}`;
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4" data-testid="ig-report">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-200 mr-auto">Relatório em texto (pronto para copiar)</h3>
        <button type="button" className={chip(tipo === "periodo")} onClick={() => setTipo("periodo")}>Do período ({periodName})</button>
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

const PRESET_KEYS = new Set(PERIOD_PRESETS.map((p) => p.key));
const selectionQuery = (s: Selection) =>
  s.preset === "datas" ? `de=${s.de}&ate=${s.ate}` : s.preset === DEFAULT_PRESET ? "" : `periodo=${s.preset}`;

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
  const [periodError, setPeriodError] = useState<{ msg: string; field?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<"" | "sync" | "history">("");
  const [syncMsg, setSyncMsg] = useState<{ tone: "ok" | "wait" | "bad"; msg: string } | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "ss", dir: -1 });
  const [kind, setKind] = useState<string>("");
  const [showReport, setShowReport] = useState(false);
  // null até ler o link: assim a primeira busca já sai com o período certo.
  const [sel, setSel] = useState<Selection | null>(null);

  // Período, filtro e ordem ficam no link.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const k = p.get("tipo");
    if (k && KIND[k]) setKind(k);
    const o = p.get("ordem") as SortKey | null;
    if (o && SORT_VALUE[o]) setSort({ key: o, dir: p.get("dir") === "asc" ? 1 : -1 });
    if (p.get("relatorio") === "1") setShowReport(true);
    const de = p.get("de") || "";
    const ate = p.get("ate") || "";
    const preset = p.get("periodo") as PeriodPreset | null;
    if (de || ate) setSel({ preset: "datas", de, ate });
    else setSel({ preset: preset && PRESET_KEYS.has(preset) && preset !== "datas" ? preset : DEFAULT_PRESET, de: "", ate: "" });
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

  const periodQuery = sel ? selectionQuery(sel) : "";
  const ready = sel !== null;

  const load = useCallback(async () => {
    if (!projectId || !ready) return;
    setLoading(true);
    const r = await api<Payload>(`/api/instagram/dashboard?project=${projectId}${periodQuery ? `&${periodQuery}` : ""}`);
    setLoading(false);
    if (r.ok) {
      setData(r.data);
      setLoadError("");
      setPeriodError(null);
    } else if (r.field === "de" || r.field === "ate" || r.field === "periodo" || r.field === "dias") {
      // período recusado pelo servidor: o erro fica ao lado do campo e a tela não some
      setPeriodError({ msg: r.error, field: r.field });
    } else setLoadError(r.error);
  }, [projectId, periodQuery, ready]);

  // Trocar de projeto limpa a tela; trocar de período mantém os números até chegarem os novos.
  useEffect(() => {
    setData(null);
    setSyncMsg(null);
  }, [projectId]);
  useEffect(() => {
    load();
  }, [load]);

  function pickPeriod(next: Selection) {
    setSel(next);
    setPeriodError(null);
    setUrlParam("periodo", next.preset === "datas" || next.preset === DEFAULT_PRESET ? null : next.preset);
    setUrlParam("de", next.preset === "datas" ? next.de : null);
    setUrlParam("ate", next.preset === "datas" ? next.ate : null);
  }

  async function runSync(history: boolean) {
    if (!data?.account) return;
    setSyncing(history ? "history" : "sync");
    setSyncMsg({
      tone: "wait",
      msg: history
        ? "Buscando até 12 meses de posts no Instagram. Pode levar alguns minutos; não feche a página..."
        : "Buscando os dados no Instagram. Pode levar um minuto...",
    });
    type Res = { ok: boolean; media: number; error?: string; warnings: string[]; history: boolean; mediaSince: string | null; oldestPost: string | null };
    const r = await api<{ results: Res[] }>("/api/instagram/sync", { account: data.account._id, ...(history ? { historico: true } : {}) });
    const res = r.data?.results?.[0];
    if (r.ok && res?.ok) {
      const warn = res.warnings.length ? ` Aviso: ${res.warnings[0]}` : "";
      setSyncMsg({
        tone: res.warnings.length ? "wait" : "ok",
        msg: res.history
          ? `Histórico buscado: ${res.media} posts${res.oldestPost ? `, o mais antigo de ${fmtDay(res.oldestPost, true)}` : ""}.${warn}`
          : `Pronto: ${res.media} posts atualizados.${warn}`,
      });
    } else setSyncMsg({ tone: "bad", msg: res?.error || r.error || "Não foi possível sincronizar." });
    await load();
    setSyncing("");
  }

  const dash = data?.dashboard;
  const period = data?.period ?? null;
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of dash?.posts || []) c[m.kind] = (c[m.kind] || 0) + 1;
    return c;
  }, [dash]);
  const rows = useMemo(() => {
    const list = (dash?.posts || []).filter((m) => !kind || m.kind === kind);
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
  const cov = dash?.coverage;
  const vsLabel = period ? `vs ${period.compareLabel}` : "";
  const partialDays = (m: Compare) => (m.days > 0 && m.days < m.expectedDays ? `Dado de ${m.days} de ${m.expectedDays} dias do período.` : "");

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

        {!loadError && !periodError && (!projectId || (projectId && !data)) && (
          <p className="text-sm text-gray-400 py-16 text-center">{projects.length === 0 ? "Crie um projeto para começar." : "Carregando..."}</p>
        )}

        {/* Link com período inválido e nada na tela ainda: o seletor aparece para consertar */}
        {!data && periodError && sel && (
          <PeriodBar sel={sel} period={null} busy={loading} serverError={periodError} onPick={pickPeriod} />
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

        {data && account && dash && period && sel && (
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
                onClick={() => runSync(false)}
                disabled={Boolean(syncing)}
                className="flex items-center gap-2 bg-brand-500 text-brand-ink px-4 py-2 rounded-lg font-semibold text-sm hover:bg-brand-400 transition disabled:opacity-60"
              >
                <RefreshCw size={16} className={syncing === "sync" ? "animate-spin" : ""} />
                {syncing === "sync" ? "Sincronizando..." : "Sincronizar agora"}
              </button>
            </div>

            {syncMsg && (
              <p role="status" data-testid="ig-sync-msg" className={`text-xs ${syncMsg.tone === "ok" ? "text-green-400" : syncMsg.tone === "bad" ? "text-red-400" : "text-gray-400"}`}>
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
                <p className="text-sm text-gray-400 mt-2">Clique em Sincronizar agora para buscar os posts dos últimos 12 meses e as métricas da conta.</p>
              </div>
            ) : (
              <>
                <PeriodBar sel={sel} period={period} busy={loading} serverError={periodError} onPick={pickPeriod} />

                {/* Até onde vai o dado */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400" data-testid="ig-coverage">
                  <span>
                    {cov?.mediaSince ? <>Posts desde <span className="text-gray-200">{formatDayBR(cov.mediaSince, true)}</span></> : "Posts ainda não buscados"}
                    <span className="text-gray-600"> · </span>
                    {cov?.accountSince ? <>alcance e views da conta desde <span className="text-gray-200">{formatDayBR(cov.accountSince, true)}</span></> : "alcance da conta ainda sem dado"}
                    <span className="text-gray-600"> · </span>
                    {cov?.followersSince ? <>seguidores desde <span className="text-gray-200">{formatDayBR(cov.followersSince, true)}</span></> : "seguidores ainda sem histórico"}
                  </span>
                  <button
                    type="button"
                    onClick={() => runSync(true)}
                    disabled={Boolean(syncing)}
                    data-testid="ig-history"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-800 disabled:opacity-60"
                  >
                    <History size={12} className={syncing === "history" ? "animate-spin" : ""} />
                    {syncing === "history" ? "Buscando histórico..." : "Buscar histórico (12 meses)"}
                  </button>
                  <span className="w-full text-[11px] text-gray-500">
                    Seguidores só existem a partir da conexão (o Instagram não entrega os antigos). Do alcance diário da conta o Instagram guarda no máximo os últimos 90 dias.
                  </span>
                </div>

                {(dash.postsIncomplete || dash.accountIncomplete) && (
                  <div className="rounded-lg px-3 py-2 text-xs border border-gray-700 bg-gray-800/60 text-gray-300" data-testid="ig-incomplete">
                    O período escolhido vai além do dado que temos.
                    {dash.postsIncomplete && <> Posts: {cov?.mediaSince ? `só desde ${formatDayBR(cov.mediaSince, true)} (use Buscar histórico para ir até 12 meses).` : "ainda não buscados."}</>}
                    {dash.accountIncomplete && <> Alcance e views da conta: {dash.reach.days > 0 ? `há dado em ${dash.reach.days} de ${dash.reach.expectedDays} dias do período.` : "nenhum dia do período tem dado."}</>}
                  </div>
                )}

                <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 transition-opacity ${loading ? "opacity-60" : ""}`} data-testid="ig-cards">
                  <Card label="Seguidores hoje" value={fmt(dash.followers ?? account.followersCount)} testid="ig-card-followers">
                    <FollowersLine d={dash.followersDelta} period={period} since={cov?.followersSince ?? null} />
                  </Card>
                  <Card label={`Alcance da conta · ${period.label}`} value={dash.reach.days ? fmt(dash.reach.current) : "–"} testid="ig-card-reach">
                    <div>{dash.reach.days ? <Trend pct={dash.reach.pct} suffix={vsLabel} /> : <span className="text-gray-500">sem dado no período</span>}</div>
                    <Hint>Soma dos dias: a mesma pessoa pode contar mais de uma vez. Inclui stories, anúncios e posts antigos. {partialDays(dash.reach)}</Hint>
                  </Card>
                  <Card label="Alcance dos posts do período" value={dash.posts.length ? fmt(dash.postsReach) : "–"} testid="ig-card-posts-reach">
                    <div>
                      {dash.posts.length === 0 ? (
                        <span className="text-gray-500">nenhum post no período</span>
                      ) : dash.prevPostsReach != null && dash.prevPostsReach > 0 ? (
                        <Trend pct={((dash.postsReach - dash.prevPostsReach) / dash.prevPostsReach) * 100} suffix={vsLabel} />
                      ) : (
                        <span className="text-gray-500">{NO_COMPARE}</span>
                      )}
                    </div>
                    <Hint>
                      {dash.posts.length === 0
                        ? "Soma do alcance dos posts publicados no período. Não entra story, anúncio nem post antigo."
                        : `Soma do alcance de cada um dos ${dash.posts.length} ${dash.posts.length === 1 ? "post publicado" : "posts publicados"} de ${period.label}. Não entra story, anúncio nem post antigo.`}
                    </Hint>
                  </Card>
                  <Card label={`Views da conta · ${period.label}`} value={dash.views.days ? fmt(dash.views.current) : "–"} testid="ig-card-views">
                    <div>{dash.views.days ? <Trend pct={dash.views.pct} suffix={vsLabel} /> : <span className="text-gray-500">sem dado no período</span>}</div>
                    <Hint>Vezes que qualquer conteúdo da conta foi visto. {partialDays(dash.views)}</Hint>
                  </Card>
                </div>
                <p className="text-[11px] text-gray-500 -mt-2" data-testid="ig-reach-explain">
                  Por que os dois alcances são diferentes: o da conta soma o alcance de cada dia (quem viu a conta em 5 dias conta 5 vezes) e inclui stories, anúncios e posts antigos; o dos posts soma só os posts publicados no período. Não são o mesmo número e um não deve bater com o outro.
                </p>

                {showReport && <ReportBox projectId={projectId} periodQuery={periodQuery} periodName={period.label} />}

                {dash.posts.length === 0 ? (
                  <div className="text-center py-12 px-4 bg-gray-900 border border-gray-800 rounded-xl" data-testid="ig-no-posts">
                    <h3 className="text-base font-bold text-white">Nenhum post publicado de {period.label}</h3>
                    <p className="text-sm text-gray-400 mt-2">
                      {dash.postsIncomplete
                        ? cov?.mediaSince
                          ? `Os posts só foram buscados desde ${formatDayBR(cov.mediaSince, true)}. Use Buscar histórico (12 meses) ou escolha outro período.`
                          : "Os posts dessa conta ainda não foram buscados. Clique em Sincronizar agora."
                        : "A conta não publicou nesse período. Escolha outro período acima."}
                    </p>
                  </div>
                ) : (
                  <>
                    <section data-testid="ig-top10" className={loading ? "opacity-60" : ""}>
                      <h3 className="text-sm font-semibold text-gray-200 mb-2">
                        Top {dash.top10.length} de {period.label} <span className="text-gray-500 font-normal">por salvamentos + compartilhamentos</span>
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

                    <section data-testid="ig-table" className={loading ? "opacity-60" : ""}>
                      <div className="flex items-center gap-2 mb-2 overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
                        <h3 className="text-sm font-semibold text-gray-200 mr-1 shrink-0">Posts de {period.label}</h3>
                        <button type="button" className={chip(!kind)} onClick={() => changeKind("")}>Todos ({dash.posts.length})</button>
                        {Object.keys(KIND).filter((k) => counts[k] || kind === k).map((k) => (
                          <button key={k} type="button" className={chip(kind === k)} onClick={() => changeKind(kind === k ? "" : k)}>
                            {KIND[k].label} ({counts[k] || 0})
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
                            {rows.length === 0 && (
                              <tr>
                                <td colSpan={COLUMNS.length + 2} className="px-3 py-6 text-center text-gray-400">
                                  Nenhum {KIND[kind]?.label.toLowerCase() || "post"} nesse período. Tire o filtro para ver os outros.
                                </td>
                              </tr>
                            )}
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
                                <td className="text-right px-2 text-gray-300 tabular-nums">{fmtDay(m.timestamp, m.timestamp.slice(0, 4) !== dash.today.slice(0, 4))}</td>
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
