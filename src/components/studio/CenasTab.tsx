"use client";
/* eslint-disable react-hooks/set-state-in-effect -- carga inicial por projeto */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, Clock, Film, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { fieldCls, ghostBtn, primaryBtn } from "@/components/brand";
import { fmtWhen, send } from "@/components/http";
import { type TemplateSettings, VOICES, defaultSettings, sceneCount, voiceOf } from "@/lib/studio/cenas-spec";
import { LIMITS, type ReelScript, type Scene } from "@/lib/studio/script";
import { JOB_ACTIVE, type JobT } from "./ReelTab";
import { Card, Count, Field, Notice, linkBtn } from "./shared";

export interface TemplateT { _id: string; project: string; name: string; settings: TemplateSettings; isDefault: boolean; fromJob: string | null }
interface Sim { seconds: number; etaSeconds: number; eta: string; scenesAvailable: number; blockers: string[]; templateName: string | null }
type Over = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const JOB_LABEL: Record<string, string> = { queued: "Na fila", running: "Gerando", waiting: "Aguardando", done: "Pronto", failed: "Não deu certo", canceled: "Cancelado" };
const blank = (n: number, cta: string): ReelScript => ({ cenas: Array.from({ length: n }, (_, i): Scene => ({ tipo: i === 0 ? "capa" : i === n - 1 ? "cta" : "conteudo", titulo: "", narracao: "", ...(i === n - 1 && cta ? { acao: cta } : {}) })), legenda: "", hashtags: [] });

// REEL COM CENAS: o vídeo segue um PADRÃO salvo (voz, cores, legenda, cortes, cenas, trilha) e o
// roteiro vem de um tema (a IA escreve no padrão), de um pedido livre (a IA escreve e ajusta o
// padrão; sem IA o texto vira o roteiro) ou da mão. Roda na fila e vira rascunho para aprovação.
export default function CenasTab({ project, ai, jobs, onJobs, onOpenPost, goTab }: { project: string; ai: Record<string, boolean>; jobs: JobT[]; onJobs: () => void; onOpenPost: (id: string) => void; goTab: (t: "padroes" | "biblioteca" | "chaves") => void }) {
  const [templates, setTemplates] = useState<TemplateT[] | null>(null);
  const [tid, setTid] = useState("");
  const [cats, setCats] = useState<{ name: string; count: number }[]>([]);
  const [modo, setModo] = useState<"tema" | "prompt">("tema");
  const [texto, setTexto] = useState("");
  const [script, setScriptRaw] = useState<ReelScript | null>(null);
  const [hashText, setHashText] = useState("");
  const [over, setOver] = useState<Over>({});
  const [aiNote, setAiNote] = useState<{ text: string; applied: string[] } | null>(null);
  const [sim, setSim] = useState<Sim | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{ message: string } | null>(null);
  const [started, setStarted] = useState<Sim | null>(null);
  const [saveAs, setSaveAs] = useState<{ job: string; name: string } | null>(null);
  const [savedTpl, setSavedTpl] = useState("");

  const load = useCallback(async () => {
    const [t, c] = await Promise.all([send<TemplateT[]>("GET", `/api/estudio/padroes?project=${project}`), send<{ categories: { name: string; count: number }[] }>("GET", "/api/estudio/cenas")]);
    if (t.ok) {
      setTemplates(t.data!);
      setTid((cur) => (t.data!.some((x) => x._id === cur) ? cur : t.data!.find((x) => x.isDefault)?._id || t.data![0]?._id || ""));
    } else setError(t.error);
    if (c.ok) setCats(c.data!.categories);
  }, [project]);
  useEffect(() => { load(); }, [load]);

  const tpl = templates?.find((t) => t._id === tid) || null;
  const base = tpl?.settings || defaultSettings();
  // o que vale neste vídeo: padrão + ajustes (da IA ou da tela)
  const eff: TemplateSettings = useMemo(() => ({
    ...base, ...over, voice: { ...base.voice, ...(over.voice || {}) }, music: { ...base.music, ...(over.music || {}) }, structure: { ...base.structure, ...(over.structure || {}) },
    categories: over.categories || base.categories,
  }), [base, over]);
  const n = sceneCount(eff);

  const edit = (s: ReelScript | null) => { setScriptRaw(s); setSim(null); setStarted(null); };
  const take = (s: ReelScript) => { edit(s); setHashText(s.hashtags.join(" ")); };
  const upd = (i: number, patch: Partial<Scene>) => edit({ ...script!, cenas: script!.cenas.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setO = (patch: Over) => { setOver((o) => ({ ...o, ...patch })); setSim(null); };

  async function write(confirmed = false) {
    setBusy("roteiro"); setError(""); setAiNote(null);
    const r = await send<{ needsConfirm?: boolean; message: string; script: ReelScript; overrides: Over; applied: string[]; aiUsed: boolean }>("POST", "/api/estudio/cenas/roteiro", { project, template: tid || null, settings: over, modo, texto, confirm: confirmed });
    setBusy("");
    if (r.status === 409 && r.data?.needsConfirm) return setConfirm({ message: r.data.message });
    if (!r.ok) return setError(r.error);
    setConfirm(null);
    take(r.data!.script);
    if (Object.keys(r.data!.overrides || {}).length) setOver((o) => ({ ...o, ...r.data!.overrides }));
    setAiNote({ text: r.data!.message, applied: r.data!.applied || [] });
  }
  const payload = (extra: Over = {}) => ({ project, kind: "reel_cenas", template: tid || null, settings: over, script: { ...script!, hashtags: hashText.split(/[\s,]+/).filter(Boolean) }, ...extra });
  async function simulate() {
    setBusy("sim"); setError("");
    const r = await send<Sim>("POST", "/api/estudio/trabalhos", payload({ simular: true }));
    setBusy("");
    if (!r.ok) return setError(r.error);
    setSim(r.data!);
  }
  async function generate() {
    setBusy("gerar"); setError("");
    const r = await send<JobT & Sim>("POST", "/api/estudio/trabalhos", payload());
    setBusy("");
    if (!r.ok) return setError(r.error);
    setStarted(r.data!); setSim(null);
    onJobs();
  }
  async function saveTemplate() {
    if (!saveAs) return;
    setBusy("salvar"); setError("");
    const r = await send<TemplateT>("POST", "/api/estudio/padroes", { project, name: saveAs.name, fromJob: saveAs.job });
    setBusy("");
    if (!r.ok) return setError(r.error);
    setSaveAs(null); setSavedTpl(r.data!.name);
    load();
  }

  const mine = jobs.filter((j) => j.kind === "reel_cenas");
  const toggleCat = (name: string) => {
    const cur = eff.categories;
    setO({ categories: cur.some((c) => c.name === name) ? cur.filter((c) => c.name !== name) : [...cur, { name, weight: 1 }] });
  };
  const overCount = Object.keys(over).length;

  return (
    <div className="space-y-4" data-testid="cenas">
      <Card title="1. Padrão do vídeo" hint="Voz, cores, legenda, cortes, cenas e trilha saem do padrão. Os ajustes abaixo valem só para este vídeo." right={<button type="button" className={linkBtn} onClick={() => goTab("padroes")}>Editar padrões</button>}>
        {templates === null ? <p className="text-sm text-gray-500">Carregando…</p> : (
          <div className="grid gap-3 md:grid-cols-[minmax(0,280px)_1fr] items-start">
            <Field label="Padrão">
              <select className={fieldCls()} value={tid} onChange={(e) => { setTid(e.target.value); setOver({}); setSim(null); setAiNote(null); }} data-testid="cenas-padrao">
                {templates.length === 0 && <option value="">Estilo de base (sem padrão salvo)</option>}
                {templates.map((t) => <option key={t._id} value={t._id}>{t.name}{t.isDefault ? " (principal)" : ""}</option>)}
              </select>
            </Field>
            <div className="flex flex-wrap gap-1.5 text-[11px] text-gray-300 md:pt-5" data-testid="cenas-resumo">
              <span className="px-2 py-1 rounded-full bg-gray-800">Voz {voiceOf(eff.voice.name)?.label.split(" (")[0] || eff.voice.name} {eff.voice.rate ? `${eff.voice.rate > 0 ? "+" : ""}${eff.voice.rate}%` : ""}</span>
              <span className="px-2 py-1 rounded-full bg-gray-800">{n} cenas · ~{eff.targetSeconds} s</span>
              <span className="px-2 py-1 rounded-full bg-gray-800">corte a cada {eff.cutSeconds.toLocaleString("pt-BR")} s</span>
              <span className="px-2 py-1 rounded-full bg-gray-800">{eff.music.on ? "com trilha" : "sem trilha"}</span>
              <span className="px-2 py-1 rounded-full bg-gray-800 flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: eff.colors.highlight }} />destaque</span>
              {overCount > 0 && <button type="button" className="px-2 py-1 rounded-full bg-amber-500/15 text-amber-200" onClick={() => { setOver({}); setSim(null); }} title="Voltar a seguir só o padrão">{overCount} ajuste{overCount > 1 ? "s" : ""} neste vídeo · desfazer</button>}
            </div>
          </div>
        )}
        {templates?.length === 0 && <p className="text-xs text-gray-500 mt-2">Sem padrão salvo neste projeto: o vídeo usa o estilo de base. <button type="button" className={linkBtn} onClick={() => goTab("padroes")}>Criar um padrão</button></p>}
      </Card>

      <Card title="2. O que o vídeo diz">
        <div className="flex gap-1 mb-3" role="tablist" aria-label="Como escrever">
          {([["tema", "Tema", "a IA escreve seguindo o padrão"], ["prompt", "Pedido livre", "descreva o vídeo; a IA também ajusta o padrão"]] as const).map(([id, label, hint]) => (
            <button key={id} type="button" role="tab" aria-selected={modo === id} onClick={() => setModo(id)} className={`px-3 py-1.5 rounded-lg text-sm ${modo === id ? "bg-gray-800 text-white font-semibold" : "text-gray-400 hover:bg-gray-800/50"}`} title={hint} data-testid={`modo-${id}`}>{label}</button>
          ))}
        </div>
        {modo === "tema" ? (
          <Field label="Tema do vídeo"><input className={fieldCls()} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: por que a disciplina vence a motivação" maxLength={300} data-testid="cenas-texto" /></Field>
        ) : (
          <Field label="Pedido" hint={ai.texto ? "voz, cenas, trilha e ritmo citados aqui ajustam o padrão" : "sem IA: cada frase vira uma cena"}>
            <textarea className={fieldCls()} rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={ai.texto ? "Ex.: faz um vídeo sobre recomeçar depois de errar, tom calmo, voz feminina, cenas de mar e nascer do sol" : "Escreva o texto do vídeo, uma frase por cena. A primeira é o gancho, a última a chamada."} maxLength={600} data-testid="cenas-texto" />
          </Field>
        )}
        <div className="flex flex-wrap items-center gap-3 mt-3">
          {(ai.texto || modo === "prompt") && <button type="button" className={primaryBtn} disabled={busy !== "" || texto.trim().length < 4} onClick={() => write(false)} data-testid="cenas-escrever">{modo === "prompt" && !ai.texto ? <Wand2 size={14} className="inline -mt-0.5 mr-1" /> : <Sparkles size={14} className="inline -mt-0.5 mr-1" />}{busy === "roteiro" ? "Escrevendo…" : modo === "prompt" && !ai.texto ? "Usar o meu texto como roteiro" : "Escrever o roteiro"}</button>}
          <button type="button" className={ai.texto || modo === "prompt" ? linkBtn : primaryBtn} onClick={() => take(blank(n, eff.ctaText))} data-testid="cenas-mao">Escrever à mão ({n} cenas)</button>
          {!ai.texto && <span className="text-xs text-gray-500">Sem chave de IA para texto. <button type="button" className={linkBtn} onClick={() => goTab("chaves")}>Cadastrar</button></span>}
        </div>
        {confirm && <div className="mt-3"><Notice tone="warn" onClose={() => setConfirm(null)}>{confirm.message} <button type="button" className={`${ghostBtn} ml-2`} onClick={() => write(true)}>Confirmar e escrever</button></Notice></div>}
        {aiNote && <div className="mt-3" data-testid="cenas-nota"><Notice tone="info" onClose={() => setAiNote(null)}>{aiNote.text}</Notice></div>}

        {script && (
          <div className="space-y-2 mt-4">
            {script.cenas.map((c, i) => (
              <div key={i} className="border border-gray-800 rounded-lg p-3 bg-gray-800/30 grid gap-2 md:grid-cols-[150px_1fr]" data-testid={`cenas-cena-${i + 1}`}>
                <div className="flex md:flex-col items-start gap-2">
                  <span className="text-xs font-semibold text-gray-300">{i === 0 ? "Gancho (cartão)" : i === script.cenas.length - 1 ? "Chamada (cartão)" : `Cena ${i + 1} (legenda)`}</span>
                  {script.cenas.length > 2 && c.tipo === "conteudo" && <button type="button" className="p-1 text-gray-500 hover:text-red-300" aria-label={`Remover cena ${i + 1}`} onClick={() => edit({ ...script, cenas: script.cenas.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>}
                </div>
                <div className="grid gap-2 md:grid-cols-[150px_1fr]">
                  <Field label={i === 0 ? "Chapéu (opcional)" : "Número ou rótulo"} hint={`${(c.kicker || "").length}/${LIMITS.kicker}`}><input className={fieldCls()} value={c.kicker || ""} onChange={(e) => upd(i, { kicker: e.target.value })} placeholder={i === 0 || i === script.cenas.length - 1 ? "" : "1"} /></Field>
                  <Field label="Texto na tela (*destaque*)" hint={`${c.titulo.length}/${LIMITS.tituloCena}`}><input className={fieldCls()} value={c.titulo} onChange={(e) => upd(i, { titulo: e.target.value })} /></Field>
                  <label className="block text-xs text-gray-400 md:col-span-2"><span className="flex justify-between"><span>Narração (vira a legenda palavra a palavra)</span><Count value={c.narracao} max={LIMITS.narracao} /></span><textarea className={fieldCls()} rows={2} value={c.narracao} onChange={(e) => upd(i, { narracao: e.target.value })} /></label>
                  {c.tipo === "cta" && <Field label="Linha de baixo da chamada" hint={`${(c.acao || "").length}/${LIMITS.acao}`} className="md:col-span-2"><input className={fieldCls()} value={c.acao || ""} onChange={(e) => upd(i, { acao: e.target.value })} placeholder={eff.ctaText || "e segue o perfil"} /></Field>}
                </div>
              </div>
            ))}
            <button type="button" className={ghostBtn} disabled={script.cenas.length >= LIMITS.cenasMax} onClick={() => { const cenas = [...script.cenas]; cenas.splice(cenas.length - 1, 0, { tipo: "conteudo", titulo: "", narracao: "" }); edit({ ...script, cenas }); }}><Plus size={12} className="inline -mt-0.5" /> Cena</button>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs text-gray-400"><span className="flex justify-between"><span>Legenda do post</span><Count value={script.legenda} max={LIMITS.legendaMax} /></span><textarea className={fieldCls()} rows={3} value={script.legenda} onChange={(e) => edit({ ...script, legenda: e.target.value })} placeholder="3 a 6 frases (mínimo de 80 caracteres)." data-testid="cenas-legenda" /></label>
              <Field label="Hashtags" hint="de 3 a 8"><textarea className={fieldCls()} rows={3} value={hashText} onChange={(e) => { setHashText(e.target.value); setSim(null); }} placeholder="#motivacao #disciplina #mudanca" data-testid="cenas-hashtags" /></Field>
            </div>
          </div>
        )}
      </Card>

      {script && (
        <Card title="3. Ajustes deste vídeo (opcional)" hint="Vazio = segue o padrão.">
          <div className="grid gap-3 md:grid-cols-[1fr_200px_160px]">
            <Field label="Voz"><select className={fieldCls()} value={eff.voice.name} onChange={(e) => setO({ voice: { ...(over.voice || {}), name: e.target.value } })} data-testid="cenas-voz">{VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></Field>
            <Field label={`Velocidade ${eff.voice.rate > 0 ? "+" : ""}${eff.voice.rate}%`}><input type="range" min={-20} max={20} step={1} value={eff.voice.rate} onChange={(e) => setO({ voice: { ...(over.voice || {}), rate: Number(e.target.value) } })} className="w-full mt-2" /></Field>
            <label className="flex items-center gap-2 text-sm text-gray-200 md:pt-5"><input type="checkbox" checked={eff.music.on} onChange={(e) => setO({ music: { ...(over.music || {}), on: e.target.checked } })} />Trilha suave</label>
          </div>
          <div className="mt-3">
            <span className="text-xs text-gray-400">Cenas (categorias da biblioteca; nenhuma marcada = todas)</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5" data-testid="cenas-categorias">
              {cats.length === 0 && <span className="text-xs text-gray-500">A biblioteca está vazia. <button type="button" className={linkBtn} onClick={() => goTab("biblioteca")}>Enviar cenas</button></span>}
              {cats.map((c) => {
                const on = eff.categories.some((x) => x.name === c.name);
                return <button key={c.name} type="button" onClick={() => toggleCat(c.name)} aria-pressed={on} className={`px-2.5 py-1 rounded-full text-xs border ${on ? "border-brand-500 bg-brand-500/15 text-gray-100" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>{c.name} <span className="opacity-60">{c.count}</span></button>;
              })}
            </div>
          </div>
          {sim && (
            <div className="mt-3" data-testid="cenas-estimativa">
              <Notice tone="info" onClose={() => setSim(null)}>
                <p className="font-semibold flex items-center gap-1.5"><Clock size={14} />Duração prevista: {sim.seconds.toLocaleString("pt-BR")} s · fica pronto em {sim.eta} · custo zero</p>
                <p className="text-xs mt-1">{sim.scenesAvailable} cenas disponíveis nas categorias escolhidas. Voz neural gratuita da Microsoft; trilha sintetizada, sem direito autoral.</p>
                {sim.blockers.length > 0 && <p className="text-xs mt-1">O rascunho não poderá ser aprovado: {sim.blockers.join(" ")}</p>}
              </Notice>
            </div>
          )}
          {error && <div className="mt-3"><Notice tone="bad" onClose={() => setError("")}>{error}</Notice></div>}
          {started && <div className="mt-3"><Notice tone="ok" onClose={() => setStarted(null)}>O vídeo entrou na fila e fica pronto em {started.eta}. Pode continuar usando o sistema: ele aparece nos rascunhos do calendário para aprovar.</Notice></div>}
          <div className="flex items-center gap-3 mt-3">
            <button type="button" className={primaryBtn} disabled={busy !== ""} onClick={generate} data-testid="cenas-gerar"><Film size={14} className="inline -mt-0.5 mr-1" />{busy === "gerar" ? "Enviando…" : "Gerar o vídeo"}</button>
            <button type="button" className={linkBtn} disabled={busy !== ""} onClick={simulate} data-testid="cenas-simular">{busy === "sim" ? "Calculando…" : "Ver duração e tempo antes"}</button>
          </div>
        </Card>
      )}
      {!script && error && <Notice tone="bad" onClose={() => setError("")}>{error}</Notice>}
      {savedTpl && <Notice tone="ok" onClose={() => setSavedTpl("")}>Padrão “{savedTpl}” salvo. Ele já aparece na lista de padrões.</Notice>}

      <Card title="Vídeos com cenas" hint="Os mais recentes. O vídeo pronto vira um post em rascunho.">
        {mine.length === 0 ? <p className="text-sm text-gray-500 py-4 text-center">Nenhum vídeo com cenas ainda.</p> : (
          <ul className="divide-y divide-gray-800" data-testid="cenas-trabalhos">
            {mine.map((j) => (
              <li key={j._id} className="py-2 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-24 shrink-0 hidden md:block">{fmtWhen(j.createdAt)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-gray-100 truncate" title={j.title}>{j.title || "Vídeo"} <span className="text-gray-500 text-xs">{j.templateName ? `· ${j.templateName}` : ""}{j.seconds ? ` · ${j.seconds.toLocaleString("pt-BR")} s` : ""}</span></span>
                    {JOB_ACTIVE.includes(j.status) ? (
                      <span className="flex items-center gap-2 mt-1"><span className="h-1.5 flex-1 bg-gray-800 rounded-full overflow-hidden"><span className="block h-full bg-brand-500 transition-all" style={{ width: `${Math.max(4, j.progress)}%` }} /></span><span className="text-xs text-gray-400 whitespace-nowrap">{j.step}</span></span>
                    ) : j.status === "failed" ? <span className="block text-xs text-red-300 truncate" title={j.error}>{j.error}</span> : null}
                  </span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${j.status === "done" ? "bg-green-500/15 text-green-300" : j.status === "failed" ? "bg-red-500/15 text-red-300" : "bg-gray-700/50 text-gray-300"}`}>{JOB_LABEL[j.status] || j.status}</span>
                  {j.status === "done" && j.post && <button type="button" className={ghostBtn} onClick={() => onOpenPost(j.post!)}>Ver rascunho</button>}
                  {j.status === "done" && <button type="button" className={ghostBtn} title="Salvar as configurações deste vídeo como um padrão" onClick={() => setSaveAs({ job: j._id, name: `${j.templateName || "Padrão"} (${new Date(j.createdAt).toLocaleDateString("pt-BR")})`.slice(0, 60) })} data-testid="salvar-como-padrao"><Bookmark size={12} className="inline -mt-0.5" /><span className="hidden md:inline"> Salvar como padrão</span></button>}
                  {JOB_ACTIVE.includes(j.status) && <button type="button" className={ghostBtn} onClick={async () => { await send("DELETE", `/api/estudio/trabalhos/${j._id}`); onJobs(); }}>Cancelar</button>}
                </div>
                {saveAs?.job === j._id && (
                  <div className="flex flex-wrap items-end gap-2 mt-2 pl-0 md:pl-28">
                    <Field label="Nome do novo padrão" className="flex-1 min-w-[200px]"><input className={fieldCls()} value={saveAs.name} onChange={(e) => setSaveAs({ ...saveAs, name: e.target.value })} maxLength={60} autoFocus /></Field>
                    <button type="button" className={primaryBtn} disabled={busy !== ""} onClick={saveTemplate}>{busy === "salvar" ? "Salvando…" : "Salvar padrão"}</button>
                    <button type="button" className={linkBtn} onClick={() => setSaveAs(null)}>cancelar</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
