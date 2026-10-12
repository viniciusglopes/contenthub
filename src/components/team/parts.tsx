"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { type BrandInfo, fieldCls } from "@/components/brand";
import { INVITE_LABEL, type PendingInvite, ROLE_LABEL, type TeamUser, fmtWhen } from "@/components/http";

/** Caixa com o link recém-gerado. O link só aparece aqui: depois de fechar, é gerar outro. */
export function LinkBox({ link, title, onClose }: { link: string; title: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* sem permissão: a pessoa copia na mão */ }
  }
  return (
    <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-3" role="status" data-testid="link-box">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-green-300 font-semibold">{title}</p>
        <button type="button" onClick={onClose} className="p-1 -m-1 text-gray-400 hover:text-white" aria-label="Fechar"><X size={16} /></button>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-xs font-mono text-gray-200" aria-label="Link" />
        <button type="button" onClick={copy} className="shrink-0 inline-flex items-center gap-1.5 bg-brand-500 text-brand-ink font-bold px-3 py-2 rounded-lg text-xs hover:bg-brand-400 transition">
          {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar link</>}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-2">Vale 7 dias e só pode ser usado uma vez. Guarde agora: por segurança ele não aparece de novo.</p>
    </div>
  );
}

/** Usuários: uma linha por pessoa. */
export function UserRows({
  users,
  meId,
  busyId,
  onReset,
  onToggle,
}: {
  users: TeamUser[];
  meId?: string;
  busyId?: string;
  onReset: (u: TeamUser) => void;
  onToggle?: (u: TeamUser) => void;
}) {
  if (users.length === 0) return <p className="text-sm text-gray-500 py-3">Ninguém ainda. O primeiro acesso nasce de um convite.</p>;
  const btn = "text-xs px-2 py-1 rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-700 transition disabled:opacity-50 whitespace-nowrap";
  return (
    <ul className="divide-y divide-gray-800 border border-gray-800 rounded-xl overflow-hidden" data-testid="user-rows">
      {users.map((u) => (
        <li key={u._id} className={`flex items-center gap-3 px-3 py-2.5 bg-gray-900 ${u.active ? "" : "opacity-60"}`}>
          <div className="min-w-0 flex-1 flex items-baseline gap-2">
            <span className="text-sm text-gray-100 font-medium truncate sm:shrink-0 sm:max-w-[45%]" title={`${u.name} · ${u.email}`}>{u.name}{u._id === meId ? " (você)" : ""}</span>
            <span className="hidden sm:inline text-xs text-gray-500 truncate" title={u.email}>{u.email}</span>
          </div>
          <span className="hidden md:inline text-xs text-gray-500 whitespace-nowrap" title="Último acesso">{fmtWhen(u.lastLoginAt, "nunca entrou")}</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${u.active ? "bg-gray-800 text-gray-300" : "bg-gray-800 text-gray-500"}`}>
            {u.active ? ROLE_LABEL[u.role] || u.role : "Desativado"}
          </span>
          <button type="button" className={btn} disabled={busyId === u._id} onClick={() => onReset(u)} title={`Gerar link de nova senha para ${u.name}`}>Nova senha</button>
          {onToggle && u._id !== meId && u.role !== "platform_admin" && (
            <button type="button" className={`${btn} hidden sm:inline`} disabled={busyId === u._id} onClick={() => onToggle(u)}>{u.active ? "Desativar" : "Ativar"}</button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function InviteRows({ invites, onCancel }: { invites: PendingInvite[]; onCancel: (i: PendingInvite) => void }) {
  if (invites.length === 0) return null;
  return (
    <ul className="divide-y divide-gray-800 border border-gray-800 rounded-xl overflow-hidden" data-testid="invite-rows">
      {invites.map((i) => (
        <li key={i._id} className="flex items-center gap-3 px-3 py-2 bg-gray-900">
          <span className="text-sm text-gray-200 truncate flex-1 min-w-0" title={i.email || "Sem e-mail definido"}>
            <span className={i.email ? "hidden sm:inline" : ""}>{INVITE_LABEL[i.kind] || i.kind}</span>
            <span className={i.email ? "text-gray-300 sm:text-gray-500" : "text-gray-500"}><span className={i.email ? "hidden sm:inline" : ""}> · </span>{i.email || i.name || "quem abrir o link"}</span>
          </span>
          <span className="text-xs text-gray-500 whitespace-nowrap">vence {fmtWhen(i.expiresAt).slice(0, 5)}</span>
          <button type="button" onClick={() => onCancel(i)} className="text-xs text-gray-400 hover:text-red-400 underline underline-offset-2 whitespace-nowrap">Cancelar</button>
        </li>
      ))}
    </ul>
  );
}

export interface BrandForm {
  displayName: string;
  color: string;
  logo: string;
}

/** Campos da marca (nome exibido, cor, logo). Sem botão próprio: quem usa tem UM Salvar. */
export function BrandFields({ value, onChange, error }: { value: BrandForm; onChange: (v: BrandForm) => void; error?: { msg: string; field?: string } | null }) {
  const [fileError, setFileError] = useState("");
  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFileError("");
    if (!file) return;
    if (file.size > 150_000) return setFileError("Imagem grande demais: use uma de até 150 KB.");
    const reader = new FileReader();
    reader.onload = () => onChange({ ...value, logo: String(reader.result || "") });
    reader.readAsDataURL(file);
  }
  const embedded = value.logo.startsWith("data:");
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label htmlFor="brand-name" className="text-xs text-gray-400">Nome exibido no menu e na entrada</label>
        <input id="brand-name" value={value.displayName} maxLength={40} placeholder="ContentHub" onChange={(e) => onChange({ ...value, displayName: e.target.value })} className={fieldCls()} />
      </div>
      <div>
        <label htmlFor="brand-color" className="text-xs text-gray-400">Cor de destaque</label>
        <div className="flex items-center gap-2 mt-1">
          <input id="brand-color" type="color" value={value.color || "#eab308"} onChange={(e) => onChange({ ...value, color: e.target.value })} className="h-10 w-14 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer shrink-0" />
          <span className="text-xs text-gray-400 font-mono">{value.color || "padrão"}</span>
          {value.color && <button type="button" onClick={() => onChange({ ...value, color: "" })} className="text-xs text-gray-400 hover:text-gray-200 underline underline-offset-2">usar a padrão</button>}
        </div>
        {error?.field === "color" && <p className="text-xs text-red-400 mt-1" role="alert">{error.msg}</p>}
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="brand-logo" className="text-xs text-gray-400">Logo (endereço https ou arquivo de até 150 KB)</label>
        <div className="flex items-center gap-2 mt-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- prévia do logo do cliente */}
          {value.logo && <img src={value.logo} alt="" className="h-10 w-10 object-contain rounded bg-gray-800 border border-gray-700 shrink-0" />}
          <input id="brand-logo" value={embedded ? "" : value.logo} placeholder={embedded ? "Imagem enviada" : "https://..."} onChange={(e) => onChange({ ...value, logo: e.target.value.trim() })} className={`${fieldCls(error?.field === "logo")} !mt-0 min-w-0`} />
          <label className="shrink-0 text-xs px-2.5 py-2.5 rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-700 transition cursor-pointer whitespace-nowrap">
            Enviar
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={pickFile} />
          </label>
          {value.logo && <button type="button" onClick={() => onChange({ ...value, logo: "" })} className="text-xs text-gray-400 hover:text-gray-200 underline underline-offset-2 shrink-0">tirar</button>}
        </div>
        {(fileError || error?.field === "logo") && <p className="text-xs text-red-400 mt-1" role="alert">{fileError || error?.msg}</p>}
      </div>
    </div>
  );
}

export const toBrandForm = (raw: Partial<BrandInfo> | null | undefined): BrandForm => ({
  displayName: raw?.displayName || "",
  color: raw?.color || "",
  logo: raw?.logo || "",
});
