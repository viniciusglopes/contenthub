"use client";

import { HelpCircle } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Stage { key: string; name: string; kind: "open" | "won" | "lost"; color: string }
export interface PipelineT { _id: string; name: string; isDefault: boolean; stages: Stage[] }
export interface TeamUser { _id: string; name: string; role: string }
export interface TouchT { at: string | null; kind: string; label: string; campaignId: string; adsetId: string; adId: string; formId: string; postIgId: string; utm?: Record<string, string> }
export interface LeadT {
  _id: string; name: string; display: string; username: string; igsid: string; account: string | null; email: string; phone: string; tags: string[]; fields: Record<string, string>;
  source: string; sourceLabel: string; origin: Record<string, any>; utm: Record<string, string>; firstTouch: TouchT | null; lastTouch: TouchT | null;
  lead: boolean; leadAt: string | null; pipeline: string | null; stage: string; stageAt: string | null; owner: string | null; ownerName: string; value: number | null; lostReason: string;
  wonAt: string | null; lostAt: string | null; consent: { given: boolean; at: string | null; channel: string; version: string; text: string }; optOutAt: string | null; lastInboundAt: string | null; createdAt: string | null;
  tasks?: { n: number; next: string | null };
}
export interface Options {
  pipelines: PipelineT[]; team: TeamUser[]; me: string; canManage: boolean; tags: string[];
  sources: { key: string; label: string }[]; allSources: { key: string; label: string }[]; campaigns: { id: string; name: string }[];
  overdueMine: number; leadAds: { global: boolean; org: boolean; on: boolean; message: string };
}
export interface TaskT { _id: string; contact: string; title: string; dueAt: string | null; done: boolean; doneAt: string | null; assignee: string | null; overdue: boolean; contactName?: string }

export const input = "block w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 mt-1";
export const select = "bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-gray-100";
export const primary = "bg-brand-500 text-brand-ink px-4 py-2 rounded-lg font-semibold text-sm hover:bg-brand-400 transition disabled:opacity-60";
export const btn = "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-gray-700 text-gray-200 hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap";
export const chip = "text-[11px] px-1.5 py-0.5 rounded whitespace-nowrap";

export const SOURCE_TONE: Record<string, string> = {
  automation: "bg-violet-500/15 text-violet-200", comment: "bg-violet-500/15 text-violet-200", dm: "bg-violet-500/15 text-violet-200", postback: "bg-violet-500/15 text-violet-200",
  meta_lead_ads: "bg-sky-500/15 text-sky-200", ig_ad: "bg-sky-500/15 text-sky-200", ig_link: "bg-pink-500/15 text-pink-200",
  link: "bg-amber-500/15 text-amber-200", landing: "bg-amber-500/15 text-amber-200", manual: "bg-gray-700 text-gray-300", import: "bg-gray-700 text-gray-300",
};

export const money = (v: number | null | undefined) => (v == null ? "" : `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`);
export const moneyFull = (v: number | null | undefined) => (v == null ? "–" : `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

export function HelpDot({ id, label }: { id: string; label: string }) {
  return (
    <a href={`/?view=ajuda&artigo=${id}`} className="inline-flex text-gray-500 hover:text-gray-200 align-middle" title={label} aria-label={label}>
      <HelpCircle size={14} />
    </a>
  );
}

export function setParam(k: string, v: string | null) {
  const url = new URL(window.location.href);
  if (v) url.searchParams.set(k, v);
  else url.searchParams.delete(k);
  window.history.replaceState(null, "", url);
}
