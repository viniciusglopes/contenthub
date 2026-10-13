"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { Result } from "@/components/http";

export const fmtUsd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: v > 0 && v < 0.1 ? 4 : 2 })}`;
export const fmtBrl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Field({ label, error, hint, children, className = "" }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block text-xs text-gray-400 ${className}`}>
      <span className="flex items-baseline justify-between gap-2"><span>{label}</span>{hint && <span className="text-[11px] text-gray-500 truncate">{hint}</span>}</span>
      {children}
      {error && <span className="block text-xs text-red-400 mt-1">{error}</span>}
    </label>
  );
}

export function Notice({ tone = "info", children, onClose }: { tone?: "info" | "ok" | "warn" | "bad"; children: ReactNode; onClose?: () => void }) {
  const cls = { info: "border-gray-700 bg-gray-800/60 text-gray-300", ok: "border-green-500/30 bg-green-500/10 text-green-200", warn: "border-amber-500/30 bg-amber-500/10 text-amber-100", bad: "border-red-500/30 bg-red-500/10 text-red-200" }[tone];
  return (
    <div className={`flex items-start gap-3 border rounded-lg px-3 py-2.5 text-sm ${cls}`} role={tone === "bad" ? "alert" : "status"}>
      <div className="flex-1 min-w-0">{children}</div>
      {onClose && <button type="button" onClick={onClose} aria-label="Fechar aviso" className="p-1 -m-1 opacity-70 hover:opacity-100 shrink-0"><X size={16} /></button>}
    </div>
  );
}

export function Card({ title, hint, right, children, className = "" }: { title?: string; hint?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-gray-900 border border-gray-800 rounded-xl p-4 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="min-w-0"><h3 className="text-sm font-semibold text-gray-100 truncate">{title}</h3>{hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}</div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export const linkBtn = "text-xs text-gray-400 hover:text-gray-200 underline underline-offset-2 disabled:opacity-50";
export const Count = ({ value, max }: { value: string; max: number }) => <span className={value.length > max ? "text-red-400" : ""}>{value.length}/{max}</span>;

/** Envia um arquivo como corpo do pedido (logo, trilha). */
export async function uploadRaw<T>(url: string, file: File): Promise<Result<T>> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, status: res.status, data: null, error: data?.error || "Não deu para enviar esse arquivo.", field: data?.field };
    return { ok: true, status: res.status, data, error: "" };
  } catch {
    return { ok: false, status: 0, data: null, error: "Sem conexão com o servidor. Tente de novo." };
  }
}
