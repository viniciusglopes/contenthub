"use client";
/* eslint-disable react-hooks/set-state-in-effect -- carga inicial e pré-visualização */

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { fieldCls, ghostBtn, primaryBtn } from "@/components/brand";
import { send } from "@/components/http";
import { FONT_PAIRS, type KitT, PALETTE_FIELDS, isHex, paletteProblem } from "@/lib/studio/kitspec";
import { VISUAL_MODELS } from "@/lib/studio/script";
import { SECTORS } from "@/lib/studio/sectors";
import { Card, Field, Notice, uploadRaw } from "./shared";

type Form = Omit<KitT, "tone" | "pending" | "saved" | "logo" | "_id"> & { adjectives: string; avoid: string };
const toForm = (k: KitT): Form => ({ project: k.project, name: k.name, handle: k.handle, profession: k.profession, registration: k.registration, segment: k.segment, offer: k.offer, audience: k.audience, city: k.city, palette: { ...k.palette }, fontPair: k.fontPair, sector: k.sector, adjectives: k.tone.adjectives.join(", "), avoid: k.tone.avoid.join(", ") });
const toBody = (f: Form) => ({ ...f, tone: { adjectives: f.adjectives.split(","), avoid: f.avoid.split(",") } });

// Kit de marca do projeto: um formulário, UM Salvar, e a pré-visualização de um slide que
// acompanha o que está na tela (antes de salvar).
export default function KitTab({ project, onSaved }: { project: string; onSaved?: (k: KitT) => void }) {
  const [kit, setKit] = useState<KitT | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<{ msg: string; field?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState("");
  const [modelo, setModelo] = useState("editorial");
  const [tipo, setTipo] = useState("capa");
  const [preview, setPreview] = useState<{ url: string; error: string; loading: boolean }>({ url: "", error: "", loading: true });
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    setKit(null);
    send<KitT>("GET", `/api/estudio/kit?project=${project}`).then((r) => {
      if (r.ok) { setKit(r.data); setForm(toForm(r.data!)); } else setError({ msg: r.error });
    });
  }, [project]);

  const palProblem = form ? paletteProblem(form.palette) : "";
  // pré-visualização: redesenha 0,6 s depois da última mudança
  useEffect(() => {
    if (!form) return;
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      if (!form.name || !form.handle || palProblem) return setPreview((p) => ({ ...p, loading: false, error: palProblem || "Preencha o nome e o @ para ver a pré-visualização." }));
      setPreview((p) => ({ ...p, loading: true, error: "" }));
      try {
        const res = await fetch("/api/estudio/previa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project, kit: toBody(form), modelo, tipo }) });
        if (id !== seq.current) return;
        if (!res.ok) {
          const msg = (await res.json().catch(() => null))?.error || "Não deu para desenhar a pré-visualização.";
          return setPreview((p) => ({ ...p, loading: false, error: msg }));
        }
        const url = URL.createObjectURL(await res.blob());
        setPreview((p) => { if (p.url) URL.revokeObjectURL(p.url); return { url, error: "", loading: false }; });
      } catch {
        if (id === seq.current) setPreview((p) => ({ ...p, loading: false, error: "Sem conexão com o servidor." }));
      }
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só os campos que mudam a arte
  }, [form?.name, form?.handle, form?.profession, form?.registration, form?.fontPair, form?.sector, JSON.stringify(form?.palette), modelo, tipo, kit?.logo?._id, project]);

  if (!form || !kit) return error ? <Notice tone="bad">{error.msg}</Notice> : <p className="text-sm text-gray-400 py-10 text-center">Carregando…</p>;
  const set = (patch: Partial<Form>) => { setForm({ ...form, ...patch }); setSaved(false); };
  const err = (f: string) => (error?.field === f ? error.msg : "");
  const sector = SECTORS[form.sector] || SECTORS.geral;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setError(null);
    const r = await send<KitT>("PUT", "/api/estudio/kit", toBody(form!));
    setBusy("");
    if (!r.ok) return setError({ msg: r.error, field: r.field });
    setKit(r.data);
    setSaved(true);
    onSaved?.(r.data!);
  }
  async function sendLogo(file: File | undefined) {
    if (!file) return;
    setBusy("logo");
    const r = await uploadRaw<{ _id: string; url: string }>(`/api/estudio/arquivo?tipo=logo&project=${project}&name=${encodeURIComponent(file.name)}`, file);
    setBusy("");
    if (!r.ok) return setError({ msg: r.error, field: "logo" });
    setError(null);
    setKit({ ...kit!, logo: r.data });
  }
  async function removeLogo() {
    if (!kit?.logo) return;
    await send("DELETE", `/api/estudio/arquivo?id=${kit.logo._id}`);
    setKit({ ...kit, logo: null });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      <form onSubmit={save} className="space-y-4" data-testid="form-kit">
        {kit.pending.filter((p) => p.block).length > 0 && (
          <Notice tone="warn"><ul className="list-disc pl-4 space-y-0.5">{kit.pending.filter((p) => p.block).map((p) => <li key={p.text}>{p.text}</li>)}</ul></Notice>
        )}
        <Card title="Quem assina" hint="Aparece na arte, no vídeo e na legenda.">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nome que assina as peças" error={err("name")}><input className={fieldCls(!!err("name"))} value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} /></Field>
            <Field label="@ do Instagram" error={err("handle")}><input className={fieldCls(!!err("handle"))} value={form.handle} onChange={(e) => set({ handle: e.target.value })} placeholder="@suamarca" maxLength={31} /></Field>
            <Field label="Profissão ou tipo de negócio"><input className={fieldCls()} value={form.profession} onChange={(e) => set({ profession: e.target.value })} maxLength={60} /></Field>
            <Field label={sector.registrationLabel}><input className={fieldCls()} value={form.registration} onChange={(e) => set({ registration: e.target.value })} maxLength={40} placeholder={sector.requiresRegistration ? "obrigatório neste setor" : "opcional"} /></Field>
          </div>
        </Card>
        <Card title="Regras do setor" hint="O sistema aplica estas regras ao roteiro (da IA ou escrito à mão) antes de desenhar qualquer coisa.">
          <Field label="Setor">
            <select className={fieldCls()} value={form.sector} onChange={(e) => set({ sector: e.target.value })} data-testid="setor">
              {Object.entries(SECTORS).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
            </select>
          </Field>
          <details className="mt-2 text-xs text-gray-400">
            <summary className="cursor-pointer text-gray-300">Ver as {sector.summary.length} regras deste setor</summary>
            <ul className="list-disc pl-4 mt-1.5 space-y-1">{sector.summary.map((r) => <li key={r}>{r}</li>)}</ul>
            {form.sector === "odontologia" && <p className="mt-1.5 text-gray-500">Regras lidas em fontes secundárias do Código de Ética do CFO; não é parecer jurídico. Valide com o conselho antes do primeiro post.</p>}
          </details>
        </Card>
        <Card title="O que a marca fala" hint="Usado pela IA para escrever o roteiro.">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Segmento"><input className={fieldCls()} value={form.segment} onChange={(e) => set({ segment: e.target.value })} maxLength={120} /></Field>
            <Field label="Cidade"><input className={fieldCls()} value={form.city} onChange={(e) => set({ city: e.target.value })} maxLength={60} /></Field>
            <Field label="O que oferece" className="md:col-span-2"><textarea className={fieldCls()} rows={2} value={form.offer} onChange={(e) => set({ offer: e.target.value })} maxLength={300} /></Field>
            <Field label="Público" className="md:col-span-2"><textarea className={fieldCls()} rows={2} value={form.audience} onChange={(e) => set({ audience: e.target.value })} maxLength={300} /></Field>
            <Field label="Tom de voz" hint="separe por vírgula"><input className={fieldCls()} value={form.adjectives} onChange={(e) => set({ adjectives: e.target.value })} placeholder="sereno, preciso, acolhedor" /></Field>
            <Field label="Evitar" hint="separe por vírgula"><input className={fieldCls()} value={form.avoid} onChange={(e) => set({ avoid: e.target.value })} placeholder="gíria, exclamações" /></Field>
          </div>
        </Card>
        <Card title="Cara da marca">
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {PALETTE_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <span className="flex items-center gap-2 mt-1">
                  <input type="color" value={isHex(form.palette[f.key]) ? form.palette[f.key] : "#000000"} onChange={(e) => set({ palette: { ...form.palette, [f.key]: e.target.value.toUpperCase() } })} className="w-9 h-9 rounded bg-transparent border border-gray-700 shrink-0" aria-label={f.label} />
                  <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-100 font-mono" value={form.palette[f.key]} onChange={(e) => set({ palette: { ...form.palette, [f.key]: e.target.value } })} maxLength={7} />
                </span>
              </Field>
            ))}
          </div>
          {(palProblem || err("palette")) && <p className="text-xs text-red-400 mt-2">{palProblem || err("palette")}</p>}
          <div className="grid gap-3 md:grid-cols-2 mt-3">
            <Field label="Fontes" hint="livres (SIL OFL), já dentro do sistema">
              <select className={fieldCls()} value={form.fontPair} onChange={(e) => set({ fontPair: e.target.value })}>{Object.entries(FONT_PAIRS).map(([id, f]) => <option key={id} value={id}>{f.label}</option>)}</select>
            </Field>
            <div className="text-xs text-gray-400">
              Logo <span className="text-gray-500">(PNG com fundo transparente fica melhor; até 8 MB)</span>
              <div className="flex items-center gap-2 mt-1">
                {kit.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- arquivo do próprio app
                  <img src={kit.logo.url} alt="Logo" className="h-10 max-w-[140px] object-contain rounded bg-gray-700/60 p-1" />
                ) : <span className="h-10 w-16 rounded bg-gray-800 border border-dashed border-gray-700 flex items-center justify-center text-gray-600"><ImagePlus size={16} /></span>}
                <button type="button" className={ghostBtn} disabled={busy === "logo"} onClick={() => fileRef.current?.click()}>{busy === "logo" ? "Enviando…" : kit.logo ? "Trocar" : "Enviar logo"}</button>
                {kit.logo && <button type="button" className="p-1.5 text-gray-400 hover:text-red-300" onClick={removeLogo} aria-label="Remover logo"><Trash2 size={14} /></button>}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { sendLogo(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
              {err("logo") && <span className="block text-red-400 mt-1">{err("logo")}</span>}
            </div>
          </div>
        </Card>
        {error && !["name", "handle", "palette", "logo"].includes(error.field || "") && <Notice tone="bad">{error.msg}</Notice>}
        {saved && <Notice tone="ok" onClose={() => setSaved(false)}>Kit salvo.</Notice>}
        <button type="submit" className={primaryBtn} disabled={busy === "save" || !!palProblem} data-testid="salvar-kit">{busy === "save" ? "Salvando…" : "Salvar kit de marca"}</button>
      </form>

      <aside className="lg:sticky lg:top-4 space-y-2" data-testid="previa-kit">
        <div className="flex gap-2">
          <select className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200" value={modelo} onChange={(e) => setModelo(e.target.value)} aria-label="Modelo visual da pré-visualização">
            {Object.entries(VISUAL_MODELS).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
          </select>
          <select className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Slide da pré-visualização">
            <option value="capa">Capa</option><option value="conteudo">Conteúdo</option><option value="cta">Chamada final</option>
          </select>
        </div>
        <div className="relative rounded-xl overflow-hidden bg-gray-800 border border-gray-800 aspect-[4/5]">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem gerada na hora */}
          {preview.url && <img src={preview.url} alt="Pré-visualização de um slide com este kit" className={`w-full h-full object-cover transition-opacity ${preview.loading ? "opacity-50" : ""}`} />}
          {!preview.url && <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500 p-6 text-center">{preview.error || "Desenhando…"}</div>}
        </div>
        <p className="text-[11px] text-gray-500">{preview.url && preview.error ? <span className="text-amber-300">{preview.error}</span> : "Pré-visualização ao vivo: muda junto com o formulário, antes de salvar."}</p>
      </aside>
    </div>
  );
}
