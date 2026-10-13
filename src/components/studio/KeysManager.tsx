"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, CircleAlert, KeyRound, Plus } from "lucide-react";
import { fieldCls, ghostBtn, primaryBtn } from "@/components/brand";
import { type Result, fmtWhen } from "@/components/http";
import { PRICES_CHECKED, PURPOSES, PURPOSE_KEYS, type ModelSpec, type Purpose, SERVICES } from "@/lib/studio/catalog";
import { Card, Field, Notice, linkBtn } from "./shared";

export interface KeyT { service: string; active: boolean; hasKey: boolean; purposes: string[]; models: Record<string, string>; extra: Record<string, string>; lastTest: { at: string; ok: boolean; message: string } | null }
export interface KeysApi {
  save: (body: Record<string, unknown>) => Promise<Result<unknown>>;
  remove: (service: string) => Promise<Result<unknown>>;
  test: (service: string) => Promise<{ ok: boolean; message: string }>;
  order: (chains: Record<string, string[]>) => Promise<Result<unknown>>;
}

export const priceText = (p: Purpose, m: ModelSpec) =>
  p === "texto" ? `US$ ${m.price.in} / ${m.price.out} por 1M tokens` : p === "voz" ? `US$ ${m.price.kchars} por 1.000 caracteres` : p === "imagem" ? `US$ ${m.price.image} por imagem` : p === "video" ? `US$ ${m.price.second} por segundo` : "";

interface Form { service: string; apiKey: string; purposes: string[]; models: Record<string, string>; extra: Record<string, string>; active: boolean; isNew: boolean }

// Chaves de IA: lista (1 linha por provedor), ordem de preferência por finalidade e um formulário
// só, com UM botão Salvar. A chave nunca volta do servidor: o campo fica vazio na edição.
export default function KeysManager({ keys, chains, canManage, api, house, houseScope }: { keys: KeyT[]; chains: Record<string, string[]>; canManage: boolean; api: KeysApi; house?: Record<string, string[]>; houseScope?: boolean }) {
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<{ msg: string; field?: string } | null>(null);
  const [tests, setTests] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [removing, setRemoving] = useState("");

  const free = Object.keys(SERVICES).filter((s) => !keys.some((k) => k.service === s));
  const open = (service: string, isNew: boolean) => {
    const k = keys.find((x) => x.service === service);
    setError(null);
    setForm({ service, apiKey: "", purposes: k?.purposes ?? Object.keys(SERVICES[service]?.purposes || {}), models: { ...(k?.models || {}) }, extra: { ...(k?.extra || {}) }, active: k?.active ?? true, isNew });
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy("save");
    const r = await api.save({ service: form.service, apiKey: form.apiKey || undefined, purposes: form.purposes, models: form.models, extra: form.extra, active: form.active });
    setBusy("");
    if (!r.ok) return setError({ msg: r.error, field: r.field });
    setForm(null);
  }
  async function test(service: string) {
    setBusy(`test:${service}`);
    const r = await api.test(service);
    setTests((t) => ({ ...t, [service]: r }));
    setBusy("");
  }
  /** Ordem efetiva de uma finalidade: a escolhida, depois as demais chaves que servem. */
  const chainOf = (p: Purpose) => {
    const able = keys.filter((k) => k.active && k.hasKey && k.purposes.includes(p)).map((k) => k.service);
    return [...(chains[p] || []).filter((s) => able.includes(s)), ...able.filter((s) => !(chains[p] || []).includes(s))];
  };
  async function move(p: Purpose, i: number, d: number) {
    const list = chainOf(p);
    [list[i], list[i + d]] = [list[i + d], list[i]];
    setBusy(`order:${p}`);
    await api.order({ ...Object.fromEntries(PURPOSE_KEYS.map((x) => [x, chainOf(x)])), [p]: list });
    setBusy("");
  }
  const spec = form ? SERVICES[form.service] : null;

  return (
    <div className="space-y-4">
      {/* sem nenhuma chave (nem da casa) não há ordem a mostrar: a tela vai direto ao cadastro */}
      <div className={`grid gap-3 md:grid-cols-2 ${keys.length === 0 && !Object.values(house || {}).some((l) => l.length) ? "hidden" : ""}`}>
        {PURPOSE_KEYS.filter((p) => p !== "musica").map((p) => {
          const list = chainOf(p);
          const fromHouse = !houseScope && list.length === 0 ? house?.[p] || [] : [];
          return (
            <Card key={p} title={`${PURPOSES[p].label}: ordem de tentativa`} hint={PURPOSES[p].hint}>
              {list.length === 0 && (
                <p className="text-xs text-gray-500" data-testid={`cadeia-vazia-${p}`}>
                  {fromHouse.length ? `Sem chave sua: usa a chave da casa (${fromHouse.map((s) => SERVICES[s].label).join(", ")}). O custo entra no seu uso.` : "Nenhuma chave cadastrada para isto."}
                </p>
              )}
              <ol className="space-y-1.5">
                {list.map((s, i) => {
                  const k = keys.find((x) => x.service === s)!;
                  const m = SERVICES[s].purposes[p]!.find((x) => x.id === k.models[p]) || SERVICES[s].purposes[p]![0];
                  return (
                    <li key={s} className="flex items-center gap-2 text-sm bg-gray-800/60 rounded-lg px-2.5 py-1.5">
                      <span className="text-[11px] font-bold text-brand-400 w-5 shrink-0">{i + 1}º</span>
                      <span className="text-gray-100 shrink-0">{SERVICES[s].label}</span>
                      <span className="text-xs text-gray-500 truncate flex-1" title={`${m.label} · ${priceText(p, m)}`}>{m.label} · {priceText(p, m)}</span>
                      {canManage && list.length > 1 && (
                        <span className="flex shrink-0">
                          <button type="button" disabled={i === 0 || busy !== ""} onClick={() => move(p, i, -1)} aria-label={`Subir ${SERVICES[s].label}`} className="p-1 text-gray-400 hover:text-white disabled:opacity-30"><ArrowUp size={14} /></button>
                          <button type="button" disabled={i === list.length - 1 || busy !== ""} onClick={() => move(p, i, 1)} aria-label={`Descer ${SERVICES[s].label}`} className="p-1 text-gray-400 hover:text-white disabled:opacity-30"><ArrowDown size={14} /></button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
              {list.length > 1 && <p className="text-[11px] text-gray-500 mt-2">Se o 1º falhar, demorar ou estiver sem saldo, o sistema tenta o próximo e registra quem respondeu.</p>}
            </Card>
          );
        })}
      </div>

      <Card
        title={houseScope ? "Chaves da casa" : "Suas chaves"}
        hint={houseScope ? "Usadas quando o cliente não tem a própria. O custo é contabilizado para o cliente." : "Cada chave fica criptografada e nunca volta para a tela."}
        right={canManage && !form && free.length > 0 ? <button type="button" className={primaryBtn} onClick={() => open(free[0], true)} data-testid="nova-chave"><Plus size={14} className="inline -mt-0.5 mr-1" />Adicionar chave</button> : undefined}
      >
        {keys.length === 0 && !form && (
          <div className="text-center py-8 text-gray-500">
            <KeyRound size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhuma chave de IA cadastrada.</p>
            <p className="text-xs mt-1">{houseScope ? "Sem chave da casa, cada cliente precisa da própria." : "Sem chave, o Estúdio segue funcionando com roteiro escrito à mão e Reel sem voz."}</p>
          </div>
        )}
        <ul className="divide-y divide-gray-800">
          {keys.map((k) => {
            const t = tests[k.service] || (k.lastTest ? { ok: k.lastTest.ok, message: k.lastTest.message } : null);
            return (
              <li key={k.service} className="py-2.5 flex items-center gap-2 text-sm" data-testid={`chave-${k.service}`}>
                <span className="text-gray-100 font-medium shrink-0">{SERVICES[k.service].label}</span>
                <span className="text-xs text-gray-500 truncate flex-1" title={k.purposes.map((p) => PURPOSES[p as Purpose].label).join(", ")}>{k.purposes.map((p) => PURPOSES[p as Purpose].label).join(", ")}{!k.active && " · desligada"}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 max-w-[45%] truncate ${!t ? "bg-gray-700/50 text-gray-400" : t.ok ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"}`} title={t?.message || "Clique em Testar para conferir a chave no provedor"}>
                  {!t ? "não testada" : t.ok ? <><Check size={11} className="inline -mt-0.5" /> {tests[k.service] ? t.message : `ok ${fmtWhen(k.lastTest?.at)}`}</> : <><CircleAlert size={11} className="inline -mt-0.5" /> {t.message}</>}
                </span>
                {canManage && (
                  <span className="flex gap-1.5 shrink-0">
                    <button type="button" className={ghostBtn} disabled={busy !== ""} onClick={() => test(k.service)} title={SERVICES[k.service].freeTest ? "Consulta de leitura ao provedor: não gera nada" : "Este provedor não tem consulta de teste"}>{busy === `test:${k.service}` ? "Testando…" : "Testar"}</button>
                    <button type="button" className={ghostBtn} onClick={() => open(k.service, false)}>Editar</button>
                    {removing === k.service ? (
                      <button type="button" className={`${ghostBtn} !border-red-500/50 !text-red-300`} onClick={async () => { setRemoving(""); await api.remove(k.service); }}>Confirmar</button>
                    ) : (
                      <button type="button" className={ghostBtn} onClick={() => setRemoving(k.service)}>Remover</button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {!canManage && <p className="text-xs text-gray-500 mt-2">Só o dono da conta cadastra e testa chaves.</p>}

        {form && spec && (
          <form onSubmit={submit} className="mt-3 border border-brand-500/30 rounded-xl p-4 space-y-3 bg-gray-800/40" data-testid="form-chave">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Provedor" hint={`chave em ${spec.site}`}>
                <select className={fieldCls()} value={form.service} disabled={!form.isNew} onChange={(e) => open(e.target.value, true)}>
                  {(form.isNew ? free : [form.service]).map((s) => <option key={s} value={s}>{SERVICES[s].label}</option>)}
                </select>
              </Field>
              <Field label="Chave da API" error={error?.field === "apiKey" ? error.msg : ""} hint={form.isNew ? "" : "em branco = manter a atual"}>
                <input className={fieldCls(error?.field === "apiKey")} type="password" autoComplete="off" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={form.isNew ? "Cole a chave aqui" : "•••••••• (guardada)"} data-testid="campo-chave" />
              </Field>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Para que serve {error?.field === "purposes" && <span className="text-red-400">· {error.msg}</span>}</p>
              <div className="space-y-1.5">
                {(Object.keys(spec.purposes) as Purpose[]).map((p) => (
                  <div key={p} className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-2 text-sm text-gray-200 w-24 shrink-0">
                      <input type="checkbox" checked={form.purposes.includes(p)} onChange={(e) => setForm({ ...form, purposes: e.target.checked ? [...form.purposes, p] : form.purposes.filter((x) => x !== p) })} />
                      {PURPOSES[p].label}
                    </label>
                    <select className="flex-1 min-w-[200px] bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 disabled:opacity-40" disabled={!form.purposes.includes(p)} value={form.models[p] || spec.purposes[p]![0].id} onChange={(e) => setForm({ ...form, models: { ...form.models, [p]: e.target.value } })} aria-label={`Modelo de ${PURPOSES[p].label}`}>
                      {spec.purposes[p]!.map((m) => <option key={m.id} value={m.id}>{m.label} · {priceText(p, m)}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5">Preços lidos na página oficial em {PRICES_CHECKED}. Como se paga: {spec.pay}. O custo mostrado no sistema é estimado.</p>
            </div>
            {(spec.extra || []).map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint} error={error?.field === f.key ? error.msg : ""}>
                <input className={fieldCls(error?.field === f.key)} value={form.extra[f.key] || ""} onChange={(e) => setForm({ ...form, extra: { ...form.extra, [f.key]: e.target.value } })} />
              </Field>
            ))}
            <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Chave ligada</label>
            {error && !["apiKey", "purposes", ...(spec.extra || []).map((f) => f.key)].includes(error.field || "") && <Notice tone="bad">{error.msg}</Notice>}
            <div className="flex items-center gap-3">
              <button type="submit" className={primaryBtn} disabled={busy === "save"} data-testid="salvar-chave">{busy === "save" ? "Salvando…" : "Salvar"}</button>
              <button type="button" className={linkBtn} onClick={() => setForm(null)}>Cancelar</button>
              <span className="text-[11px] text-gray-500">Salvar não testa: clique em Testar depois.</span>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
