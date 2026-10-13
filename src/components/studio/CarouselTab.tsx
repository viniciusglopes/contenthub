"use client";

import { useState } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { fieldCls, ghostBtn, primaryBtn } from "@/components/brand";
import { send } from "@/components/http";
import type { PostT } from "@/components/posts/flow";
import { type CarouselScript, LIMITS, type Slide, VISUAL_MODELS, type VisualModel } from "@/lib/studio/script";
import { Card, Count, Field, Notice, linkBtn } from "./shared";

interface Generated { assets: { _id: string; url: string }[]; caption: string; alts: string[]; blockers: string[]; report: { seconds: number } }
export interface Confirm { message: string; run: () => void }

export const blankCarousel = (modelo: VisualModel, n: number): CarouselScript => ({
  modelo,
  slides: Array.from({ length: n }, (_, i): Slide => ({ tipo: i === 0 ? "capa" : i === n - 1 ? "cta" : "conteudo", titulo: "", texto: "" })),
  legenda: "", hashtags: [],
});

/** Pedido de roteiro por IA com a confirmação de custo embutida (409 = pedir confirmação). */
export async function askScript<T>(body: Record<string, unknown>, onConfirm: (c: Confirm | null) => void, done: (data: T) => void, fail: (msg: string) => void, confirm = false): Promise<void> {
  const r = await fetch("/api/estudio/roteiro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, confirm }) }).catch(() => null);
  const data = await r?.json().catch(() => null);
  if (!r) return fail("Sem conexão com o servidor. Tente de novo.");
  if (r.status === 409 && data?.needsConfirm) return onConfirm({ message: data.message, run: () => { onConfirm(null); askScript(body, onConfirm, done, fail, true); } });
  if (!r.ok) return fail(data?.error || "Não deu certo. Tente de novo.");
  done(data as T);
}

// Criar carrossel: tema → roteiro editável → modelo visual → gerar → revisar → salvar como rascunho.
// Sem chave de texto o roteiro é escrito à mão e a arte sai do mesmo jeito.
export default function CarouselTab({ project, hasText, script, setScript, onDraft, goKeys }: { project: string; hasText: boolean; script: CarouselScript | null; setScript: (s: CarouselScript | null) => void; onDraft: (post: PostT) => void; goKeys: () => void }) {
  const [tema, setTema] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [modelo, setModelo] = useState<VisualModel>("editorial");
  const [n, setN] = useState(7);
  const [themes, setThemes] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [gen, setGen] = useState<Generated | null>(null);
  const [provider, setProvider] = useState("");
  const [hashText, setHashText] = useState("");

  const fail = (m: string) => { setError(m); setBusy(""); };
  const edit = (s: CarouselScript) => { setScript(s); setGen(null); };
  const take = (s: CarouselScript) => { edit(s); setHashText(s.hashtags.join(" ")); };
  const upd = (i: number, patch: Partial<Slide>) => edit({ ...script!, slides: script!.slides.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  function suggest() {
    setBusy("temas"); setError("");
    askScript<{ themes: string[] }>({ project, tipo: "temas", tema }, setConfirm, (d) => { setThemes(d.themes); setBusy(""); }, fail);
  }
  function write() {
    setBusy("roteiro"); setError("");
    askScript<{ script: CarouselScript; provider: { service: string; house: boolean } }>({ project, tipo: "carrossel", tema, objetivo, modelo, slides: n }, setConfirm, (d) => { take(d.script); setProvider(`${d.provider.service}${d.provider.house ? " (chave da casa)" : ""}`); setBusy(""); }, fail);
  }
  const body = () => ({ ...script!, modelo, hashtags: hashText.split(/[\s,]+/).filter(Boolean) });
  async function generate() {
    setBusy("arte"); setError("");
    const r = await send<Generated>("POST", "/api/estudio/carrossel", { project, script: body() });
    setBusy("");
    if (!r.ok) return setError(r.error);
    setGen(r.data);
  }
  async function saveDraft() {
    setBusy("salvar"); setError("");
    const r = await send<{ post: PostT }>("POST", "/api/estudio/carrossel", { project, script: body(), acao: "salvar", assets: gen!.assets.map((a) => a._id) });
    setBusy("");
    if (!r.ok) return setError(r.error);
    setGen(null); setScript(null); setTema("");
    onDraft(r.data!.post);
  }
  function addSlide() {
    const slides = [...script!.slides];
    slides.splice(slides.length - 1, 0, { tipo: "conteudo", titulo: "", texto: "" });
    edit({ ...script!, slides });
  }

  return (
    <div className="space-y-4" data-testid="carrossel">
      <Card title="1. Tema">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Sobre o que é o post" className="md:col-span-2"><input className={fieldCls()} value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex.: clareamento dental, o que é mito e o que é verdade" maxLength={300} data-testid="tema" /></Field>
          <Field label="Objetivo (opcional)"><input className={fieldCls()} value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="Ex.: tirar dúvidas antes da consulta" maxLength={300} /></Field>
          <div className="grid grid-cols-[1fr_90px] gap-3">
            <Field label="Modelo visual"><select className={fieldCls()} value={modelo} onChange={(e) => { setModelo(e.target.value as VisualModel); setGen(null); }} data-testid="modelo">{Object.entries(VISUAL_MODELS).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}</select></Field>
            <Field label="Slides"><select className={fieldCls()} value={n} onChange={(e) => setN(Number(e.target.value))}>{[3, 4, 5, 6, 7, 8, 9, 10].map((v) => <option key={v}>{v}</option>)}</select></Field>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">{VISUAL_MODELS[modelo].hint}</p>
        {themes.length > 0 && <div className="flex flex-wrap gap-1.5 mt-3">{themes.map((t) => <button key={t} type="button" onClick={() => setTema(t)} className="text-xs px-2.5 py-1.5 rounded-full border border-gray-700 text-gray-200 hover:bg-gray-800 text-left">{t}</button>)}</div>}
        <div className="flex flex-wrap items-center gap-3 mt-3">
          {hasText ? (
            <>
              <button type="button" className={primaryBtn} disabled={busy !== "" || tema.trim().length < 4} onClick={write} data-testid="roteiro-ia"><Sparkles size={14} className="inline -mt-0.5 mr-1" />{busy === "roteiro" ? "Escrevendo…" : "Escrever roteiro com IA"}</button>
              <button type="button" className={linkBtn} disabled={busy !== ""} onClick={suggest}>{busy === "temas" ? "Buscando temas…" : "Sugerir temas"}</button>
              <button type="button" className={linkBtn} onClick={() => take(blankCarousel(modelo, n))} data-testid="roteiro-mao">Escrever à mão</button>
            </>
          ) : (
            <>
              <button type="button" className={primaryBtn} onClick={() => take(blankCarousel(modelo, n))} data-testid="roteiro-mao">Escrever o roteiro à mão</button>
              <span className="text-xs text-gray-500">Para a IA escrever e sugerir temas, <button type="button" className={linkBtn} onClick={goKeys}>cadastre uma chave de texto</button>.</span>
            </>
          )}
        </div>
        {confirm && <div className="mt-3"><Notice tone="warn" onClose={() => { setConfirm(null); setBusy(""); }}>{confirm.message} <button type="button" className={`${ghostBtn} ml-2`} onClick={confirm.run}>Confirmar e gerar</button></Notice></div>}
      </Card>

      {script && (
        <Card title="2. Roteiro" hint={provider ? `Escrito por ${provider}. Revise antes de gerar: o texto é seu.` : "Um trecho entre *asteriscos* no título sai em destaque."} right={<button type="button" className={ghostBtn} onClick={addSlide} disabled={script.slides.length >= 10}><Plus size={12} className="inline -mt-0.5" /> Slide</button>}>
          <div className="space-y-2">
            {script.slides.map((s, i) => (
              <div key={i} className="border border-gray-800 rounded-lg p-3 bg-gray-800/30" data-testid={`slide-${i + 1}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-300">{i + 1}. {s.tipo === "capa" ? "Capa" : s.tipo === "cta" ? "Chamada final" : "Conteúdo"}</span>
                  {s.tipo === "conteudo" && script.slides.length > 3 && <button type="button" className="p-1 text-gray-500 hover:text-red-300" aria-label={`Remover slide ${i + 1}`} onClick={() => edit({ ...script, slides: script.slides.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>}
                </div>
                <div className="grid gap-2 md:grid-cols-[180px_1fr]">
                  {s.tipo === "conteudo" && modelo === "editorial" ? (
                    <Field label="Selo (opcional)" hint={`${(s.selo || "").length}/${LIMITS.selo}`}><span className="flex gap-1 mt-1"><input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-100" value={s.selo || ""} onChange={(e) => upd(i, { selo: e.target.value })} placeholder="Mito, Verdade" /><select className="bg-gray-800 border border-gray-700 rounded-lg px-1 text-xs text-gray-200" value={s.selo_tom || "cheio"} onChange={(e) => upd(i, { selo_tom: e.target.value as "cheio" | "vazado" })} aria-label="Estilo do selo"><option value="cheio">cheio</option><option value="vazado">vazado</option></select></span></Field>
                  ) : s.tipo !== "conteudo" ? (
                    <Field label="Chapéu (opcional)" hint={`${(s.kicker || "").length}/${LIMITS.kicker}`}><input className={fieldCls()} value={s.kicker || ""} onChange={(e) => upd(i, { kicker: e.target.value })} /></Field>
                  ) : <span className="hidden md:block" />}
                  <Field label={modelo === "pergunta_resposta" && s.tipo === "conteudo" ? "Pergunta" : "Título"} hint={`${s.titulo.length}/${LIMITS.titulo}`}><input className={fieldCls()} value={s.titulo} onChange={(e) => upd(i, { titulo: e.target.value })} /></Field>
                  {s.tipo === "capa" && modelo === "lista_numerada" && <Field label="Número em destaque"><input className={fieldCls()} value={s.numero_destaque || ""} onChange={(e) => upd(i, { numero_destaque: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder={String(script.slides.length - 2)} /></Field>}
                  <label className="block text-xs text-gray-400 md:col-span-2">
                    <span className="flex justify-between"><span>{modelo === "pergunta_resposta" && s.tipo === "conteudo" ? "Resposta" : s.tipo === "capa" ? "Linha de apoio (opcional)" : "Texto"}</span><Count value={s.texto || ""} max={LIMITS.texto} /></span>
                    <textarea className={fieldCls()} rows={s.tipo === "capa" ? 1 : 3} value={s.texto || ""} onChange={(e) => upd(i, { texto: e.target.value })} />
                  </label>
                  {s.tipo === "cta" && <Field label="Chamada (botão)" hint={`${(s.acao || "").length}/${LIMITS.acao}`} className="md:col-span-2"><input className={fieldCls()} value={s.acao || ""} onChange={(e) => upd(i, { acao: e.target.value })} placeholder="Salve para ler depois" /></Field>}
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2 mt-3">
            <label className="block text-xs text-gray-400"><span className="flex justify-between"><span>Legenda do post</span><Count value={script.legenda} max={LIMITS.legendaMax} /></span><textarea className={fieldCls()} rows={4} value={script.legenda} onChange={(e) => edit({ ...script, legenda: e.target.value })} placeholder="3 a 6 frases (mínimo de 80 caracteres). A assinatura e o aviso do setor entram sozinhos." data-testid="legenda" /></label>
            <Field label="Hashtags" hint="de 3 a 8, separadas por espaço"><textarea className={fieldCls()} rows={4} value={hashText} onChange={(e) => { setHashText(e.target.value); setGen(null); }} placeholder="#saudebucal #odontologia #clareamento" data-testid="hashtags" /></Field>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button type="button" className={gen ? ghostBtn : primaryBtn} disabled={busy !== ""} onClick={generate} data-testid="gerar-arte">{busy === "arte" ? "Desenhando os slides…" : gen ? "Gerar de novo" : "Gerar a arte"}</button>
            {busy === "arte" && <span className="text-xs text-gray-400">Leva alguns segundos.</span>}
          </div>
        </Card>
      )}

      {error && <Notice tone="bad" onClose={() => setError("")}>{error}</Notice>}

      {gen && script && (
        <Card title="3. Revisar e salvar" hint={`${gen.assets.length} slides em ${gen.report.seconds.toLocaleString("pt-BR")} s. Texto cortado, contraste e termos vetados já foram conferidos.`}>
          <div className="flex gap-2 overflow-x-auto pb-2 snap-x" data-testid="slides-gerados">
            {gen.assets.map((a, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- arquivo do próprio app
              <img key={a._id} src={a.url} alt={gen.alts[i]} className="h-72 md:h-96 w-auto rounded-lg border border-gray-800 snap-start shrink-0" />
            ))}
          </div>
          <details className="mt-2 text-xs text-gray-400"><summary className="cursor-pointer text-gray-300">Ver a legenda que vai no post</summary><pre className="whitespace-pre-wrap font-sans mt-2 bg-gray-800/60 rounded-lg p-3 text-gray-200">{gen.caption}</pre></details>
          {gen.blockers.length > 0 && <div className="mt-3"><Notice tone="warn">Dá para salvar o rascunho, mas ele não poderá ser aprovado: {gen.blockers.join(" ")}</Notice></div>}
          <div className="flex items-center gap-3 mt-3">
            <button type="button" className={primaryBtn} disabled={busy !== ""} onClick={saveDraft} data-testid="salvar-rascunho">{busy === "salvar" ? "Salvando…" : "Salvar como rascunho"}</button>
            <span className="text-xs text-gray-500">Vira um post em rascunho; publicar continua exigindo a aprovação.</span>
          </div>
        </Card>
      )}
    </div>
  );
}
