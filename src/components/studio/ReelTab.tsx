"use client";

import { useRef, useState } from "react";
import { Clapperboard, Film, ImagePlus, Music, Plus, Sparkles, Trash2, X } from "lucide-react";
import { fieldCls, ghostBtn, primaryBtn } from "@/components/brand";
import { fmtWhen, send } from "@/components/http";
import { type CarouselScript, LIMITS, type ReelScript, type Scene, carouselToReel } from "@/lib/studio/script";
import { type Confirm, askScript } from "./CarouselTab";
import { Card, Count, Field, Notice, fmtBrl, fmtUsd, linkBtn, uploadRaw } from "./shared";

export interface JobT { _id: string; kind: string; status: string; title: string; progress: number; step: string; error: string; estimateUsd: number; spentUsd: number; post: string | null; seen: boolean; createdAt: string; seconds: number | null; providers: string[] }
interface Sim { needsConfirm: boolean; message: string; estimateUsd: number; estimateBrl: number; lines: { what: string; usd: number; provider: string }[]; seconds: number; blockers: string[] }
type Kind = "reel_montado" | "reel_ia";
export const JOB_ACTIVE = ["queued", "running", "waiting"];
const JOB_LABEL: Record<string, string> = { queued: "Na fila", running: "Gerando", waiting: "Aguardando o provedor", done: "Pronto", failed: "Não deu certo", canceled: "Cancelado" };

const blank = (n: number): ReelScript => ({ cenas: Array.from({ length: n }, (_, i): Scene => ({ tipo: i === 0 ? "capa" : i === n - 1 ? "cta" : "conteudo", titulo: "", narracao: "" })), legenda: "", hashtags: [] });

// Criar Reel em dois níveis: "montado" (nosso: texto animado, legenda queimada, imagens suas ou
// cenas só com texto; funciona sem chave nenhuma) e "com vídeo de IA" (pago, com custo estimado
// e confirmação antes). O trabalho roda em segundo plano e vira rascunho de post.
export default function ReelTab({ project, ai, carousel, jobs, onJobs, onOpenPost, goKeys }: { project: string; ai: Record<string, boolean>; carousel: CarouselScript | null; jobs: JobT[]; onJobs: () => void; onOpenPost: (id: string) => void; goKeys: () => void }) {
  const [kind, setKind] = useState<Kind>("reel_montado");
  const [tema, setTema] = useState("");
  const [n, setN] = useState(5);
  const [script, setScriptRaw] = useState<ReelScript | null>(null);
  const [hashText, setHashText] = useState("");
  const [images, setImages] = useState<Record<number, { _id: string; url: string }>>({});
  const [voz, setVoz] = useState(false);
  const [imagensIA, setImagensIA] = useState(false);
  const [trilha, setTrilha] = useState<{ _id: string; name: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [sim, setSim] = useState<Sim | null>(null);
  const [started, setStarted] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const trilhaRef = useRef<HTMLInputElement>(null);
  const target = useRef(0);

  const fail = (m: string) => { setError(m); setBusy(""); };
  const edit = (s: ReelScript | null) => { setScriptRaw(s); setSim(null); setStarted(false); };
  const take = (s: ReelScript) => { edit(s); setHashText(s.hashtags.join(" ")); setImages({}); };
  const upd = (i: number, patch: Partial<Scene>) => edit({ ...script!, cenas: script!.cenas.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const isIa = kind === "reel_ia";
  const wantsVisual = isIa || imagensIA;

  function write() {
    setBusy("roteiro"); setError("");
    askScript<{ script: ReelScript }>({ project, tipo: "reel", tema, cenas: n, visual: wantsVisual }, setConfirm, (d) => { take(d.script); setBusy(""); }, fail);
  }
  const body = (extra: Record<string, unknown> = {}) => ({
    project, kind, voz, imagensIA: !isIa && imagensIA, trilha: trilha?._id || null,
    script: { ...script!, hashtags: hashText.split(/[\s,]+/).filter(Boolean), cenas: script!.cenas.map((c, i) => ({ ...c, imagem: !isIa && images[i] ? images[i]._id : undefined })) },
    ...extra,
  });
  async function create(extra: Record<string, unknown>) {
    const r = await fetch("/api/estudio/trabalhos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body(extra)) }).catch(() => null);
    const data = await r?.json().catch(() => null);
    return { status: r?.status ?? 0, data, error: !r ? "Sem conexão com o servidor. Tente de novo." : data?.error || "" };
  }
  async function simulate() {
    setBusy("sim"); setError("");
    const r = await create({ simular: true });
    setBusy("");
    if (r.status !== 200) return setError(r.error || "Não deu certo.");
    setSim(r.data);
  }
  async function generate(confirmed = false) {
    setBusy("gerar"); setError("");
    const r = await create(confirmed ? { confirm: true } : {});
    setBusy("");
    if (r.status === 409 && r.data?.needsConfirm) return setSim(r.data);
    if (r.status !== 201) return setError(r.error || "Não deu certo.");
    setSim(null); setStarted(true);
    onJobs();
  }
  async function sendImage(file: File | undefined) {
    if (!file) return;
    const i = target.current;
    setBusy(`img${i}`); setError("");
    const r = await uploadRaw<{ _id: string; url: string; kind: string }>(`/api/uploads?name=${encodeURIComponent(file.name)}`, file);
    setBusy("");
    if (!r.ok) return setError(r.error);
    if (r.data!.kind !== "image") return setError("Para a cena, envie uma imagem (JPG, PNG ou WebP).");
    setImages((m) => ({ ...m, [i]: r.data! }));
    setSim(null);
  }
  async function sendTrilha(file: File | undefined) {
    if (!file) return;
    setBusy("trilha"); setError("");
    const r = await uploadRaw<{ _id: string; name: string }>(`/api/estudio/arquivo?tipo=trilha&name=${encodeURIComponent(file.name)}`, file);
    setBusy("");
    if (!r.ok) return setError(r.error);
    setTrilha({ _id: r.data!._id, name: r.data!.name || file.name });
  }
  async function cancel(id: string) {
    await send("DELETE", `/api/estudio/trabalhos/${id}`);
    onJobs();
  }

  const level = (id: Kind, icon: React.ReactNode, title: string, text: string, tag: string) => (
    <button type="button" onClick={() => { setKind(id); setSim(null); }} className={`text-left rounded-xl border p-3 transition ${kind === id ? "border-brand-500 bg-brand-500/10" : "border-gray-800 bg-gray-900 hover:border-gray-700"}`} aria-pressed={kind === id} data-testid={`nivel-${id}`}>
      <span className="flex items-center gap-2 text-sm font-semibold text-gray-100">{icon}{title}<span className="ml-auto text-[10px] font-normal px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">{tag}</span></span>
      <span className="block text-xs text-gray-400 mt-1">{text}</span>
    </button>
  );

  return (
    <div className="space-y-4" data-testid="reel">
      <div className="grid gap-3 md:grid-cols-2">
        {level("reel_montado", <Clapperboard size={16} />, "Reel montado", "Texto animado, legenda sincronizada e movimento suave sobre as suas imagens ou sobre o fundo da marca. Voz e imagens por IA são opcionais.", "funciona sem chave")}
        {level("reel_ia", <Film size={16} />, "Reel com vídeo de IA", "Cada cena é um vídeo gerado por IA, com a mesma legenda, logo e assinatura por cima. Pago por segundo gerado: o custo aparece antes.", ai.video ? "pago" : "precisa de chave de vídeo")}
      </div>
      {isIa && !ai.video && <Notice tone="info">Nenhuma chave de vídeo cadastrada (Google Veo, Runway, Luma ou Kling). <button type="button" className={linkBtn} onClick={goKeys}>Cadastrar chave</button></Notice>}

      <Card title="1. Roteiro em cenas" hint="Vídeo vertical 1080 x 1920. O ideal é de 15 a 30 segundos: 4 a 6 cenas com uma ou duas frases cada.">
        <div className="grid gap-3 md:grid-cols-[1fr_90px]">
          <Field label="Sobre o que é o Reel"><input className={fieldCls()} value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex.: clareamento dental, mito e verdade" maxLength={300} data-testid="tema-reel" /></Field>
          <Field label="Cenas"><select className={fieldCls()} value={n} onChange={(e) => setN(Number(e.target.value))}>{[2, 3, 4, 5, 6, 7, 8].map((v) => <option key={v}>{v}</option>)}</select></Field>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          {ai.texto && <button type="button" className={primaryBtn} disabled={busy !== "" || tema.trim().length < 4} onClick={write}><Sparkles size={14} className="inline -mt-0.5 mr-1" />{busy === "roteiro" ? "Escrevendo…" : "Escrever roteiro com IA"}</button>}
          <button type="button" className={ai.texto ? linkBtn : primaryBtn} onClick={() => take(blank(n))} data-testid="reel-mao">{ai.texto ? "Escrever à mão" : "Escrever o roteiro à mão"}</button>
          {carousel && <button type="button" className={linkBtn} onClick={() => take(carouselToReel(carousel))} data-testid="reel-do-carrossel">Aproveitar o roteiro do carrossel</button>}
          {!ai.texto && <span className="text-xs text-gray-500">Para a IA escrever, <button type="button" className={linkBtn} onClick={goKeys}>cadastre uma chave de texto</button>.</span>}
        </div>
        {confirm && <div className="mt-3"><Notice tone="warn" onClose={() => { setConfirm(null); setBusy(""); }}>{confirm.message} <button type="button" className={`${ghostBtn} ml-2`} onClick={confirm.run}>Confirmar e gerar</button></Notice></div>}

        {script && (
          <div className="space-y-2 mt-4">
            {script.cenas.map((c, i) => (
              <div key={i} className="border border-gray-800 rounded-lg p-3 bg-gray-800/30 grid gap-2 md:grid-cols-[84px_1fr]" data-testid={`cena-${i + 1}`}>
                <div className="flex md:flex-col items-center gap-2">
                  <span className="text-xs font-semibold text-gray-300 md:self-start">Cena {i + 1}</span>
                  {!isIa && (
                    <button type="button" onClick={() => { target.current = i; imgRef.current?.click(); }} className="relative w-[54px] h-24 rounded-md bg-gray-800 border border-dashed border-gray-700 overflow-hidden flex items-center justify-center text-gray-500 hover:border-gray-500 shrink-0" title={images[i] ? "Trocar a imagem da cena" : "Enviar imagem para a cena (opcional)"} aria-label={`Imagem da cena ${i + 1}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- arquivo do próprio app */}
                      {images[i] ? <img src={images[i].url} alt="" className="w-full h-full object-cover" /> : busy === `img${i}` ? <span className="text-[10px]">enviando</span> : <ImagePlus size={16} />}
                    </button>
                  )}
                  {!isIa && images[i] && <button type="button" className="text-[11px] text-gray-500 hover:text-red-300" onClick={() => { const m = { ...images }; delete m[i]; setImages(m); setSim(null); }}>tirar</button>}
                  {script.cenas.length > 2 && c.tipo === "conteudo" && <button type="button" className="p-1 text-gray-500 hover:text-red-300 md:mt-auto" aria-label={`Remover cena ${i + 1}`} onClick={() => { edit({ ...script, cenas: script.cenas.filter((_, j) => j !== i) }); setImages({}); }}><Trash2 size={13} /></button>}
                </div>
                <div className="grid gap-2 md:grid-cols-[170px_1fr]">
                  <Field label="Chapéu (opcional)" hint={`${(c.kicker || "").length}/${LIMITS.kicker}`}><input className={fieldCls()} value={c.kicker || ""} onChange={(e) => upd(i, { kicker: e.target.value })} /></Field>
                  <Field label="Título na tela" hint={`${c.titulo.length}/${LIMITS.tituloCena}`}><input className={fieldCls()} value={c.titulo} onChange={(e) => upd(i, { titulo: e.target.value })} /></Field>
                  <label className="block text-xs text-gray-400 md:col-span-2"><span className="flex justify-between"><span>Narração (vira a legenda na tela)</span><Count value={c.narracao} max={LIMITS.narracao} /></span><textarea className={fieldCls()} rows={2} value={c.narracao} onChange={(e) => upd(i, { narracao: e.target.value })} /></label>
                  {c.tipo === "cta" && <Field label="Chamada (botão)" hint={`${(c.acao || "").length}/${LIMITS.acao}`} className="md:col-span-2"><input className={fieldCls()} value={c.acao || ""} onChange={(e) => upd(i, { acao: e.target.value })} placeholder="Salve para ver depois" /></Field>}
                  {wantsVisual && !(images[i] && !isIa) && <Field label={isIa ? "Visual da cena (o que o vídeo mostra)" : "Imagem de fundo por IA (descrição)"} hint="sem pessoas, rostos, texto ou marcas" className="md:col-span-2"><input className={fieldCls()} value={c.prompt_visual || ""} onChange={(e) => upd(i, { prompt_visual: e.target.value })} placeholder="Ex.: sala clara com luz natural e plantas" maxLength={LIMITS.promptVisual} /></Field>}
                </div>
              </div>
            ))}
            <button type="button" className={ghostBtn} disabled={script.cenas.length >= 8} onClick={() => { const cenas = [...script.cenas]; cenas.splice(cenas.length - 1, 0, { tipo: "conteudo", titulo: "", narracao: "" }); edit({ ...script, cenas }); setImages({}); }}><Plus size={12} className="inline -mt-0.5" /> Cena</button>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs text-gray-400"><span className="flex justify-between"><span>Legenda do post</span><Count value={script.legenda} max={LIMITS.legendaMax} /></span><textarea className={fieldCls()} rows={3} value={script.legenda} onChange={(e) => edit({ ...script, legenda: e.target.value })} placeholder="3 a 6 frases (mínimo de 80 caracteres)." data-testid="legenda-reel" /></label>
              <Field label="Hashtags" hint="de 3 a 8"><textarea className={fieldCls()} rows={3} value={hashText} onChange={(e) => { setHashText(e.target.value); setSim(null); }} placeholder="#saudebucal #odontologia #clareamento" data-testid="hashtags-reel" /></Field>
            </div>
          </div>
        )}
        <input ref={imgRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { sendImage(e.target.files?.[0]); e.target.value = ""; }} />
      </Card>

      {script && (
        <Card title="2. Som e imagem">
          <div className="space-y-2 text-sm text-gray-200">
            <label className={`flex items-start gap-2 ${ai.voz ? "" : "opacity-60"}`}><input type="checkbox" className="mt-1" checked={voz} disabled={!ai.voz} onChange={(e) => { setVoz(e.target.checked); setSim(null); }} /><span>Narrar com voz de IA <span className="block text-xs text-gray-500">{ai.voz ? "Pago por caractere. Sem marcar, o Reel sai sem voz, com a legenda na tela." : "Sem chave de voz: o Reel sai sem voz, com a legenda na tela."}</span></span></label>
            {!isIa && <label className={`flex items-start gap-2 ${ai.imagem ? "" : "opacity-60"}`}><input type="checkbox" className="mt-1" checked={imagensIA} disabled={!ai.imagem} onChange={(e) => { setImagensIA(e.target.checked); setSim(null); }} /><span>Gerar imagem de fundo por IA nas cenas sem imagem <span className="block text-xs text-gray-500">{ai.imagem ? "Paga por imagem. Em setor regulado fica desligada até o administrador liberar." : "Sem chave de imagem: a cena sem imagem usa o fundo da marca."}</span></span></label>}
            <div className="flex items-center gap-2 flex-wrap">
              <Music size={14} className="text-gray-400" />
              {trilha ? <span className="text-xs bg-gray-800 rounded-full pl-3 pr-1.5 py-1 flex items-center gap-1.5 max-w-full"><span className="truncate">{trilha.name}</span><button type="button" onClick={() => setTrilha(null)} aria-label="Tirar a trilha" className="text-gray-400 hover:text-white"><X size={12} /></button></span> : <button type="button" className={ghostBtn} disabled={busy === "trilha"} onClick={() => trilhaRef.current?.click()}>{busy === "trilha" ? "Enviando…" : "Enviar trilha (opcional)"}</button>}
              <span className="text-xs text-gray-500">MP3 ou M4A até 8 MB. Só envie música que você tem o direito de usar. Sem trilha por padrão.</span>
              <input ref={trilhaRef} type="file" accept="audio/mpeg,audio/mp4,.mp3,.m4a" hidden onChange={(e) => { sendTrilha(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          </div>
          {sim && (
            <div className="mt-3" data-testid="estimativa">
              <Notice tone={sim.needsConfirm ? "warn" : "info"}>
                <p className="font-semibold">Duração prevista: {sim.seconds.toLocaleString("pt-BR")} s · Custo estimado: {sim.estimateUsd ? `${fmtUsd(sim.estimateUsd)} (${fmtBrl(sim.estimateBrl)})` : "zero (nenhuma IA paga)"}</p>
                {sim.lines.length > 0 && <ul className="text-xs mt-1 space-y-0.5">{sim.lines.map((l) => <li key={l.what}>{l.what}: {fmtUsd(l.usd)} · {l.provider}</li>)}</ul>}
                {sim.estimateUsd > 0 && <p className="text-xs mt-1 opacity-80">Valor estimado pela tabela do provedor; o que vale é o extrato dele. Cena recusada pelo provedor pode ser cobrada mesmo assim.</p>}
                {sim.blockers.length > 0 && <p className="text-xs mt-1">O rascunho não poderá ser aprovado: {sim.blockers.join(" ")}</p>}
                {sim.needsConfirm && <button type="button" className={`${primaryBtn} mt-2`} disabled={busy !== ""} onClick={() => generate(true)} data-testid="confirmar-custo">{busy === "gerar" ? "Enviando…" : `Confirmar ${fmtUsd(sim.estimateUsd)} e gerar`}</button>}
              </Notice>
            </div>
          )}
          {error && <div className="mt-3"><Notice tone="bad" onClose={() => setError("")}>{error}</Notice></div>}
          {started && <div className="mt-3"><Notice tone="ok" onClose={() => setStarted(false)}>O Reel entrou na fila. Pode continuar usando o sistema: avisamos aqui quando ficar pronto.</Notice></div>}
          {!sim?.needsConfirm && (
            <div className="flex items-center gap-3 mt-3">
              <button type="button" className={primaryBtn} disabled={busy !== "" || (isIa && !ai.video)} onClick={() => generate(false)} data-testid="gerar-reel">{busy === "gerar" ? "Enviando…" : "Gerar o Reel"}</button>
              <button type="button" className={linkBtn} disabled={busy !== ""} onClick={simulate} data-testid="simular">{busy === "sim" ? "Calculando…" : "Ver duração e custo antes"}</button>
            </div>
          )}
        </Card>
      )}
      {!script && error && <Notice tone="bad" onClose={() => setError("")}>{error}</Notice>}

      <Card title="Reels gerados" hint="Os 30 mais recentes. O vídeo pronto vira um post em rascunho.">
        {jobs.length === 0 ? <p className="text-sm text-gray-500 py-4 text-center">Nenhum Reel gerado ainda.</p> : (
          <ul className="divide-y divide-gray-800" data-testid="trabalhos">
            {jobs.map((j) => (
              <li key={j._id} className="py-2 flex items-center gap-3 text-sm">
                <span className="text-xs text-gray-500 w-24 shrink-0 hidden md:block">{fmtWhen(j.createdAt)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-gray-100 truncate" title={j.title}>{j.title || "Reel"} <span className="text-gray-500 text-xs">· {j.kind === "reel_ia" ? "vídeo de IA" : "montado"}{j.seconds ? ` · ${j.seconds.toLocaleString("pt-BR")} s` : ""}{j.spentUsd > 0 ? ` · ${fmtUsd(j.spentUsd)}` : ""}</span></span>
                  {JOB_ACTIVE.includes(j.status) ? (
                    <span className="flex items-center gap-2 mt-1"><span className="h-1.5 flex-1 bg-gray-800 rounded-full overflow-hidden"><span className="block h-full bg-brand-500 transition-all" style={{ width: `${Math.max(4, j.progress)}%` }} /></span><span className="text-xs text-gray-400 whitespace-nowrap">{j.step}</span></span>
                  ) : j.status === "failed" ? <span className="block text-xs text-red-300 truncate" title={j.error}>{j.error}</span> : null}
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${j.status === "done" ? "bg-green-500/15 text-green-300" : j.status === "failed" ? "bg-red-500/15 text-red-300" : "bg-gray-700/50 text-gray-300"}`}>{JOB_LABEL[j.status] || j.status}</span>
                {j.status === "done" && j.post && <button type="button" className={ghostBtn} onClick={() => onOpenPost(j.post!)}>Ver rascunho</button>}
                {JOB_ACTIVE.includes(j.status) && <button type="button" className={ghostBtn} onClick={() => cancel(j._id)}>Cancelar</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
