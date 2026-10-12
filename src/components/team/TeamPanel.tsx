"use client";
/* eslint-disable react-hooks/set-state-in-effect -- dados carregados ao abrir */

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { type BrandInfo, fieldCls, primaryBtn } from "@/components/brand";
import { type PendingInvite, ROLE_LABEL, type TeamUser, send } from "@/components/http";
import { type BrandForm, BrandFields, InviteRows, LinkBox, UserRows, toBrandForm } from "./parts";

export interface Me {
  user: { _id: string; name: string; email: string; role: string };
  organization: { _id: string; name: string; slug: string };
  brand: BrandInfo;
  vars: Record<string, string>;
  isAdmin: boolean;
  canManage: boolean;
  impersonating: boolean;
  features: { igOauth: boolean; demo: boolean };
  publishing?: { global: boolean; org: boolean; on: boolean; message: string };
}
type Err = { msg: string; field?: string } | null;

// Minha conta (todos) + Equipe e Marca (dono). Cada formulário tem um Salvar só.
export default function TeamPanel({ me, onChanged }: { me: Me; onChanged: () => void }) {
  return (
    <div className="flex-1 overflow-auto" data-testid="team-panel">
      <div className="max-w-3xl mx-auto p-3 md:p-6 space-y-4">
        <Account me={me} onChanged={onChanged} />
        {me.canManage && <Team me={me} />}
        {me.canManage && <BrandSection onChanged={onChanged} />}
      </div>
    </div>
  );
}

const card = "bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3";

function Account({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const [name, setName] = useState(me.user.name);
  const [changing, setChanging] = useState(false);
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Err>(null);
  const [saved, setSaved] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved("");
    const r = await send<{ passwordChanged: boolean }>("PUT", "/api/me", { name, ...(changing && newPassword ? { currentPassword, newPassword } : {}) });
    setBusy(false);
    if (!r.ok) return setError({ msg: r.error, field: r.field });
    setSaved(r.data?.passwordChanged ? "Salvo. A senha nova já vale; os outros aparelhos foram desconectados." : "Salvo.");
    setChanging(false);
    setCurrent("");
    setNew("");
    onChanged();
  }
  const err = (f: string) => (error?.field === f ? <p className="text-xs text-red-400 mt-1" role="alert">{error.msg}</p> : null);

  return (
    <form onSubmit={save} className={card} data-testid="account-form">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-bold text-white">Minha conta</h3>
        <span className="text-xs text-gray-500 truncate">{ROLE_LABEL[me.user.role]} em {me.organization.name}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="acc-name" className="text-xs text-gray-400">Nome</label>
          <input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} className={fieldCls(error?.field === "name")} />
          {err("name")}
        </div>
        <div>
          <label htmlFor="acc-email" className="text-xs text-gray-400">E-mail (login)</label>
          <input id="acc-email" value={me.user.email} readOnly className={`${fieldCls()} opacity-70`} />
        </div>
      </div>
      <button type="button" onClick={() => setChanging(!changing)} className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1" aria-expanded={changing}>
        {changing ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Trocar a senha
      </button>
      {changing && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="acc-cur" className="text-xs text-gray-400">Senha atual</label>
            <input id="acc-cur" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} className={fieldCls(error?.field === "currentPassword")} />
            {err("currentPassword")}
          </div>
          <div>
            <label htmlFor="acc-new" className="text-xs text-gray-400">Senha nova (10 ou mais, letras e números)</label>
            <input id="acc-new" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} className={fieldCls(error?.field === "newPassword")} />
            {err("newPassword")}
          </div>
        </div>
      )}
      {error && !error.field && <p className="text-xs text-red-400" role="alert">{error.msg}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy || name.trim().length < 2} className={primaryBtn}>{busy ? "Salvando..." : "Salvar"}</button>
        {saved && <span className="text-xs text-green-400" role="status">{saved}</span>}
      </div>
    </form>
  );
}

function Team({ me }: { me: Me }) {
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<Err>(null);
  const [link, setLink] = useState<{ link: string; title: string } | null>(null);

  const load = useCallback(async () => {
    const r = await send<{ users: TeamUser[]; invites: PendingInvite[] }>("GET", "/api/team");
    if (r.ok && r.data) {
      setUsers(r.data.users);
      setInvites(r.data.invites);
    } else setError({ msg: r.error });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function invite(body: Record<string, unknown>, title: string, key: string) {
    setBusy(key);
    setError(null);
    const r = await send<{ link: string }>("POST", "/api/invites", body);
    setBusy("");
    if (!r.ok || !r.data) return setError({ msg: r.error, field: r.field });
    setLink({ link: r.data.link, title });
    setEmail("");
    load();
  }
  async function toggle(u: TeamUser) {
    setBusy(u._id);
    const r = await send("PUT", `/api/team/${u._id}`, { active: !u.active });
    setBusy("");
    if (!r.ok) setError({ msg: r.error });
    load();
  }

  return (
    <section className={card} data-testid="team-section">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-bold text-white">Equipe</h3>
        <span className="text-xs text-gray-500">{users ? `${users.filter((u) => u.active).length} com acesso` : ""}</span>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); invite({ kind: "member", email: email || undefined }, "Convite pronto. Envie este link para a pessoa:", "novo"); }} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 sm:items-end">
        <div>
          <label htmlFor="team-email" className="text-xs text-gray-400">Convidar alguém da equipe (e-mail opcional)</label>
          <input id="team-email" type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com.br" className={fieldCls(error?.field === "email")} />
        </div>
        <button type="submit" disabled={busy === "novo"} className={primaryBtn}>{busy === "novo" ? "Gerando..." : "Gerar link de convite"}</button>
      </form>
      {error && <p className="text-xs text-red-400" role="alert">{error.msg}</p>}
      {link && <LinkBox link={link.link} title={link.title} onClose={() => setLink(null)} />}
      {users === null ? <p className="text-sm text-gray-400">Carregando...</p> : (
        <UserRows users={users} meId={me.user._id} busyId={busy} onToggle={toggle} onReset={(u) => invite({ kind: "reset", user: u._id }, `Link de nova senha para ${u.name}:`, u._id)} />
      )}
      <InviteRows invites={invites} onCancel={async (i) => { await send("DELETE", `/api/invites/${i._id}`); load(); }} />
    </section>
  );
}

function BrandSection({ onChanged }: { onChanged: () => void }) {
  const [form, setForm] = useState<BrandForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Err>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    send<{ rawBrand: Partial<BrandInfo> }>("GET", "/api/organization").then((r) => setForm(toBrandForm(r.data?.rawBrand)));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    const r = await send("PUT", "/api/organization", form);
    setBusy(false);
    if (!r.ok) return setError({ msg: r.error, field: r.field });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    onChanged();
  }

  return (
    <form onSubmit={save} className={card} data-testid="brand-form">
      <h3 className="font-bold text-white">Marca</h3>
      <p className="text-xs text-gray-400 -mt-1">O nome, o logo e a cor aparecem no menu e na tela de entrada da sua equipe.</p>
      {form ? <BrandFields value={form} onChange={setForm} error={error} /> : <p className="text-sm text-gray-400">Carregando...</p>}
      {error && !error.field && <p className="text-xs text-red-400" role="alert">{error.msg}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy || !form} className={primaryBtn}>{busy ? "Salvando..." : "Salvar marca"}</button>
        {saved && <span className="text-xs text-green-400" role="status">Marca atualizada.</span>}
      </div>
    </form>
  );
}
