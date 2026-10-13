"use client";
/* eslint-disable react-hooks/set-state-in-effect -- carga inicial */

import { useCallback, useEffect, useState } from "react";
import { fieldCls, primaryBtn } from "@/components/brand";
import { send } from "@/components/http";
import KeysManager, { type KeyT, type KeysApi } from "./KeysManager";
import { Card, Field, Notice, fmtUsd } from "./shared";

interface OrgState { keys: KeyT[]; chains: Record<string, string[]>; house: Record<string, string[]>; useHouse: boolean; canManage: boolean }
interface AdminState {
  settings: { capUsd: number; confirmAboveUsd: number };
  chains: Record<string, string[]>;
  keys: KeyT[];
  organizations: { _id: string; name: string; active: boolean; capUsd: number | null; useHouse: boolean; aiVisuals: boolean; spentUsd: number }[];
}

// Chaves de IA do cliente e, para o administrador da plataforma (fora do "entrar como"), as
// chaves da casa, o teto padrão e o teto de cada cliente.
export default function KeysTab({ isAdmin }: { isAdmin: boolean }) {
  const [st, setSt] = useState<OrgState | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const r = await send<OrgState>("GET", "/api/estudio/chaves");
    if (r.ok) setSt(r.data);
    else setError(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  const api: KeysApi = {
    save: async (body) => { const r = await send("PUT", "/api/estudio/chaves", body); if (r.ok) await load(); return r; },
    remove: async (service) => { const r = await send("DELETE", `/api/estudio/chaves?service=${service}`); await load(); return r; },
    test: async (service) => { const r = await send<{ ok: boolean; message: string }>("POST", "/api/estudio/chaves/testar", { service }); await load(); return r.ok ? { ok: r.data!.ok, message: r.data!.message } : { ok: false, message: r.error }; },
    order: async (chains) => { const r = await send("PUT", "/api/estudio/chaves", { chains }); await load(); return r; },
  };

  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!st) return <p className="text-sm text-gray-400 py-10 text-center">Carregando…</p>;
  return (
    <div className="space-y-6">
      <KeysManager keys={st.keys} chains={st.chains} canManage={st.canManage} api={api} house={st.house} />
      {isAdmin && <AdminStudio />}
    </div>
  );
}

function AdminStudio() {
  const [st, setSt] = useState<AdminState | null>(null);
  const [cfg, setCfg] = useState({ capUsd: "", confirmAboveUsd: "" });
  const [caps, setCaps] = useState<Record<string, { capUsd: string; useHouse: boolean; aiVisuals: boolean }>>({});
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = (d: AdminState) => {
    setSt(d);
    setCfg({ capUsd: String(d.settings.capUsd), confirmAboveUsd: String(d.settings.confirmAboveUsd) });
    setCaps(Object.fromEntries(d.organizations.map((o) => [o._id, { capUsd: o.capUsd === null ? "" : String(o.capUsd), useHouse: o.useHouse, aiVisuals: o.aiVisuals }])));
  };
  const put = async (body: Record<string, unknown>) => {
    const r = await send<AdminState & { test?: { ok: boolean; message: string } }>("PUT", "/api/admin/estudio", body);
    if (r.ok) apply(r.data!);
    return r;
  };
  useEffect(() => { send<AdminState>("GET", "/api/admin/estudio").then((r) => r.ok && apply(r.data!)); }, []);
  if (!st) return null;

  const api: KeysApi = {
    save: (body) => put({ acao: "chave", ...body }),
    remove: (service) => put({ acao: "apagar_chave", service }),
    test: async (service) => { const r = await put({ acao: "testar", service }); return r.ok && r.data?.test ? r.data.test : { ok: false, message: r.error }; },
    order: (chains) => put({ acao: "config", chains }),
  };
  const num = (v: string) => Number(v.replace(",", "."));
  async function saveAll(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    let r = await put({ acao: "config", capUsd: num(cfg.capUsd), confirmAboveUsd: num(cfg.confirmAboveUsd) });
    for (const o of st!.organizations) {
      if (!r.ok) break;
      const c = caps[o._id];
      const cap = c.capUsd.trim() === "" ? null : num(c.capUsd);
      if (cap !== o.capUsd || c.useHouse !== o.useHouse || c.aiVisuals !== o.aiVisuals) r = await put({ acao: "cliente", organization: o._id, capUsd: cap, useHouse: c.useHouse, aiVisuals: c.aiVisuals });
    }
    setBusy(false);
    setMsg(r.ok ? { tone: "ok", text: "Tetos salvos." } : { tone: "bad", text: r.error });
  }

  return (
    <div className="space-y-4 border-t border-gray-800 pt-5" data-testid="estudio-admin">
      <div>
        <h3 className="text-base font-bold text-gray-100">Plataforma</h3>
        <p className="text-xs text-gray-500">Só o administrador vê esta parte.</p>
      </div>
      <KeysManager keys={st.keys} chains={st.chains} canManage api={api} houseScope />
      <Card title="Tetos de gasto com IA" hint="O teto é mensal, em dólar. Ao atingir, novas gerações com IA ficam bloqueadas até o mês virar.">
        <form onSubmit={saveAll} className="space-y-3">
          <div className="grid gap-3 grid-cols-2 md:max-w-md">
            <Field label="Teto padrão por cliente (US$)"><input className={fieldCls()} inputMode="decimal" value={cfg.capUsd} onChange={(e) => setCfg({ ...cfg, capUsd: e.target.value })} /></Field>
            <Field label="Pedir confirmação acima de (US$)"><input className={fieldCls()} inputMode="decimal" value={cfg.confirmAboveUsd} onChange={(e) => setCfg({ ...cfg, confirmAboveUsd: e.target.value })} /></Field>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead><tr className="text-left text-xs text-gray-500"><th className="py-1.5 font-normal">Cliente</th><th className="font-normal">Gasto no mês</th><th className="font-normal">Teto próprio (US$)</th><th className="font-normal">Usa chave da casa</th><th className="font-normal" title="Em setor regulado, imagem e vídeo de IA ficam desligados até liberar aqui">IA visual em setor regulado</th></tr></thead>
              <tbody className="divide-y divide-gray-800">
                {st.organizations.map((o) => (
                  <tr key={o._id}>
                    <td className="py-1.5 pr-2 text-gray-100 truncate max-w-[180px]" title={o.name}>{o.name}{!o.active && <span className="text-gray-500"> (inativo)</span>}</td>
                    <td className="text-gray-300 whitespace-nowrap">{fmtUsd(o.spentUsd)}</td>
                    <td><input className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-gray-100" inputMode="decimal" placeholder={`padrão ${cfg.capUsd}`} value={caps[o._id]?.capUsd ?? ""} onChange={(e) => setCaps({ ...caps, [o._id]: { ...caps[o._id], capUsd: e.target.value } })} aria-label={`Teto de ${o.name}`} /></td>
                    <td><input type="checkbox" checked={caps[o._id]?.useHouse ?? true} onChange={(e) => setCaps({ ...caps, [o._id]: { ...caps[o._id], useHouse: e.target.checked } })} aria-label={`${o.name} usa a chave da casa`} /></td>
                    <td><input type="checkbox" checked={caps[o._id]?.aiVisuals ?? false} onChange={(e) => setCaps({ ...caps, [o._id]: { ...caps[o._id], aiVisuals: e.target.checked } })} aria-label={`${o.name}: liberar IA visual`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
          <button type="submit" className={primaryBtn} disabled={busy}>{busy ? "Salvando…" : "Salvar tetos"}</button>
        </form>
      </Card>
    </div>
  );
}
