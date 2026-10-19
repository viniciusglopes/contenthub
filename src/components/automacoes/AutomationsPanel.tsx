"use client";
/* eslint-disable react-hooks/set-state-in-effect -- aba e filtros lidos do link e carga inicial */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, ChevronDown, ChevronRight, FlaskConical, HelpCircle, ListChecks, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import { send, fmtWhen } from "@/components/http";
import { Card, Field, Notice, linkBtn } from "@/components/studio/shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Btn { kind: "url" | "postback"; title: string; url: string; replyText: string; tag: string; linkCode?: string; trackedUrl?: string; clicks?: number }
interface QR { title: string; replyText: string; tag: string }
export interface AutomationT {
  _id: string; project: string; account: string; name: string;
  trigger: { kind: "comment" | "dm"; scope: "posts" | "all" | "next"; mediaIds: string[]; nextAfter: string | null; keywords: string[]; match: "word" | "contains" | "exact"; anyText: boolean };
  publicReplies: string[];
  dm: { text: string; buttons: Btn[]; quickReplies: QR[] };
  ask: { enabled: boolean; field: "email" | "phone"; buttonTitle: string; consentText: string; question: string; thanks: string; defaultConsent: string; defaultQuestion: string };
  tags: string[]; active: boolean; dryRun: boolean;
  stats: { matched?: number; publicSent?: number; dmSent?: number; dryRuns?: number; skipped?: number; failed?: number; clicks?: number; leads?: number; lastRunAt?: string | null };
}
interface Overview { switch: { global: boolean; org: boolean; on: boolean; message: string }; hourlyCap: number; accounts: { _id: string; username: string; project: string; active: boolean }[]; automations: AutomationT[] }
interface Media { igId: string; caption: string; timestamp: string; thumbnailUrl: string; kind: string }
interface Step { kind: string; status: string; detail: string; payload: any; metaError: string; at: string }
interface Run { _id: string; automationName: string; trigger: string; username: string; text: string; dryRun: boolean; simulated: boolean; status: string; steps: Step[]; createdAt: string; automation: string | null }
interface ProjectOpt { _id: string; name: string; icon?: string }

const input = "block w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 mt-1";
const primary = "bg-brand-500 text-brand-ink px-4 py-2 rounded-lg font-semibold text-sm hover:bg-brand-400 transition disabled:opacity-60";
const btn = "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-gray-700 text-gray-200 hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap";
const chip = "text-[11px] px-1.5 py-0.5 rounded whitespace-nowrap";

export const helpLink = (id: string) => `/?view=ajuda&artigo=${id}`;
export function HelpDot({ id, label }: { id: string; label: string }) {
  return (
    <a href={helpLink(id)} className="inline-flex text-gray-500 hover:text-gray-200 align-middle" title={label} aria-label={label}>
      <HelpCircle size={14} />
    </a>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  done: { label: "enviado", cls: "bg-green-500/15 text-green-300" },
  dry_run: { label: "ensaio", cls: "bg-sky-500/15 text-sky-300" },
  skipped: { label: "não enviado", cls: "bg-gray-700 text-gray-300" },
  failed: { label: "falhou", cls: "bg-red-500/15 text-red-300" },
  partial: { label: "parcial", cls: "bg-amber-500/15 text-amber-200" },
  sent: { label: "enviado", cls: "bg-green-500/15 text-green-300" },
};
const STEP_PT: Record<string, string> = { erro: "Erro", public_reply: "Resposta pública", private_reply: "DM do comentário", dm: "Mensagem no direct", tag: "Etiqueta", ask: "Pedido", consent: "Consentimento", lead: "Contato", optout: "Parar" };
const TRIGGER_PT: Record<string, string> = { comment: "comentário", dm: "direct", postback: "botão", quick_reply: "resposta rápida", input: "resposta" };

function summary(a: AutomationT): string {
  const words = a.trigger.anyText ? "qualquer coisa" : a.trigger.keywords.map((k) => k.toUpperCase()).join(", ");
  if (a.trigger.kind === "dm") return `Mandou ${words} no direct`;
  const where = a.trigger.scope === "all" ? "em qualquer post" : a.trigger.scope === "next" ? (a.trigger.mediaIds.length ? "no post seguinte (já escolhido)" : "no próximo post publicado") : `em ${a.trigger.mediaIds.length} post(s)`;
  return `Comentou ${words} ${where}`;
}

// ---------- formulário em passos: gatilho -> resposta -> DM -> pedir e-mail -> etiqueta ----------

type Form = Omit<AutomationT, "_id" | "project" | "stats" | "active" | "dryRun"> & { _id?: string };
const blank = (account: string): Form => ({
  account, name: "", trigger: { kind: "comment", scope: "next", mediaIds: [], nextAfter: null, keywords: [], match: "word", anyText: false },
  publicReplies: ["", "", ""], dm: { text: "", buttons: [{ kind: "url", title: "", url: "", replyText: "", tag: "" }], quickReplies: [] },
  ask: { enabled: false, field: "email", buttonTitle: "Quero receber", consentText: "", question: "", thanks: "", defaultConsent: "", defaultQuestion: "" }, tags: [],
});

function StepTitle({ n, title, help }: { n: number; title: string; help?: React.ReactNode }) {
  return (
    <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-100">
      <span className="w-6 h-6 rounded-full bg-gray-800 border border-gray-700 grid place-items-center text-xs">{n}</span>
      {title} {help}
    </h4>
  );
}

function AutomationForm({ initial, accounts, onDone, onCancel }: { initial: Form; accounts: Overview["accounts"]; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState<Form>(() => ({ ...initial, publicReplies: [...initial.publicReplies, "", "", ""].slice(0, 3) }));
  const [kw, setKw] = useState(initial.trigger.keywords.join(", "));
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [media, setMedia] = useState<Media[] | null>(null);
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const t = f.trigger;
  const setT = (p: Partial<Form["trigger"]>) => setF({ ...f, trigger: { ...t, ...p } });
  const setDm = (p: Partial<Form["dm"]>) => setF({ ...f, dm: { ...f.dm, ...p } });
  const setAsk = (p: Partial<Form["ask"]>) => setF({ ...f, ask: { ...f.ask, ...p } });
  useEffect(() => {
    if (!f.account) return;
    send<Media[]>("GET", `/api/automacoes/midias?account=${f.account}`).then((r) => setMedia(r.ok ? r.data : []));
  }, [f.account]);
  const fe = (k: string) => (err?.field === k || err?.field?.startsWith(k + ".") ? err.msg : undefined);
  const maxButtons = f.ask.enabled ? 2 : 3;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const body = {
      account: f.account, name: f.name, trigger: { ...t, keywords: kw }, publicReplies: f.publicReplies.filter((s) => s.trim()),
      dm: { text: f.dm.text, buttons: f.dm.buttons.filter((b) => b.title || b.url || b.replyText), quickReplies: f.dm.quickReplies.filter((q) => q.title) },
      ask: f.ask, tags,
    };
    const r = f._id ? await send("PUT", `/api/automacoes/${f._id}`, body) : await send("POST", "/api/automacoes", body);
    setBusy(false);
    if (!r.ok) return setErr({ msg: r.error, field: r.field });
    onDone();
  }

  return (
    <Card title={f._id ? `Editar: ${initial.name}` : "Nova automação"} hint="Ela nasce desligada e em modo ensaio. Use Testar antes de ligar.">
      <form onSubmit={save} className="space-y-5" data-testid="automacao-form">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Nome" error={fe("name")}><input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Ebook dos 21 dias" /></Field>
          <Field label="Conta do Instagram">
            <select className={input} value={f.account} onChange={(e) => setF({ ...f, account: e.target.value, trigger: { ...t, mediaIds: [] } })} disabled={Boolean(f._id)}>
              {accounts.map((a) => <option key={a._id} value={a._id}>@{a.username}</option>)}
            </select>
          </Field>
        </div>

        <section className="space-y-3">
          <StepTitle n={1} title="Quando" help={<HelpDot id="automacoes" label="Como funciona o gatilho" />} />
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de gatilho">
            {(["comment", "dm"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={t.kind === k} onClick={() => setT({ kind: k })} className={`${btn} ${t.kind === k ? "bg-gray-800 border-brand-500 text-white" : ""}`}>
                {k === "comment" ? "Comentou no post" : "Mandou mensagem no direct"}
              </button>
            ))}
          </div>
          <div className="grid sm:grid-cols-[1fr_auto] gap-3">
            <Field label="Palavras (separe por vírgula)" hint="sem diferença de acento ou maiúscula" error={fe("keywords")}>
              <input className={input} value={kw} onChange={(e) => setKw(e.target.value)} placeholder="QUERO, EBOOK, 21" disabled={t.anyText} />
            </Field>
            <Field label="Como casar">
              <select className={input} value={t.match} onChange={(e) => setT({ match: e.target.value as Form["trigger"]["match"] })}>
                <option value="word">palavra inteira</option><option value="contains">contém</option><option value="exact">só a palavra</option>
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={t.anyText} onChange={(e) => setT({ anyText: e.target.checked })} className="accent-[var(--brand-500)]" /> Disparar em qualquer {t.kind === "comment" ? "comentário" : "mensagem"} (sem palavra)</label>
          {t.kind === "comment" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Em quais posts">
                {([["next", "Próximo post publicado"], ["posts", "Posts escolhidos"], ["all", "Todos os posts"]] as const).map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={t.scope === k} onClick={() => setT({ scope: k })} className={`${btn} ${t.scope === k ? "bg-gray-800 border-brand-500 text-white" : ""}`}>{l}</button>
                ))}
              </div>
              {t.scope === "posts" && (
                <div className="max-h-56 overflow-auto border border-gray-800 rounded-lg divide-y divide-gray-800" data-testid="automacao-posts">
                  {media === null ? <p className="text-xs text-gray-500 p-3">Carregando posts...</p> : !media.length ? <p className="text-xs text-gray-400 p-3">Nenhum post sincronizado nesta conta. Sincronize em Instagram ou use &quot;Próximo post&quot;.</p> : media.map((m) => (
                    <label key={m.igId} className="flex items-center gap-2 px-3 py-2 text-xs text-gray-300 min-w-0 cursor-pointer hover:bg-gray-800/40">
                      <input type="checkbox" className="accent-[var(--brand-500)]" checked={t.mediaIds.includes(m.igId)} onChange={(e) => setT({ mediaIds: e.target.checked ? [...t.mediaIds, m.igId] : t.mediaIds.filter((x) => x !== m.igId) })} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {m.thumbnailUrl && <img src={m.thumbnailUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                      <span className="truncate flex-1" title={m.caption}>{m.caption}</span>
                      <span className="text-gray-500 shrink-0">{fmtWhen(m.timestamp)}</span>
                    </label>
                  ))}
                </div>
              )}
              {fe("mediaIds") && <p className="text-xs text-red-400">{fe("mediaIds")}</p>}
              {t.scope === "next" && <p className="text-[11px] text-gray-500">Vale para o primeiro post publicado depois de salvar. Bom para deixar pronto antes de postar.</p>}
            </div>
          )}
        </section>

        {t.kind === "comment" && (
          <section className="space-y-2">
            <StepTitle n={2} title="Resposta pública no comentário" />
            <p className="text-[11px] text-gray-500">Até 3 textos, usados em rodízio (textos iguais em sequência parecem robô para o Instagram). Deixe vazio para não responder em público.</p>
            {f.publicReplies.map((r, i) => (
              <input key={i} className={input} value={r} maxLength={300} onChange={(e) => setF({ ...f, publicReplies: f.publicReplies.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={["Te mandei no direct! 📩", "Corre lá na DM 😉", "Enviado, confere o direct!"][i]} aria-label={`Resposta pública ${i + 1}`} />
            ))}
            {fe("publicReplies") && <p className="text-xs text-red-400">{fe("publicReplies")}</p>}
          </section>
        )}

        <section className="space-y-3">
          <StepTitle n={t.kind === "comment" ? 3 : 2} title={t.kind === "comment" ? "DM para quem comentou" : "Resposta no direct"} help={<HelpDot id="automacoes" label="Regras da Meta para a DM" />} />
          <Field label="Mensagem" hint={`${f.dm.text.length}/640`} error={fe("dm.text")}>
            <textarea className={`${input} min-h-20`} value={f.dm.text} maxLength={640} onChange={(e) => setDm({ text: e.target.value })} placeholder="Oi! Aqui está o material que você pediu 👇" />
          </Field>
          {t.kind === "comment" && <p className="text-[11px] text-gray-500">A Meta permite UMA DM por comentário, até 7 dias depois dele, e o ContentHub manda no máximo uma por pessoa em cada post. Coloque o link já nesta mensagem.</p>}
          <div className="space-y-2">
            {f.dm.buttons.map((b, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_10rem_1fr_auto] gap-2 items-start">
                <select className={`${input} mt-0 w-auto`} value={b.kind} onChange={(e) => setDm({ buttons: f.dm.buttons.map((x, j) => (j === i ? { ...x, kind: e.target.value as Btn["kind"] } : x)) })} aria-label="Tipo do botão">
                  <option value="url">Link</option><option value="postback">Resposta</option>
                </select>
                <input className={`${input} mt-0`} value={b.title} maxLength={20} onChange={(e) => setDm({ buttons: f.dm.buttons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} placeholder="Texto do botão" aria-label="Texto do botão" />
                {b.kind === "url" ? (
                  <input className={`${input} mt-0 col-span-2 sm:col-span-1`} value={b.url} onChange={(e) => setDm({ buttons: f.dm.buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} placeholder="https://..." aria-label="Link do botão" />
                ) : (
                  <input className={`${input} mt-0 col-span-2 sm:col-span-1`} value={b.replyText} onChange={(e) => setDm({ buttons: f.dm.buttons.map((x, j) => (j === i ? { ...x, replyText: e.target.value } : x)) })} placeholder="O que responder quando tocar" aria-label="Resposta do botão" />
                )}
                <button type="button" className="p-2 text-gray-400 hover:text-red-300" aria-label="Tirar botão" onClick={() => setDm({ buttons: f.dm.buttons.filter((_, j) => j !== i) })}><X size={15} /></button>
                {fe(`dm.buttons.${i}`) && <p className="text-xs text-red-400 col-span-full">{fe(`dm.buttons.${i}`)}</p>}
                {b.clicks !== undefined && b.kind === "url" && <p className="text-[11px] text-gray-500 col-span-full">{b.clicks} clique(s) contados neste link</p>}
              </div>
            ))}
            {f.dm.buttons.length < maxButtons && <button type="button" className={linkBtn} onClick={() => setDm({ buttons: [...f.dm.buttons, { kind: "url", title: "", url: "", replyText: "", tag: "" }] })}>+ botão</button>}
            {fe("dm.buttons") && <p className="text-xs text-red-400">{fe("dm.buttons")}</p>}
          </div>
          <details className="text-xs text-gray-400">
            <summary className="cursor-pointer select-none">Respostas rápidas ({f.dm.quickReplies.length}/13) <span className="text-gray-500">aparecem no celular, não no computador</span></summary>
            <div className="space-y-2 mt-2">
              {f.dm.quickReplies.map((q, i) => (
                <div key={i} className="grid grid-cols-[8rem_1fr_6rem_auto] gap-2">
                  <input className={`${input} mt-0`} value={q.title} maxLength={20} placeholder="Texto" aria-label="Texto da resposta rápida" onChange={(e) => setDm({ quickReplies: f.dm.quickReplies.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                  <input className={`${input} mt-0`} value={q.replyText} placeholder="Responder com" aria-label="Responder com" onChange={(e) => setDm({ quickReplies: f.dm.quickReplies.map((x, j) => (j === i ? { ...x, replyText: e.target.value } : x)) })} />
                  <input className={`${input} mt-0`} value={q.tag} placeholder="etiqueta" aria-label="Etiqueta" onChange={(e) => setDm({ quickReplies: f.dm.quickReplies.map((x, j) => (j === i ? { ...x, tag: e.target.value } : x)) })} />
                  <button type="button" className="p-2 text-gray-400 hover:text-red-300" aria-label="Tirar resposta rápida" onClick={() => setDm({ quickReplies: f.dm.quickReplies.filter((_, j) => j !== i) })}><X size={15} /></button>
                </div>
              ))}
              {f.dm.quickReplies.length < 13 && <button type="button" className={linkBtn} onClick={() => setDm({ quickReplies: [...f.dm.quickReplies, { title: "", replyText: "", tag: "" }] })}>+ resposta rápida</button>}
            </div>
          </details>
        </section>

        <section className="space-y-2">
          <StepTitle n={t.kind === "comment" ? 4 : 3} title="Pedir e-mail ou telefone (opcional)" help={<HelpDot id="contatos-e-lgpd" label="Consentimento e LGPD" />} />
          <label className="flex items-center gap-2 text-sm text-gray-200"><input type="checkbox" checked={f.ask.enabled} onChange={(e) => setAsk({ enabled: e.target.checked })} className="accent-[var(--brand-500)]" /> Pôr um botão na DM para a pessoa deixar o contato</label>
          {f.ask.enabled && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="O que pedir"><select className={input} value={f.ask.field} onChange={(e) => setAsk({ field: e.target.value as "email" | "phone" })}><option value="email">E-mail</option><option value="phone">Telefone / WhatsApp</option></select></Field>
              <Field label="Texto do botão" error={fe("ask.buttonTitle")}><input className={input} value={f.ask.buttonTitle} maxLength={20} onChange={(e) => setAsk({ buttonTitle: e.target.value })} /></Field>
              <Field label="Texto de consentimento (a pessoa responde Sim ou Não)" className="sm:col-span-2" hint="diga quem guarda e para quê" error={fe("ask.consentText")}>
                <textarea className={`${input} min-h-16`} value={f.ask.consentText} maxLength={600} onChange={(e) => setAsk({ consentText: e.target.value })} placeholder={initial.ask.defaultConsent || "Para te enviar o material, a {sua empresa} precisa guardar o seu e-mail e usar só para isso. Você autoriza?"} />
              </Field>
              <Field label="Pergunta depois do sim"><input className={input} value={f.ask.question} maxLength={300} onChange={(e) => setAsk({ question: e.target.value })} placeholder={f.ask.field === "phone" ? "Qual o seu telefone com DDD?" : "Qual o seu melhor e-mail?"} /></Field>
              <Field label="Agradecimento"><input className={input} value={f.ask.thanks} maxLength={300} onChange={(e) => setAsk({ thanks: e.target.value })} placeholder="Prontinho, anotado! Obrigado." /></Field>
              <p className="text-[11px] text-gray-500 sm:col-span-2">O e-mail/telefone só é guardado depois do &quot;sim&quot;. Guardamos a data e a versão do texto aceito. Quem responder &quot;parar&quot; não recebe mais nada automático.</p>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <StepTitle n={t.kind === "comment" ? 5 : 4} title="Etiqueta no contato" />
          <Field label="Etiquetas (separe por vírgula)" error={fe("tags")}><input className={input} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ebook, lead-quente" /></Field>
        </section>

        {err && !err.field && <p className="text-xs text-red-400" role="alert">{err.msg}</p>}
        {err?.field && <p className="text-xs text-red-400" role="alert">{err.msg}</p>}
        <div className="flex items-center gap-3 sticky bottom-0 bg-gray-900 py-2">
          <button type="submit" disabled={busy} className={primary} data-testid="automacao-salvar">{busy ? "Salvando..." : "Salvar"}</button>
          <button type="button" className={linkBtn} onClick={onCancel}>Cancelar</button>
        </div>
      </form>
    </Card>
  );
}

// ---------- testar (simulação) ----------

function StepLine({ s }: { s: Step }) {
  const st = STATUS[s.status] || { label: s.status, cls: "bg-gray-700 text-gray-300" };
  const msg = s.payload?.message;
  const textOf = typeof msg === "string" ? msg : msg?.text || msg?.attachment?.payload?.text || "";
  const buttons: any[] = msg?.attachment?.payload?.buttons || [];
  return (
    <li className="text-xs space-y-1">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`${chip} ${st.cls}`}>{st.label}</span>
        <span className="text-gray-200 shrink-0">{STEP_PT[s.kind] || s.kind}</span>
        {s.detail && <span className="text-gray-500 truncate" title={s.detail}>{s.detail}</span>}
      </div>
      {textOf && <p className="ml-2 pl-2 border-l border-gray-700 text-gray-300 whitespace-pre-wrap">{textOf}</p>}
      {buttons.length > 0 && <div className="ml-2 pl-2 flex flex-wrap gap-1">{buttons.map((b, i) => <span key={i} className={`${chip} border border-gray-600 text-gray-200`}>{b.title}{b.type === "web_url" ? " ↗" : ""}</span>)}</div>}
      {s.metaError && <p className="ml-2 text-red-300">Meta: {s.metaError}</p>}
    </li>
  );
}

function TestBox({ a, onClose }: { a: AutomationT; onClose: () => void }) {
  const [text, setText] = useState(a.trigger.keywords[0] ? `Eu ${a.trigger.keywords[0].toLowerCase()}!` : "Oi");
  const [res, setRes] = useState<{ matched: boolean; note: string; run: { status: string; steps: Step[] } | null } | null>(null);
  const [err, setErr] = useState("");
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const r = await send<any>("POST", "/api/automacoes/simular", { automation: a._id, text, username: "pessoa_teste" });
    if (!r.ok) return setErr(r.error);
    setRes(r.data);
  }
  return (
    <div className="border-t border-gray-800 pt-3 space-y-2" data-testid="automacao-teste">
      <form onSubmit={go} className="flex gap-2">
        <input className={`${input} mt-0`} value={text} onChange={(e) => setText(e.target.value)} aria-label={a.trigger.kind === "dm" ? "Mensagem de teste" : "Comentário de teste"} placeholder={a.trigger.kind === "dm" ? "Mensagem de teste" : "Comentário de teste"} />
        <button type="submit" className={primary}>Testar</button>
        <button type="button" className="p-2 text-gray-400 hover:text-gray-200" aria-label="Fechar teste" onClick={onClose}><X size={16} /></button>
      </form>
      <p className="text-[11px] text-gray-500">Simulação: nada é enviado para o Instagram, nem com a automação ligada.</p>
      {err && <p className="text-xs text-red-400">{err}</p>}
      {res && !res.matched && <p className="text-xs text-gray-300">Não disparou: {res.note || "a palavra não casou"}.</p>}
      {res?.run && <ul className="space-y-2">{res.run.steps.map((s, i) => <StepLine key={i} s={s} />)}</ul>}
    </div>
  );
}

// ---------- lista ----------

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return <div className="min-w-0"><div className="text-[11px] text-gray-500">{label}</div><div className="text-sm font-semibold tabular-nums text-gray-100">{(value ?? 0).toLocaleString("pt-BR")}</div></div>;
}

function AutomationCard({ a, account, canManage, onEdit, onChanged, onLog }: { a: AutomationT; account: string; canManage: boolean; onEdit: () => void; onChanged: (msg?: string) => void; onLog: () => void }) {
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState(false);
  async function put(body: Record<string, unknown>, ok?: string) {
    setBusy(true);
    const r = await send("PUT", `/api/automacoes/${a._id}`, body);
    setBusy(false);
    onChanged(r.ok ? ok : r.error);
  }
  async function remove() {
    if (!window.confirm(`Apagar a automação "${a.name}"? O histórico de execuções fica.`)) return;
    const r = await send("DELETE", `/api/automacoes/${a._id}`);
    onChanged(r.ok ? "Automação apagada." : r.error);
  }
  function goLive() {
    if (!window.confirm("Sair do modo ensaio? A automação passa a responder e mandar DM DE VERDADE no Instagram (respeitando as chaves e o teto por hora).")) return;
    put({ dryRun: false, confirm: true }, "Automação fora do ensaio.");
  }
  const s = a.stats;
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3 min-w-0" data-testid="automacao-card">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-100 truncate flex items-center gap-2">
            {a.name}
            <span className={`${chip} ${a.active ? "bg-green-500/15 text-green-300" : "bg-gray-700 text-gray-300"}`}>{a.active ? "ligada" : "desligada"}</span>
            <span className={`${chip} ${a.dryRun ? "bg-sky-500/15 text-sky-300" : "bg-amber-500/15 text-amber-200"}`}>{a.dryRun ? "ensaio" : "de verdade"}</span>
          </h3>
          <p className="text-xs text-gray-400 truncate" title={summary(a)}>@{account} · {summary(a)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={btn} onClick={() => setTesting((v) => !v)} data-testid="automacao-testar"><FlaskConical size={14} /> Testar</button>
          {canManage && <button type="button" className={btn} disabled={busy} onClick={() => put({ active: !a.active }, a.active ? "Automação desligada." : "Automação ligada.")}><Power size={14} /> {a.active ? "Desligar" : "Ligar"}</button>}
          {canManage && a.dryRun && <button type="button" className={btn} disabled={busy} onClick={goLive}>Sair do ensaio</button>}
          {canManage && !a.dryRun && <button type="button" className={btn} disabled={busy} onClick={() => put({ dryRun: true }, "De volta ao ensaio.")}>Voltar ao ensaio</button>}
          <button type="button" className="p-2 text-gray-400 hover:text-gray-200" onClick={onEdit} aria-label="Editar"><Pencil size={15} /></button>
          {canManage && <button type="button" className="p-2 text-gray-400 hover:text-red-300" onClick={remove} aria-label="Apagar"><Trash2 size={15} /></button>}
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-3">
        <Stat label="Disparos" value={s.matched} /><Stat label="Respostas" value={s.publicSent} /><Stat label="DMs" value={s.dmSent} /><Stat label="Cliques" value={s.clicks} /><Stat label="Contatos" value={s.leads} /><Stat label="Ensaios" value={s.dryRuns} /><Stat label="Falhas" value={s.failed} />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
        <span>Última execução: {fmtWhen(s.lastRunAt || null)}</span>
        <button type="button" className={linkBtn} onClick={onLog}>ver execuções</button>
      </div>
      {testing && <TestBox a={a} onClose={() => setTesting(false)} />}
    </section>
  );
}

// ---------- execuções ----------

function RunsTab({ automations, filter, setFilter }: { automations: AutomationT[]; filter: { automation: string; status: string }; setFilter: (f: { automation: string; status: string }) => void }) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [open, setOpen] = useState<string>("");
  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (filter.automation) q.set("automation", filter.automation);
    if (filter.status) q.set("status", filter.status);
    const r = await send<Run[]>("GET", `/api/automacoes/execucoes?${q}`);
    setRuns(r.ok ? r.data : []);
  }, [filter]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-3" data-testid="automacoes-execucoes">
      <div className="flex flex-wrap gap-2 items-center">
        <select className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-gray-100 max-w-[220px]" value={filter.automation} onChange={(e) => setFilter({ ...filter, automation: e.target.value })} aria-label="Automação">
          <option value="">Todas as automações</option>
          {automations.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
        </select>
        {["", "done", "dry_run", "skipped", "failed"].map((s) => (
          <button key={s} type="button" onClick={() => setFilter({ ...filter, status: s })} className={`${chip} px-2.5 py-1.5 text-xs border ${filter.status === s ? "border-brand-500 text-white bg-gray-800" : "border-gray-700 text-gray-400"}`}>{s ? STATUS[s].label : "todas"}</button>
        ))}
        <span className="text-xs text-gray-500 ml-auto">{runs ? `${runs.length} execução(ões)` : "Carregando..."}</span>
        <button type="button" className={linkBtn} onClick={load}>atualizar</button>
      </div>
      {runs && !runs.length && <p className="text-sm text-gray-400">Nenhuma execução ainda. Use Testar numa automação para ver como fica.</p>}
      <ul className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
        {runs?.map((r) => {
          const st = STATUS[r.status] || STATUS.skipped;
          const isOpen = open === r._id;
          return (
            <li key={r._id}>
              <button type="button" className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs min-w-0 hover:bg-gray-800/40" onClick={() => setOpen(isOpen ? "" : r._id)} aria-expanded={isOpen}>
                {isOpen ? <ChevronDown size={14} className="shrink-0 text-gray-500" /> : <ChevronRight size={14} className="shrink-0 text-gray-500" />}
                <span className="text-gray-500 shrink-0 tabular-nums">{fmtWhen(r.createdAt)}</span>
                <span className={`${chip} ${st.cls}`}>{st.label}</span>
                {r.simulated && <span className={`${chip} bg-gray-700 text-gray-300`}>simulação</span>}
                <span className="text-gray-200 shrink-0 max-w-[30%] truncate">{r.automationName || "(sem automação)"}</span>
                <span className="text-gray-400 truncate flex-1" title={r.text}>{r.username ? `@${r.username}` : ""} {TRIGGER_PT[r.trigger] || r.trigger}: {r.text}</span>
              </button>
              {isOpen && <ul className="px-9 pb-3 space-y-2">{r.steps.map((s, i) => <StepLine key={i} s={s} />)}</ul>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- painel ----------

export default function AutomationsPanel({ projects, selectedProject, onSelectProject, canManage }: { projects: ProjectOpt[]; selectedProject: string; onSelectProject: (id: string) => void; canManage: boolean }) {
  const project = projects.some((p) => p._id === selectedProject) ? selectedProject : projects[0]?._id || "";
  const [tab, setTabState] = useState<"lista" | "execucoes">("lista");
  const [data, setData] = useState<Overview | null>(null);
  const [form, setForm] = useState<"" | "new" | string>("");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad" | "warn" | "info"; text: string } | null>(null);
  const [switchClosed, setSwitchClosed] = useState(false);
  const [runFilter, setRunFilter] = useState({ automation: "", status: "" });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("aba") === "execucoes") setTabState("execucoes");
    const a = p.get("automacao");
    if (a) setRunFilter((f) => ({ ...f, automation: a }));
  }, []);
  function setTab(t: "lista" | "execucoes", automation = "") {
    setTabState(t);
    const url = new URL(window.location.href);
    if (t === "lista") url.searchParams.delete("aba"); else url.searchParams.set("aba", t);
    if (automation) url.searchParams.set("automacao", automation); else url.searchParams.delete("automacao");
    window.history.replaceState(null, "", url);
    if (t === "execucoes") setRunFilter({ automation, status: "" });
  }
  const load = useCallback(async () => {
    if (!project) return;
    const r = await send<Overview>("GET", `/api/automacoes?project=${project}`);
    if (r.ok) setData(r.data);
    else setMsg({ tone: "bad", text: r.error });
  }, [project]);
  useEffect(() => { setData(null); setForm(""); load(); }, [load]);
  const accountName = useMemo(() => new Map((data?.accounts || []).map((a) => [a._id, a.username])), [data]);

  if (!projects.length) return <p className="text-sm text-gray-400 py-16 text-center">Crie um projeto primeiro.</p>;
  const list = data?.automations || [];
  const editing = list.find((a) => a._id === form);
  const firstAccount = data?.accounts[0]?._id || "";
  return (
    <div className="flex-1 overflow-auto p-3 md:p-6" data-testid="automacoes">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-gray-400 flex items-center gap-2">Projeto
            <select className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-gray-100 max-w-[200px]" value={project} onChange={(e) => onSelectProject(e.target.value)} data-testid="automacoes-projeto">
              {projects.map((p) => <option key={p._id} value={p._id}>{p.icon} {p.name}</option>)}
            </select>
          </label>
          <nav className="flex gap-1 overflow-x-auto ml-auto max-w-full" aria-label="Áreas de Automações">
            {([["lista", "Automações", Bot], ["execucoes", "Execuções", ListChecks]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition ${tab === id ? "bg-gray-800 text-white font-semibold" : "text-gray-400 hover:bg-gray-800/50"}`} aria-current={tab === id ? "page" : undefined} data-testid={`aba-${id}`}>
                <Icon size={15} />{label}
              </button>
            ))}
          </nav>
        </div>
        {data && !data.switch.on && !switchClosed && (
          <Notice tone="info" onClose={() => setSwitchClosed(true)}>
            {data.switch.message} <a href={helpLink("meta-app-automacoes")} className="underline underline-offset-2">O que falta na Meta</a>
          </Notice>
        )}
        {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}

        {tab === "lista" && (
          <>
            {data && !data.accounts.length && <Notice tone="info">Conecte uma conta do Instagram neste projeto (Configurações › Redes Sociais) para criar automações.</Notice>}
            {data && data.accounts.length > 0 && form !== "new" && !editing && (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={primary + " inline-flex items-center gap-1.5"} onClick={() => setForm("new")} data-testid="automacao-nova"><Plus size={15} /> Nova automação</button>
                <span className="text-[11px] text-gray-500">Teto de {data.hourlyCap} envios por hora por conta (a Meta permite 750). <HelpDot id="automacoes" label="Ajuda das automações" /></span>
              </div>
            )}
            {form === "new" && firstAccount && <AutomationForm initial={blank(firstAccount)} accounts={data!.accounts} onCancel={() => setForm("")} onDone={() => { setForm(""); setMsg({ tone: "ok", text: "Automação salva (desligada, em ensaio). Clique em Testar para ver o que ela mandaria." }); load(); }} />}
            {editing && <AutomationForm key={editing._id} initial={{ ...editing }} accounts={data!.accounts} onCancel={() => setForm("")} onDone={() => { setForm(""); setMsg({ tone: "ok", text: "Automação salva." }); load(); }} />}
            {data && !list.length && form !== "new" && data.accounts.length > 0 && (
              <Card title="Nenhuma automação ainda">
                <p className="text-sm text-gray-300">Exemplo: quem comentar <b>QUERO</b> no próximo post recebe uma resposta pública e uma DM com o link do material. Crie, teste e só depois ligue.</p>
              </Card>
            )}
            {!editing && form !== "new" && (
              <div className="grid gap-3">
                {list.map((a) => <AutomationCard key={a._id} a={a} account={accountName.get(a.account) || ""} canManage={canManage} onEdit={() => setForm(a._id)} onLog={() => setTab("execucoes", a._id)} onChanged={(t) => { if (t) setMsg({ tone: /só o dono|confirme|não/i.test(t) ? "warn" : "ok", text: t }); load(); }} />)}
              </div>
            )}
          </>
        )}
        {tab === "execucoes" && <RunsTab automations={list} filter={runFilter} setFilter={setRunFilter} />}
      </div>
    </div>
  );
}
