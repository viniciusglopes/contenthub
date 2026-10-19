"use client";
/* eslint-disable react-hooks/set-state-in-effect -- período lido do link e carga inicial */

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { send } from "@/components/http";
import { Notice } from "@/components/studio/shared";
import { PRESET_KEYS, PeriodBar, type Selection, selectionQuery } from "@/components/instagram/InstagramPanel";
import { DEFAULT_PRESET, type Period, type PeriodPreset } from "@/lib/instagram/period";
import { HelpDot, btn, chip, moneyFull, setParam } from "./shared";

interface Row { key: string; label: string; leads: number; won: number; wonValue: number; spend: number | null; metaLeads: number | null; costPerLead: number | null; costPerSale: number | null; sales: number; revenue: number; refunds: number; cpa: number | null; roas: number | null; basis: "real" | "estimativa" | ""; note: string }
interface Report { period: Period; group: string; touch: string; rows: Row[]; totals: { leads: number; won: number; wonValue: number; matchedSpend: number; matchedLeads: number; totalSpend: number; sales: number; revenue: number; refunds: number; matchedRevenue: number; matchedSales: number }; currency: string; notes: string[] }

const GROUPS = [{ key: "campanha", label: "Campanha" }, { key: "conjunto", label: "Conjunto" }, { key: "anuncio", label: "Anúncio" }, { key: "post", label: "Post" }, { key: "automacao", label: "Automação" }, { key: "origem", label: "Origem" }];
const n = (v: number) => v.toLocaleString("pt-BR");

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 min-w-0">
      <p className="text-[11px] text-gray-500 truncate">{label}</p>
      <p className="text-lg font-bold text-gray-100 truncate">{value}</p>
      {hint && <p className="text-[11px] text-gray-500 truncate" title={hint}>{hint}</p>}
    </div>
  );
}

export default function CrmReports() {
  const [sel, setSel] = useState<Selection | null>(null);
  const [group, setGroup] = useState("campanha");
  const [touch, setTouch] = useState("primeiro");
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [periodError, setPeriodError] = useState<{ msg: string; field?: string } | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const de = p.get("de") || "";
    const ate = p.get("ate") || "";
    const preset = p.get("rperiodo") as PeriodPreset | null;
    if (de || ate) setSel({ preset: "datas", de, ate });
    else setSel({ preset: preset && PRESET_KEYS.has(preset) && preset !== "datas" ? preset : DEFAULT_PRESET, de: "", ate: "" });
    const g = p.get("agrupar");
    if (g && GROUPS.some((x) => x.key === g)) setGroup(g);
    if (p.get("toque") === "ultimo") setTouch("ultimo");
  }, []);
  const q = sel ? `agrupar=${group}&toque=${touch}${selectionQuery(sel) ? `&${selectionQuery(sel)}` : ""}` : "";
  const load = useCallback(async () => {
    if (!sel) return;
    setLoading(true);
    const r = await send<Report>("GET", `/api/crm/relatorios?${q}`);
    setLoading(false);
    if (r.ok && r.data) { setData(r.data); setErr(""); setPeriodError(null); }
    else if (["de", "ate", "periodo", "dias"].includes(r.field || "")) setPeriodError({ msg: r.error, field: r.field });
    else setErr(r.error);
  }, [q, sel]);
  useEffect(() => { load(); }, [load]);
  function pick(next: Selection) {
    setSel(next);
    setParam("rperiodo", next.preset === "datas" || next.preset === DEFAULT_PRESET ? null : next.preset);
    setParam("de", next.preset === "datas" ? next.de : null);
    setParam("ate", next.preset === "datas" ? next.ate : null);
  }
  const t = data?.totals;
  const cpl = t && t.matchedLeads ? t.matchedSpend / t.matchedLeads : null;
  const roas = t && t.matchedSpend ? t.matchedRevenue / t.matchedSpend : null;
  return (
    <div className="space-y-3" data-testid="crm-relatorios">
      {sel && <PeriodBar sel={sel} period={data?.period || null} busy={loading} serverError={periodError} onPick={pick} />}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex bg-gray-800/70 rounded-lg p-0.5 overflow-x-auto" role="radiogroup" aria-label="Agrupar por">
          {GROUPS.map((g) => <button key={g.key} type="button" role="radio" aria-checked={group === g.key} onClick={() => { setGroup(g.key); setParam("agrupar", g.key === "campanha" ? null : g.key); }} className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${group === g.key ? "bg-gray-700 text-white" : "text-gray-400"}`}>{g.label}</button>)}
        </div>
        <select className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-gray-100" value={touch} onChange={(e) => { setTouch(e.target.value); setParam("toque", e.target.value === "ultimo" ? e.target.value : null); }} aria-label="Atribuição">
          <option value="primeiro">Primeiro toque</option><option value="ultimo">Último toque</option>
        </select>
        <HelpDot id="crm-relatorios" label="Como o relatório é calculado" />
        <a href={`/api/crm/relatorios?${q}&formato=csv`} className={`${btn} ml-auto`} download><Download size={14} /> CSV</a>
      </div>
      {err && <Notice tone="bad" onClose={() => setErr("")}>{err}</Notice>}
      {t && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Kpi label="Leads no período" value={n(t.leads)} hint={t.leads ? `${n(t.won)} ganho(s) no funil (${Math.round((t.won / t.leads) * 100)}%)` : ""} />
          <Kpi label="Vendas pagas" value={n(t.sales)} hint={t.refunds ? `reembolsos ${moneyFull(t.refunds)}` : "webhook Hotmart/Kiwify"} />
          <Kpi label="Receita" value={moneyFull(t.revenue)} hint={t.wonValue ? `funil: ${moneyFull(t.wonValue)}` : ""} />
          <Kpi label="ROAS (ligado)" value={roas == null ? "–" : `${roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`} hint={t.matchedSales ? `${n(t.matchedSales)} venda(s) com custo` : "nenhuma venda com id de anúncio"} />
          <Kpi label="Gasto com id ligado" value={moneyFull(t.matchedSpend)} hint={`de ${moneyFull(t.totalSpend)} no Tráfego${data?.currency && data.currency !== "BRL" ? ` (${data.currency})` : ""}`} />
          <Kpi label="Custo por lead (ligado)" value={cpl == null ? "–" : moneyFull(Math.round(cpl * 100) / 100)} hint={t.matchedLeads ? `${n(t.matchedLeads)} lead(s) com custo` : "nenhum lead com id de anúncio"} />
        </div>
      )}
      {data && (
        <div className="overflow-x-auto bg-gray-900 border border-gray-800 rounded-xl">
          <table className="w-full text-xs md:text-sm min-w-[1080px]" data-testid="crm-relatorio-tabela">
            <thead className="text-gray-400 text-left"><tr className="border-b border-gray-800">
              <th className="py-2 px-3 font-medium">{GROUPS.find((g) => g.key === data.group)?.label}</th>
              <th className="py-2 px-2 font-medium text-right">Leads</th><th className="py-2 px-2 font-medium text-right" title="Desses leads, quantos estão numa etapa de ganho">Ganhos</th>
              <th className="py-2 px-2 font-medium text-right" title="Vendas aprovadas no período (Hotmart/Kiwify)">Vendas</th><th className="py-2 px-2 font-medium text-right">Receita</th><th className="py-2 px-2 font-medium text-right">Reemb.</th>
              <th className="py-2 px-2 font-medium text-right">Gasto</th><th className="py-2 px-2 font-medium text-right" title="Leads que a própria Meta contou no período">Meta contou</th>
              <th className="py-2 px-2 font-medium text-right">CPL</th><th className="py-2 px-2 font-medium text-right">CPA</th><th className="py-2 px-2 font-medium text-right">ROAS</th><th className="py-2 px-2 font-medium">Base</th>
            </tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.key || "vazio"} className="border-b border-gray-800/60">
                  <td className="py-2 px-3 max-w-[260px] truncate text-gray-100" title={[r.label, r.key, r.note].filter(Boolean).join(" · ")}>{r.label}</td>
                  <td className="py-2 px-2 text-right">{n(r.leads)}</td>
                  <td className="py-2 px-2 text-right">{n(r.won)}</td>
                  <td className="py-2 px-2 text-right">{n(r.sales)}</td>
                  <td className="py-2 px-2 text-right text-green-300 whitespace-nowrap">{r.revenue ? moneyFull(r.revenue) : "–"}</td>
                  <td className="py-2 px-2 text-right text-red-300 whitespace-nowrap">{r.refunds ? moneyFull(r.refunds) : "–"}</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">{r.spend == null ? "–" : moneyFull(r.spend)}</td>
                  <td className="py-2 px-2 text-right text-gray-400">{r.metaLeads == null ? "–" : n(r.metaLeads)}</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">{r.costPerLead == null ? "–" : moneyFull(r.costPerLead)}</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">{r.cpa == null ? "–" : moneyFull(r.cpa)}</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">{r.roas == null ? "–" : `${r.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`}</td>
                  <td className="py-2 px-2 whitespace-nowrap">{r.basis === "real" ? <span className={`${chip} bg-green-500/15 text-green-300`}>mesmo id</span> : r.basis === "estimativa" ? <span className={`${chip} bg-amber-500/15 text-amber-200`} title={r.note}>estimativa</span> : <span className="text-gray-600" title={r.note}>–</span>}</td>
                </tr>
              ))}
              {!data.rows.length && <tr><td colSpan={12} className="py-6 text-center text-gray-500">Nenhum lead nem gasto no período.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {data && <ul className="text-[11px] text-gray-500 space-y-0.5">{data.notes.map((x) => <li key={x}>{x}</li>)}</ul>}
    </div>
  );
}
