"use client";
/* eslint-disable react-hooks/set-state-in-effect -- carga inicial por projeto */

import { useCallback, useEffect, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { fieldCls, ghostBtn, primaryBtn } from "@/components/brand";
import { send } from "@/components/http";
import { REEL_FONTS, STRUCTURES, type TemplateSettings, TEMPLATE_LIMITS as L, VOICES, defaultSettings } from "@/lib/studio/cenas-spec";
import type { TemplateT } from "./CenasTab";
import { Card, Field, Notice, linkBtn } from "./shared";

const COLORS: { key: keyof TemplateSettings["colors"]; label: string }[] = [
  { key: "highlight", label: "Destaque dos cartões" },
  { key: "captionHighlight", label: "Palavra falada" },
  { key: "caption", label: "Legenda" },
  { key: "captionStroke", label: "Contorno da legenda" },
  { key: "brand", label: "Nome no topo" },
  { key: "bar", label: "Barra de progresso" },
];

// PADRÕES DE VÍDEO do projeto: lista à esquerda, um formulário com UM Salvar à direita.
export default function PadroesTab({ project }: { project: string }) {
  const [list, setList] = useState<TemplateT[] | null>(null);
  const [sel, setSel] = useState<string>("");
  const [name, setName] = useState("");
  const [s, setS] = useState<TemplateSettings | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  const [newCat, setNewCat] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(async (pick?: string) => {
    const [r, c] = await Promise.all([send<TemplateT[]>("GET", `/api/estudio/padroes?project=${project}`), send<{ categories: { name: string }[] }>("GET", "/api/estudio/cenas")]);
    if (c.ok) setCats(c.data!.categories.map((x) => x.name));
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setList(r.data!);
    const t = r.data!.find((x) => x._id === pick) || r.data!.find((x) => x.isDefault) || r.data![0];
    if (t) { setSel(t._id); setName(t.name); setS(t.settings); } else { setSel(""); setName("Meu padrão"); setS(defaultSettings()); }
  }, [project]);
  useEffect(() => { load(); }, [load]);

  const open = (t: TemplateT | null, preset?: "impacto" | "sereno") => {
    setMsg(null);
    if (t) { setSel(t._id); setName(t.name); setS(t.settings); } else { setSel(""); setName(preset === "sereno" ? "Padrão sereno" : "Padrão impacto"); setS(defaultSettings(preset)); }
  };
  const set = (patch: Partial<TemplateSettings>) => setS((cur) => ({ ...cur!, ...patch }));

  async function save() {
    setBusy("salvar"); setMsg(null);
    const r = sel ? await send<TemplateT>("PUT", `/api/estudio/padroes/${sel}`, { name, settings: s }) : await send<TemplateT>("POST", "/api/estudio/padroes", { project, name, settings: s });
    setBusy("");
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "ok", text: "Padrão salvo. Os próximos vídeos com ele seguem estas escolhas." });
    load(r.data!._id);
  }
  async function makeDefault() {
    if (!sel) return;
    await send("PUT", `/api/estudio/padroes/${sel}`, { isDefault: true });
    load(sel);
  }
  async function remove() {
    if (!sel || !window.confirm(`Apagar o padrão “${name}”? Os vídeos já feitos não mudam.`)) return;
    const r = await send("DELETE", `/api/estudio/padroes/${sel}`);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    load();
  }

  if (!list || !s) return <p className="text-sm text-gray-500 py-8 text-center">Carregando…</p>;
  const allCats = [...new Set([...cats, ...s.categories.map((c) => c.name)])];
  const weight = (c: string) => s.categories.find((x) => x.name === c)?.weight || 0;
  const setWeight = (c: string, w: number) => set({ categories: w === 0 ? s.categories.filter((x) => x.name !== c) : s.categories.some((x) => x.name === c) ? s.categories.map((x) => (x.name === c ? { ...x, weight: w } : x)) : [...s.categories, { name: c, weight: w }] });

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]" data-testid="padroes">
      <Card title="Padrões do projeto" className="h-fit">
        <ul className="space-y-1" data-testid="padroes-lista">
          {list.map((t) => (
            <li key={t._id}><button type="button" onClick={() => open(t)} className={`w-full text-left px-2.5 py-2 rounded-lg text-sm truncate flex items-center gap-1.5 ${sel === t._id ? "bg-gray-800 text-white" : "text-gray-300 hover:bg-gray-800/50"}`} title={t.name}>{t.isDefault && <Star size={12} className="text-amber-300 shrink-0" />}<span className="truncate">{t.name}</span></button></li>
          ))}
          {list.length === 0 && <li className="text-xs text-gray-500 px-1">Nenhum padrão ainda.</li>}
        </ul>
        <div className="flex flex-col gap-1 mt-3 text-xs">
          <button type="button" className={ghostBtn} onClick={() => open(null, "impacto")}><Plus size={12} className="inline -mt-0.5" /> Novo: impacto</button>
          <button type="button" className={ghostBtn} onClick={() => open(null, "sereno")}><Plus size={12} className="inline -mt-0.5" /> Novo: sereno</button>
        </div>
      </Card>

      <div className="space-y-4 min-w-0">
        <Card title={sel ? "Editar padrão" : "Novo padrão"} right={sel ? <div className="flex gap-3"><button type="button" className={linkBtn} onClick={makeDefault}>Tornar principal</button><button type="button" className={`${linkBtn} hover:!text-red-300`} onClick={remove}><Trash2 size={12} className="inline -mt-0.5" /> Apagar</button></div> : null}>
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <Field label="Nome"><input className={fieldCls()} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} data-testid="padrao-nome" /></Field>
            <Field label="Estilo de base"><select className={fieldCls()} value={s.preset} onChange={(e) => set({ preset: e.target.value as "impacto" | "sereno" })}><option value="impacto">Impacto (caixa alta, forte)</option><option value="sereno">Sereno (serifa, calmo)</option></select></Field>
          </div>
        </Card>

        <Card title="Voz e ritmo">
          <div className="grid gap-3 md:grid-cols-[1fr_150px_150px]">
            <Field label="Voz"><select className={fieldCls()} value={s.voice.name} onChange={(e) => set({ voice: { ...s.voice, name: e.target.value } })} data-testid="padrao-voz">{VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></Field>
            <Field label={`Velocidade ${s.voice.rate > 0 ? "+" : ""}${s.voice.rate}%`}><input type="range" min={L.rate[0]} max={L.rate[1]} value={s.voice.rate} onChange={(e) => set({ voice: { ...s.voice, rate: Number(e.target.value) } })} className="w-full mt-2" /></Field>
            <Field label={`Tom ${s.voice.pitch > 0 ? "+" : ""}${s.voice.pitch} Hz`}><input type="range" min={L.pitch[0]} max={L.pitch[1]} value={s.voice.pitch} onChange={(e) => set({ voice: { ...s.voice, pitch: Number(e.target.value) } })} className="w-full mt-2" /></Field>
            <Field label={`Corte de cena a cada ${s.cutSeconds.toLocaleString("pt-BR")} s`}><input type="range" min={L.cut[0]} max={L.cut[1]} step={0.1} value={s.cutSeconds} onChange={(e) => set({ cutSeconds: Number(e.target.value) })} className="w-full mt-2" /></Field>
            <Field label="Duração alvo (s)"><input type="number" className={fieldCls()} min={L.target[0]} max={L.target[1]} value={s.targetSeconds} onChange={(e) => set({ targetSeconds: Number(e.target.value) })} /></Field>
            <div className="flex flex-col gap-1 text-sm text-gray-200 md:pt-4">
              <label className="flex items-center gap-2"><input type="checkbox" checked={s.music.on} onChange={(e) => set({ music: { ...s.music, on: e.target.checked } })} />Trilha suave</label>
              {s.music.on && <input type="range" aria-label="Volume da trilha" min={0} max={L.volume[1]} step={0.01} value={s.music.volume} onChange={(e) => set({ music: { ...s.music, volume: Number(e.target.value) } })} />}
            </div>
          </div>
        </Card>

        <Card title="Visual" hint="Cores, fontes, legenda e cartão do gancho. O texto do topo e o @ em branco usam o kit de marca.">
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
            {COLORS.map((c) => (
              <label key={c.key} className="text-xs text-gray-400 flex items-center gap-2"><input type="color" value={s.colors[c.key]} onChange={(e) => set({ colors: { ...s.colors, [c.key]: e.target.value.toUpperCase() } })} className="w-9 h-9 rounded bg-transparent border border-gray-700 shrink-0" /><span>{c.label}<span className="block text-[11px] text-gray-500">{s.colors[c.key]}</span></span></label>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2 mt-3">
            <Field label="Fonte dos títulos"><select className={fieldCls()} value={s.fonts.title} onChange={(e) => set({ fonts: { ...s.fonts, title: e.target.value } })}>{Object.entries(REEL_FONTS).map(([f, v]) => <option key={f} value={f}>{v.label}</option>)}</select></Field>
            <Field label="Fonte da legenda e textos"><select className={fieldCls()} value={s.fonts.body} onChange={(e) => set({ fonts: { ...s.fonts, body: e.target.value } })}>{Object.entries(REEL_FONTS).map(([f, v]) => <option key={f} value={f}>{v.label}</option>)}</select></Field>
            <Field label="Texto no topo" hint="em branco = nome do kit"><input className={fieldCls()} value={s.brandText} onChange={(e) => set({ brandText: e.target.value })} maxLength={L.brand} /></Field>
            <Field label="@ embaixo" hint="em branco = @ do kit"><input className={fieldCls()} value={s.handle} onChange={(e) => set({ handle: e.target.value })} maxLength={L.brand} /></Field>
          </div>
          <div className="grid gap-3 md:grid-cols-2 mt-3">
            <fieldset className="border border-gray-800 rounded-lg p-3"><legend className="text-xs text-gray-400 px-1">Legenda</legend>
              <label className="flex items-center gap-2 text-sm text-gray-200"><input type="checkbox" checked={s.caption.upper} onChange={(e) => set({ caption: { ...s.caption, upper: e.target.checked } })} />Caixa alta</label>
              <Field label={`Até ${s.caption.maxWords} palavras por vez`}><input type="range" min={L.maxWords[0]} max={L.maxWords[1]} value={s.caption.maxWords} onChange={(e) => set({ caption: { ...s.caption, maxWords: Number(e.target.value) } })} className="w-full" /></Field>
              <Field label={`Tamanho ${s.caption.size}`}><input type="range" min={L.capSize[0]} max={L.capSize[1]} value={s.caption.size} onChange={(e) => set({ caption: { ...s.caption, size: Number(e.target.value) } })} className="w-full" /></Field>
            </fieldset>
            <fieldset className="border border-gray-800 rounded-lg p-3"><legend className="text-xs text-gray-400 px-1">Cartão do gancho (1º 1,5 s)</legend>
              <label className="flex items-center gap-2 text-sm text-gray-200"><input type="checkbox" checked={s.hook.upper} onChange={(e) => set({ hook: { ...s.hook, upper: e.target.checked } })} />Caixa alta</label>
              <Field label={`Tamanho ${s.hook.size}`}><input type="range" min={L.hookSize[0]} max={L.hookSize[1]} value={s.hook.size} onChange={(e) => set({ hook: { ...s.hook, size: Number(e.target.value) } })} className="w-full" /></Field>
              <Field label="Linha de baixo da chamada final"><input className={fieldCls()} value={s.ctaText} onChange={(e) => set({ ctaText: e.target.value })} maxLength={L.cta} placeholder="e segue o perfil" /></Field>
            </fieldset>
          </div>
        </Card>

        <Card title="Cenas" hint="Peso maior = a categoria aparece mais. Nenhuma = todas as cenas da biblioteca.">
          <div className="flex flex-wrap gap-2" data-testid="padrao-categorias">
            {allCats.map((c) => (
              <label key={c} className={`flex items-center gap-1.5 text-xs pl-2.5 pr-1 py-1 rounded-full border ${weight(c) ? "border-brand-500 bg-brand-500/10 text-gray-100" : "border-gray-700 text-gray-400"}`}>{c}
                <select aria-label={`Peso de ${c}`} className="bg-gray-900 rounded-full text-xs px-1" value={weight(c)} onChange={(e) => setWeight(c, Number(e.target.value))}><option value={0}>fora</option>{[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>peso {w}</option>)}</select>
              </label>
            ))}
            <span className="flex items-center gap-1"><input className={`${fieldCls()} !w-36 !py-1 text-xs`} placeholder="outra categoria" value={newCat} onChange={(e) => setNewCat(e.target.value)} /><button type="button" className={ghostBtn} disabled={!newCat.trim()} onClick={() => { setWeight(newCat.trim().toLowerCase(), 1); setNewCat(""); }}>+</button></span>
          </div>
        </Card>

        <Card title="Roteiro e guia da IA" hint="A IA segue isto quando escreve a partir de um tema ou de um pedido livre.">
          <div className="grid gap-3 md:grid-cols-[1fr_120px]">
            <Field label="Estrutura"><select className={fieldCls()} value={s.structure.kind} onChange={(e) => set({ structure: { ...s.structure, kind: e.target.value as TemplateSettings["structure"]["kind"] } })}>{Object.entries(STRUCTURES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
            <Field label="Pontos no meio"><input type="number" className={fieldCls()} min={L.points[0]} max={L.points[1]} value={s.structure.points} onChange={(e) => set({ structure: { ...s.structure, points: Number(e.target.value) } })} /></Field>
            <Field label="Tom" className="md:col-span-2"><input className={fieldCls()} value={s.ai.tone} onChange={(e) => set({ ai: { ...s.ai, tone: e.target.value } })} maxLength={L.tone} placeholder="direto, provocativo, frases curtas" /></Field>
            <label className="block text-xs text-gray-400 md:col-span-2">Regras<textarea className={fieldCls()} rows={3} value={s.ai.rules} onChange={(e) => set({ ai: { ...s.ai, rules: e.target.value } })} maxLength={L.rules} /></label>
            <Field label="Palavras proibidas" hint="separadas por vírgula; o roteiro com elas é recusado" className="md:col-span-2"><input className={fieldCls()} value={s.ai.forbidden.join(", ")} onChange={(e) => set({ ai: { ...s.ai, forbidden: e.target.value.split(",").map((x) => x.trimStart()) } })} /></Field>
          </div>
        </Card>

        {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
        <div className="flex items-center gap-3"><button type="button" className={primaryBtn} disabled={busy !== "" || name.trim().length < 2} onClick={save} data-testid="padrao-salvar">{busy ? "Salvando…" : "Salvar padrão"}</button></div>
      </div>
    </div>
  );
}
