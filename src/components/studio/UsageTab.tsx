"use client";

import { useEffect, useState } from "react";
import { fmtWhen, send } from "@/components/http";
import { PURPOSES, type Purpose, SERVICES } from "@/lib/studio/catalog";
import { Card, Notice, fmtBrl, fmtUsd } from "./shared";

interface Row { _id: string; at: string; purpose: string; service: string; model: string; what: string; units: number; unit: string; usd: number; brl: number; ok: boolean; error: string; house: boolean; by: string }
interface Group { purpose: string; service: string; model: string; house: boolean; calls: number; failed: number; units: number; unit: string; usd: number; brl: number }
interface Report { totalUsd: number; totalBrl: number; groups: Group[]; rows: Row[]; budget: { capUsd: number; capIsDefault: boolean; spentUsd: number; reservedUsd: number; leftUsd: number; confirmAboveUsd: number; fx: { rate: number; source: string } } }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const svc = (s: string) => SERVICES[s]?.label || s;

// Uso e custos de IA por período. O filtro fica à vista; o teto do mês aparece sempre.
export default function UsageTab() {
  const [period, setPeriod] = useState<"mes" | "passado" | "datas">("mes");
  const today = new Date();
  const [from, setFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(iso(today));
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const now = new Date();
    const q = period === "mes" ? "" : period === "passado" ? `?de=${iso(new Date(now.getFullYear(), now.getMonth() - 1, 1))}&ate=${iso(new Date(now.getFullYear(), now.getMonth(), 0))}` : `?de=${from}&ate=${to}`;
    send<Report>("GET", `/api/estudio/uso${q}`).then((r) => { if (r.ok) { setData(r.data); setError(""); } else setError(r.error); });
  }, [period, from, to]);

  const b = data?.budget;
  const pct = b && b.capUsd > 0 ? Math.min(100, ((b.spentUsd + b.reservedUsd) / b.capUsd) * 100) : 0;
  const chip = (id: typeof period, label: string) => <button type="button" onClick={() => setPeriod(id)} className={`px-3 py-1.5 rounded-full text-xs border ${period === id ? "bg-brand-500 text-brand-ink border-brand-500 font-bold" : "border-gray-700 text-gray-300 hover:bg-gray-800"}`}>{label}</button>;
  return (
    <div className="space-y-4" data-testid="uso">
      <div className="flex flex-wrap items-center gap-2">
        {chip("mes", "Este mês")}{chip("passado", "Mês passado")}{chip("datas", "Datas")}
        {period === "datas" && <span className="flex items-center gap-1.5 text-xs text-gray-400">de <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-gray-100" /> até <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-gray-100" /></span>}
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {data && b && (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Card><p className="text-xs text-gray-500">Gasto no período</p><p className="text-xl font-bold text-gray-100 mt-1">{fmtUsd(data.totalUsd)}</p><p className="text-xs text-gray-400">{fmtBrl(data.totalBrl)}</p></Card>
            <Card><p className="text-xs text-gray-500">Gasto neste mês</p><p className="text-xl font-bold text-gray-100 mt-1">{fmtUsd(b.spentUsd)}</p><p className="text-xs text-gray-400">{b.reservedUsd > 0 ? `+ ${fmtUsd(b.reservedUsd)} reservado na fila` : fmtBrl(b.spentUsd * b.fx.rate)}</p></Card>
            <Card><p className="text-xs text-gray-500">Teto do mês{b.capIsDefault ? " (padrão)" : ""}</p><p className="text-xl font-bold text-gray-100 mt-1">{fmtUsd(b.capUsd)}</p><p className="text-xs text-gray-400">só o administrador altera</p></Card>
            <Card><p className="text-xs text-gray-500">Ainda disponível</p><p className={`text-xl font-bold mt-1 ${b.leftUsd <= 0 ? "text-red-300" : "text-gray-100"}`}>{fmtUsd(b.leftUsd)}</p><div className="h-1.5 bg-gray-800 rounded-full mt-2 overflow-hidden"><div className={`h-full ${pct >= 100 ? "bg-red-400" : pct > 80 ? "bg-amber-400" : "bg-brand-500"}`} style={{ width: `${pct}%` }} /></div></Card>
          </div>
          {b.leftUsd <= 0 && <Notice tone="warn">O teto do mês foi atingido: novas gerações com IA ficam bloqueadas até o mês virar ou o administrador aumentar o teto. Roteiro à mão e Reel sem voz seguem funcionando.</Notice>}
          <p className="text-[11px] text-gray-500">Valores ESTIMADOS pela tabela de preços dos provedores; o valor de verdade é o do extrato de cada um. Dólar: {fmtBrl(b.fx.rate)}, {b.fx.source}. Confirmação pedida acima de {fmtUsd(b.confirmAboveUsd)} por geração.</p>
          <Card title="Por provedor">
            {data.groups.length === 0 ? <p className="text-sm text-gray-500 py-4 text-center">Nenhuma chamada a provedor de IA neste período.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[520px]">
                <thead><tr className="text-left text-xs text-gray-500"><th className="py-1.5 font-normal">Finalidade</th><th className="font-normal">Provedor e modelo</th><th className="font-normal text-right">Chamadas</th><th className="font-normal text-right">Unidades</th><th className="font-normal text-right">Custo</th></tr></thead>
                <tbody className="divide-y divide-gray-800">{data.groups.map((g, i) => (
                  <tr key={i}><td className="py-1.5 text-gray-300">{PURPOSES[g.purpose as Purpose]?.label || g.purpose}</td><td className="text-gray-100 truncate max-w-[240px]" title={g.model}>{svc(g.service)} <span className="text-gray-500">{g.model}{g.house ? " · chave da casa" : ""}</span></td><td className="text-right text-gray-300">{g.calls}{g.failed > 0 && <span className="text-red-300"> ({g.failed} falhas)</span>}</td><td className="text-right text-gray-300 whitespace-nowrap">{g.units.toLocaleString("pt-BR")} {g.unit}</td><td className="text-right text-gray-100 whitespace-nowrap">{fmtUsd(g.usd)} <span className="text-gray-500">{fmtBrl(g.brl)}</span></td></tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>
          {data.rows.length > 0 && (
            <Card title="Últimas chamadas" hint="As 200 mais recentes do período.">
              <ul className="divide-y divide-gray-800 text-sm">{data.rows.map((r) => (
                <li key={r._id} className="py-1.5 flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-24 shrink-0">{fmtWhen(r.at)}</span>
                  <span className="text-gray-200 truncate flex-1" title={`${r.what} · ${svc(r.service)} ${r.model}${r.by ? ` · ${r.by}` : ""}`}>{r.what || PURPOSES[r.purpose as Purpose]?.label} <span className="text-gray-500">· {svc(r.service)}{r.house ? " (casa)" : ""}</span></span>
                  {r.ok ? <span className="text-gray-300 whitespace-nowrap shrink-0">{fmtUsd(r.usd)}</span> : <span className="text-xs text-red-300 truncate max-w-[40%] shrink-0" title={r.error}>falhou: {r.error}</span>}
                </li>
              ))}</ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
