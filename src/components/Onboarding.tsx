"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { fieldCls, primaryBtn } from "@/components/brand";
import { send } from "@/components/http";
import { InstagramConnectForm } from "@/components/instagram/InstagramAccounts";
import type { PublicAccount } from "@/components/instagram/shared";

interface ProjectOpt {
  _id: string;
  name: string;
  icon?: string;
}

// Primeira experiência do cliente: três passos curtos, um de cada vez.
// crie seu projeto -> conecte o Instagram -> sincronize.
export default function Onboarding({
  projects,
  accounts,
  igOauth,
  isAdmin,
  brandName,
  onProjectCreated,
  onAccountsChanged,
  onFinish,
  onDismiss,
}: {
  projects: ProjectOpt[];
  accounts: PublicAccount[];
  igOauth: boolean;
  isAdmin: boolean;
  brandName: string;
  onProjectCreated: () => void;
  onAccountsChanged: () => void;
  onFinish: (projectId: string) => void;
  onDismiss: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [syncMsg, setSyncMsg] = useState("");

  const connected = accounts.find((a) => a.platform === "instagram" && a.connected);
  const synced = Boolean(connected?.lastSync);
  const step = projects.length === 0 ? 1 : !connected ? 2 : 3;
  const connectedProject = connected ? (typeof connected.project === "string" ? connected.project : connected.project?._id) : "";

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await send("POST", "/api/projects", { name, platforms: ["instagram"] });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onProjectCreated();
  }

  async function sync() {
    if (!connected) return;
    setBusy(true);
    setError("");
    setSyncMsg("Buscando os seus posts e números no Instagram. Pode levar um minuto...");
    const r = await send<{ results: { ok: boolean; media: number; error?: string }[] }>("POST", "/api/instagram/sync", { account: connected._id });
    setBusy(false);
    const res = r.data?.results?.[0];
    if (r.ok && res?.ok) {
      setSyncMsg(`Pronto: ${res.media} posts trazidos.`);
      onAccountsChanged();
    } else {
      setSyncMsg("");
      setError(res?.error || r.error || "Não foi possível sincronizar agora.");
    }
  }

  const steps = [
    { n: 1, title: "Crie seu projeto", done: projects.length > 0, summary: projects[0]?.name },
    { n: 2, title: "Conecte o Instagram", done: Boolean(connected), summary: connected ? `@${connected.username}` : "" },
    { n: 3, title: "Sincronize", done: synced, summary: synced ? "Dados atualizados" : "" },
  ];

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 md:p-6 max-w-2xl mx-auto w-full" data-testid="onboarding" aria-label="Primeiros passos">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-white">Bem-vindo ao {brandName}</h2>
          <p className="text-sm text-gray-400 mt-1">Três passos e os números do seu Instagram aparecem aqui.</p>
        </div>
        {step > 1 && (
          <button type="button" onClick={onDismiss} className="p-1 -m-1 text-gray-400 hover:text-white shrink-0" aria-label="Fechar os primeiros passos" title="Fechar (dá para conectar depois em Configurações)"><X size={18} /></button>
        )}
      </div>

      <ol className="mt-4 space-y-2">
        {steps.map((s) => {
          const current = s.n === step && !(s.n === 3 && synced);
          return (
            <li key={s.n} className={`rounded-xl border ${current ? "border-brand-500/50 bg-gray-800/40" : "border-gray-800"} p-3`} aria-current={current ? "step" : undefined}>
              <div className="flex items-center gap-3">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${s.done ? "bg-green-500/20 text-green-400" : current ? "bg-brand-500 text-brand-ink" : "bg-gray-800 text-gray-500"}`}>
                  {s.done ? <Check size={15} /> : s.n}
                </span>
                <span className={`text-sm font-semibold ${s.done || current ? "text-white" : "text-gray-500"}`}>{s.title}</span>
                {s.done && s.summary && <span className="text-xs text-gray-400 truncate ml-auto" title={s.summary}>{s.summary}</span>}
              </div>

              {current && s.n === 1 && (
                <form onSubmit={createProject} className="mt-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 sm:items-end">
                  <div>
                    <label htmlFor="ob-name" className="text-xs text-gray-400">Nome do projeto (a marca ou o perfil que você cuida)</label>
                    <input id="ob-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex.: Clínica Bem Viver" className={fieldCls(Boolean(error))} />
                  </div>
                  <button type="submit" disabled={busy || name.trim().length < 2} className={primaryBtn}>{busy ? "Criando..." : "Criar projeto"}</button>
                  {error && <p className="text-xs text-red-400 sm:col-span-2" role="alert">{error}</p>}
                </form>
              )}

              {current && s.n === 2 && (
                <div className="mt-3">
                  <InstagramConnectForm projects={projects} defaultProject={projects[0]?._id} oauth={igOauth} isAdmin={isAdmin} bare onDone={onAccountsChanged} />
                </div>
              )}

              {current && s.n === 3 && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={sync} disabled={busy} className={primaryBtn}>{busy ? "Sincronizando..." : "Sincronizar agora"}</button>
                  {syncMsg && <p className="text-xs text-gray-400" role="status">{syncMsg}</p>}
                  {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {synced && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => onFinish(connectedProject || projects[0]?._id || "")} className={primaryBtn}>Ver meus números</button>
          {syncMsg && <p className="text-xs text-green-400" role="status">{syncMsg} Depois disso a atualização é diária e automática.</p>}
        </div>
      )}
    </section>
  );
}
