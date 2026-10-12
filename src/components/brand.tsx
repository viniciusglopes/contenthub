"use client";

import type { CSSProperties } from "react";

export interface BrandInfo {
  displayName: string;
  logo: string;
  color: string;
}

export const DEFAULT_BRAND: BrandInfo = { displayName: "ContentHub", logo: "", color: "#eab308" };
const BRAND_KEY = "ch-marca";

/** Nome (e logo, se houver) do cliente. Sem logo, o nome aparece na cor de destaque. */
export function BrandMark({ brand, size = "md" }: { brand: BrandInfo; size?: "md" | "lg" }) {
  const img = size === "lg" ? "h-10 max-w-[180px]" : "h-8 max-w-[140px]";
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- logo do cliente: endereço externo ou imagem embutida */}
      {brand.logo && <img src={brand.logo} alt="" className={`${img} w-auto object-contain shrink-0 rounded`} />}
      <span className={`${size === "lg" ? "text-2xl" : "text-xl"} font-bold text-brand-400 truncate`} title={brand.displayName}>
        {brand.displayName}
      </span>
    </span>
  );
}

export const varsStyle = (vars: Record<string, string> | null | undefined) => (vars || {}) as CSSProperties;

/** Lembra a marca do último acesso neste aparelho, para a tela de entrada já abrir com ela. */
export function rememberBrand(slug: string, brand: BrandInfo, vars: Record<string, string>) {
  try {
    window.localStorage.setItem(BRAND_KEY, JSON.stringify({ slug, brand: { ...brand, logo: brand.logo.length > 20_000 ? "" : brand.logo }, vars }));
  } catch { /* navegação privada */ }
}
export function recallBrand(): { slug: string; brand: BrandInfo; vars: Record<string, string> } | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(BRAND_KEY) || "null");
    return v && typeof v.slug === "string" && v.brand?.displayName ? v : null;
  } catch {
    return null;
  }
}

export const fieldCls = (bad?: boolean) =>
  `w-full bg-gray-800 border rounded-lg px-3 py-2.5 text-base md:text-sm mt-1 text-gray-100 outline-none focus:border-brand-500 ${bad ? "border-red-500/60" : "border-gray-700"}`;
export const primaryBtn =
  "bg-brand-500 text-brand-ink font-bold px-4 py-2.5 rounded-lg hover:bg-brand-400 transition text-sm disabled:opacity-50 whitespace-nowrap";
export const ghostBtn =
  "text-xs px-2.5 py-1.5 rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-700 transition disabled:opacity-50 whitespace-nowrap";
