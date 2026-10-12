"use client";
/* eslint-disable react-hooks/set-state-in-effect -- carrega o estudo ao abrir e ao trocar o período */

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Lightbulb, RefreshCw } from "lucide-react";
import { send } from "@/components/http";
import { CAT_CLS, GapNotice, type GapT, SimpleBadge, type StudyT, fmtWait } from "./PostComments";
import { fmt, fmtDateTime, fmtDay } from "./shared";

interface PostRow { igId: string; title: string; kind: string; timestamp: string; permalink: string; thumbnailUrl: string; reported: number; fetched: number | null; unanswered: number; questions: number; error: string }
interface Payload {
  account: { _id: string; username: string } | null;
  period: { label: string; from: string; to: string };
  study: StudyT | null;
  gap: GapT | null;
  posts: PostRow[];
  report: string;
  labels: Record<string, string>;
  demo: boolean;
}

const Box = ({ title, children, testid, className = "" }: { title: string; children: React.ReactNode; testid?: string; className?: string }) => (
  <section className={`bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 min-w-0 ${className}`} data-testid={testid}>
    <h3 className="text-sm font-semibold text-gray-200 mb-2">{title}</h3>
    {children}
  </section>
);

function Stat({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 min-w-0">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-2xl md:text-3xl font-bold text-white mt-1 tabular-nums">{value}</div>
      <div className="text-[11px] leading-snug text-gray-500 mt-1">{children}</div>
    </div>
  );
}

// ESTUDO DOS COMENTÁRIOS dos posts publicados no período escolhido na tela Instagram.
export default function CommentStudy({ projectId, periodQuery, onOpenPost, refreshKey }: { projectId: string; periodQuery: string; onOpenPost: (igId: string) => void; refreshKey: number }) {
  const [d, setD] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "wait" | "bad"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const r = await send<Payload>("GET", `/api/instagram/comments/study?project=${projectId}${periodQuery ? `&${periodQuery}` : ""}`);
    if (!r.ok || !r.data) return setError(r.error);
    setError("");
    setD(r.data);
  }, [projectId, periodQuery]);
  useEffect(() => { load(); }, [load, refreshKey]);

  async function fetchAll() {
    if (!d?.account) return;
    setBusy(true);
    setMsg({ tone: "wait", text: "Buscando no Instagram os comentários dos posts do período. Pode levar alguns minutos; não feche a página..." });
    const body: Record<string, string> = { account: d.account._id, de: d.period.from, ate: d.period.to };
    const r = await send<{ ok: boolean; checked: number; medias: number; reported: number; fetched: number; added: number; stopped: string; error?: string }>("POST", "/api/instagram/comments/sync", body);
    setBusy(false);
    if (r.ok && r.data?.ok) {
      const x = r.data;
      setMsg({ tone: x.stopped ? "wait" : "ok", text: `Pronto: ${fmt(x.checked)} de ${fmt(x.medias)} posts conferidos. O Instagram informou ${fmt(x.reported)} comentários e liberou ${fmt(x.fetched)}${x.added ? ` (${fmt(x.added)} novos)` : ""}.${x.stopped ? ` Parou antes do fim: ${x.stopped}. Busque de novo para continuar.` : ""}` });
    } else setMsg({ tone: "bad", text: r.data?.error || r.error || "Não foi possível buscar os comentários." });
    await load();
  }

  if (error) return <p className="text-sm text-red-400" role="alert">{error}</p>;
  if (!d) return <p className="text-sm text-gray-400 py-10 text-center">Carregando comentários...</p>;
  const s = d.study;
  const gap = d.gap;
  if (!d.account || !s || !gap) return <p className="text-sm text-gray-400 py-10 text-center">Conecte o Instagram deste projeto para ver os comentários.</p>;
  const sentTotal = s.sentiment.positivo + s.sentiment.neutro + s.sentiment.negativo || 1;
  const maxHour = Math.max(1, ...s.hours.map((h) => h.count));
  const maxDay = Math.max(1, ...s.weekdays.map((w) => w.count));
  const neverFetched = gap.checkedMedia === 0;

  return (
    <div className="space-y-4" data-testid="com-study">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto min-w-0">
          <h3 className="text-sm font-semibold text-gray-200">Comentários dos posts publicados de {d.period.label}</h3>
          <p className="text-[11px] text-gray-500">
            {fmt(d.posts.length)} {d.posts.length === 1 ? "post" : "posts"} no período · {gap.lastSyncAt ? `última busca ${fmtDateTime(gap.lastSyncAt)}` : "comentários ainda não buscados"}
          </p>
        </div>
        <SimpleBadge simple={s.simple} />
        <button type="button" onClick={fetchAll} disabled={busy || d.posts.length === 0} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60 ${neverFetched || gap.pendingMedia > 0 ? "bg-brand-500 text-brand-ink hover:bg-brand-400" : "border border-gray-600 text-gray-200 hover:bg-gray-800"}`} data-testid="com-fetch-period">
          <RefreshCw size={15} className={busy ? "animate-spin" : ""} /> {busy ? "Buscando..." : "Buscar comentários"}
        </button>
      </div>
      {msg && <p role="status" className={`text-xs ${msg.tone === "ok" ? "text-green-400" : msg.tone === "bad" ? "text-red-400" : "text-gray-400"}`} data-testid="com-study-msg">{msg.text}</p>}
      {gap.error && !msg && <p className="text-xs text-red-400" role="alert">A última busca falhou: {gap.error}</p>}
      <GapNotice gap={gap} id={`periodo:${d.account._id}:${d.period.from}:${d.period.to}`} />
      {gap.pendingMedia > 0 && (
        <p className="text-xs text-gray-400" data-testid="com-pending">
          {fmt(gap.pendingMedia)} {gap.pendingMedia === 1 ? "post do período tem comentários que ainda não foram buscados" : "posts do período têm comentários que ainda não foram buscados"}. Clique em Buscar comentários.
        </p>
      )}

      {s.total === 0 ? (
        <div className="text-center py-12 px-4 bg-gray-900 border border-gray-800 rounded-xl" data-testid="com-study-empty">
          <h3 className="text-base font-bold text-white">
            {d.posts.length === 0 ? "Nenhum post publicado nesse período" : neverFetched ? "Comentários ainda não buscados" : gap.reported > 0 ? "O Instagram ainda não liberou comentários para estudar" : "Nenhum comentário nos posts do período"}
          </h3>
          <p className="text-sm text-gray-400 mt-2 max-w-lg mx-auto">
            {d.posts.length === 0
              ? "Escolha outro período acima."
              : neverFetched
                ? "Clique em Buscar comentários para trazer do Instagram os comentários dos posts desse período."
                : gap.reported > 0
                  ? "Os números de comentários de cada post continuam valendo (vêm das métricas). O texto dos comentários só chega depois que o aplicativo for aprovado pela Meta."
                  : "Quando alguém comentar, aparece aqui."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="com-cards">
            <Stat label="Comentários estudados" value={fmt(s.total)}>de {fmt(s.people)} {s.people === 1 ? "pessoa" : "pessoas"} · a conta respondeu {fmt(s.ownReplies)} vezes</Stat>
            <Stat label="Sem resposta" value={fmt(s.unanswered.total)}>
              {s.unanswered.important > 0 ? <span className="text-yellow-300">{fmt(s.unanswered.important)} de dúvida, preço, compra, objeção ou reclamação</span> : "nenhum de dúvida, preço ou reclamação"}
            </Stat>
            <Stat label="Tempo médio de resposta" value={fmtWait(s.response.avgMinutes)}>
              {s.response.rate != null ? `${s.response.rate.toLocaleString("pt-BR")}% respondidos` : "sem comentário para responder"}{s.response.medianMinutes != null ? ` · metade em até ${fmtWait(s.response.medianMinutes)}` : ""}
            </Stat>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 min-w-0" data-testid="com-sentiment">
              <div className="text-xs text-gray-400">Sentimento</div>
              <div className="flex h-3 rounded-full overflow-hidden mt-3 gap-0.5 bg-gray-800">
                <div className="bg-green-500" style={{ width: `${(s.sentiment.positivo / sentTotal) * 100}%` }} title={`Positivo: ${s.sentiment.positivo}`} />
                <div className="bg-gray-500" style={{ width: `${(s.sentiment.neutro / sentTotal) * 100}%` }} title={`Neutro: ${s.sentiment.neutro}`} />
                <div className="bg-red-500" style={{ width: `${(s.sentiment.negativo / sentTotal) * 100}%` }} title={`Negativo: ${s.sentiment.negativo}`} />
              </div>
              <div className="text-[11px] text-gray-400 mt-2 flex flex-wrap gap-x-3">
                <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />{fmt(s.sentiment.positivo)} positivos</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-gray-500 mr-1" />{fmt(s.sentiment.neutro)} neutros</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />{fmt(s.sentiment.negativo)} negativos</span>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <Box title="O que as pessoas escrevem" testid="com-categories">
              <ul className="space-y-2">
                {s.byCategory.map((c) => (
                  <li key={c.key}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className={`px-1.5 py-0.5 rounded ${CAT_CLS[c.key] || CAT_CLS.outro}`}>{c.label}</span>
                      <span className="tabular-nums text-gray-300">{fmt(c.count)} <span className="text-gray-500">· {c.pct.toLocaleString("pt-BR")}%</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden mt-1"><div className="h-full bg-brand-500/70 rounded-full" style={{ width: `${Math.max(2, c.pct)}%` }} /></div>
                  </li>
                ))}
              </ul>
            </Box>

            <Box title="Perguntas que mais se repetem" testid="com-questions">
              {s.questions.length === 0 ? (
                <p className="text-xs text-gray-500">Nenhuma pergunta nos comentários do período.</p>
              ) : (
                <ol className="space-y-2.5">
                  {s.questions.slice(0, 6).map((q, i) => (
                    <li key={i} className="text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-gray-100 font-medium truncate" title={q.label}>{q.label}</span>
                        <span className="text-xs tabular-nums text-gray-300 whitespace-nowrap">{fmt(q.count)}x{q.unanswered > 0 && <span className="text-yellow-300"> · {fmt(q.unanswered)} sem resposta</span>}</span>
                      </div>
                      {q.theme && <p className="text-xs text-gray-500 truncate" title={q.examples.join(" · ")}>{q.examples.map((e) => `"${e}"`).join(" · ")}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </Box>
          </div>

          {s.ideas.length > 0 && (
            <Box title="Ideias de post a partir das dúvidas" testid="com-ideas">
              <ul className="space-y-1.5">
                {s.ideas.slice(0, 6).map((idea, i) => (
                  <li key={i} className="text-sm text-gray-200 flex gap-2"><Lightbulb size={14} className="text-brand-400 shrink-0 mt-0.5" /> <span>{idea}</span></li>
                ))}
              </ul>
            </Box>
          )}

          <div className="grid md:grid-cols-3 gap-3">
            <Box title="Termos mais citados" testid="com-terms">
              {s.terms.length === 0 ? <p className="text-xs text-gray-500">Ainda sem termo repetido.</p> : (
                <div className="flex flex-wrap gap-1.5">
                  {s.terms.map((t) => <span key={t.term} className="text-xs px-2 py-1 rounded-full bg-gray-800 text-gray-200">{t.term} <span className="text-gray-500 tabular-nums">{t.count}</span></span>)}
                </div>
              )}
            </Box>
            <Box title="Quem mais comenta" testid="com-people">
              <ol className="space-y-1">
                {s.commenters.slice(0, 6).map((c) => (
                  <li key={c.username} className="flex justify-between gap-2 text-xs"><span className="text-gray-200 truncate" title={`@${c.username}`}>@{c.username}</span><span className="tabular-nums text-gray-400">{fmt(c.count)}</span></li>
                ))}
              </ol>
            </Box>
            <Box title="Quando comentam (horário de Brasília)" testid="com-hours">
              <div className="flex items-end gap-px h-16" role="img" aria-label={`Horários com mais comentários: ${s.bestHours.map((h) => `${h}h`).join(", ")}`}>
                {s.hours.map((h) => (
                  <div key={h.hour} className="flex-1 flex flex-col justify-end h-full" title={`${h.hour}h: ${h.count}`}>
                    <div className={`rounded-sm ${s.bestHours.includes(h.hour) ? "bg-brand-500" : "bg-gray-600"}`} style={{ height: `${Math.max(h.count ? 6 : 2, (h.count / maxHour) * 100)}%` }} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-gray-500 mt-1"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
              <p className="text-xs text-gray-300 mt-2">Mais comentários às <span className="text-brand-400 font-semibold">{s.bestHours.map((h) => `${h}h`).join(", ")}</span></p>
              <div className="flex gap-1 mt-2">
                {s.weekdays.map((w) => (
                  <div key={w.day} className="flex-1 text-center" title={`${w.label}: ${w.count}`}>
                    <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden"><div className="h-full bg-brand-500/70" style={{ width: `${(w.count / maxDay) * 100}%` }} /></div>
                    <span className="text-[10px] text-gray-500">{w.label.slice(0, 3)}</span>
                  </div>
                ))}
              </div>
            </Box>
          </div>
        </>
      )}

      {d.posts.length > 0 && (
        <Box title="Posts do período: clique para ver os comentários" testid="com-posts">
          <div className="overflow-x-auto -mx-3 md:-mx-4">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-800">
                  <th className="text-left font-medium px-3 md:px-4 py-2">Post</th>
                  <th className="text-right font-medium px-2 py-2">Data</th>
                  <th className="text-right font-medium px-2 py-2" title="Quantos comentários o Instagram diz que o post tem">Informados</th>
                  <th className="text-right font-medium px-2 py-2" title="Quantos comentários o Instagram entregou ao aplicativo">Liberados</th>
                  <th className="text-right font-medium px-2 py-2">Sem resposta</th>
                  <th className="text-right font-medium px-3 md:px-4 py-2">Perguntas</th>
                </tr>
              </thead>
              <tbody>
                {d.posts.map((p) => (
                  <tr key={p.igId} className="border-b border-gray-800/60 last:border-0 hover:bg-gray-800/40 cursor-pointer" onClick={() => onOpenPost(p.igId)} data-testid="com-post-row">
                    <td className="px-3 md:px-4 py-1.5">
                      <button type="button" className="block w-44 sm:w-72 lg:w-96 truncate text-left text-gray-100 hover:text-brand-400" title={p.title}>{p.title}</button>
                    </td>
                    <td className="text-right px-2 text-gray-300 tabular-nums">{fmtDay(p.timestamp)}</td>
                    <td className="text-right px-2 tabular-nums">{fmt(p.reported)}</td>
                    <td className={`text-right px-2 tabular-nums ${p.fetched != null && p.fetched < p.reported ? "text-yellow-300" : ""}`}>{p.fetched == null ? <span className="text-gray-500" title={p.error || "Ainda não buscados"}>{p.error ? "falhou" : "não buscados"}</span> : fmt(p.fetched)}</td>
                    <td className="text-right px-2 tabular-nums">{p.fetched == null ? "–" : fmt(p.unanswered)}</td>
                    <td className="text-right px-3 md:px-4 tabular-nums">{p.fetched == null ? "–" : fmt(p.questions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
      )}

      <section className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4" data-testid="com-report">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-gray-200 mr-auto">Relatório dos comentários em texto (pronto para copiar)</h3>
          <button type="button" onClick={() => { navigator.clipboard?.writeText(d.report); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="text-xs px-3 py-1.5 rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-800 flex items-center gap-1" data-testid="com-report-copy">
            {copied ? <><Check size={12} className="text-green-400" /> Copiado</> : <><Copy size={12} /> Copiar</>}
          </button>
        </div>
        <pre className="text-xs md:text-sm text-gray-200 whitespace-pre-wrap break-words font-sans bg-gray-950/60 rounded-lg p-3">{d.report}</pre>
      </section>
    </div>
  );
}
