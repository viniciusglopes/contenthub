/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Types } from "mongoose";
import { FriendlyError, notFound } from "@/lib/errors";
import { audit } from "@/lib/orgs";
import { AdObject } from "@/models/Ads";
import Organization from "@/models/Organization";
import { adsToken, findAdAccount } from "./accounts";
import { MetaGraphClient } from "./client";
import { ensureAdsMock } from "./mock";

// AÇÕES QUE MEXEM NA META (pausar, ativar, mudar orçamento, criar anúncio).
// Duas chaves, as duas DESLIGADAS por padrão, iguais à publicação do Instagram:
//   1) env TRAFEGO_WRITE_ENABLED=true no servidor;
//   2) Organization.adsWriteEnabled = true (só o administrador liga, em Admin › Clientes).
// Sem as duas, a rota responde 403 ANTES de ler qualquer coisa. Nada disso foi chamado contra a
// Meta de verdade: só contra o simulador dos testes.

export const adsWriteGlobal = () => process.env.TRAFEGO_WRITE_ENABLED === "true";

export async function adsWriteState(org: Types.ObjectId) {
  const o: any = await Organization.findById(org).select("adsWriteEnabled").lean();
  const global = adsWriteGlobal();
  const mine = o?.adsWriteEnabled === true;
  return {
    on: global && mine,
    global,
    org: mine,
    message: global && mine ? "" : "Ações nos anúncios desligadas: aqui é só leitura. Pausar, mudar orçamento e criar anúncio continuam pelo Gerenciador de Anúncios da Meta.",
  };
}

export type AdAction = "pause" | "activate" | "budget" | "create_ad";
const ACTIONS: AdAction[] = ["pause", "activate", "budget", "create_ad"];

export async function performAdAction(org: Types.ObjectId, b: Record<string, any>, actor: { user: any; ip: string }) {
  const state = await adsWriteState(org);
  if (!state.on) throw new FriendlyError(state.message, 403);
  ensureAdsMock();
  const action = String(b.action || "") as AdAction;
  if (!ACTIONS.includes(action)) throw new FriendlyError("Ação desconhecida.", 400, "action");
  if (b.confirm !== true) throw new FriendlyError("Confirme a ação: ela muda o anúncio de verdade na Meta.", 400, "confirm");
  const acc: any = await findAdAccount(org, b.account);
  const client = new MetaGraphClient(adsToken(acc));

  if (action === "create_ad") {
    // anúncio novo a partir de um post do Instagram, SEMPRE criado pausado
    const adset: any = await AdObject.findOne({ organization: org, adAccount: acc._id, level: "adset", metaId: String(b.adsetId || "") }).lean();
    if (!adset) throw notFound("Conjunto de anúncios");
    const igMediaId = String(b.igMediaId || "");
    if (!/^\d{5,40}$/.test(igMediaId)) throw new FriendlyError("Escolha o post do Instagram.", 400, "igMediaId");
    const ig = (acc.igAccounts || []).find((i: any) => i.id === acc.igUserId) || acc.igAccounts?.[0];
    if (!ig?.pageId) throw new FriendlyError("O token não enxerga a página ligada ao Instagram: sem ela a Meta não cria o anúncio.", 400);
    const name = String(b.name || `Post ${igMediaId}`).slice(0, 120);
    const creative = await client.post<{ id: string }>(`/${acc.adAccountId}/adcreatives`, { name, object_id: ig.pageId, instagram_user_id: ig.id, source_instagram_media_id: igMediaId });
    const ad = await client.post<{ id: string }>(`/${acc.adAccountId}/ads`, { name, adset_id: adset.metaId, creative: JSON.stringify({ creative_id: creative.id }), status: "PAUSED" });
    await audit({ action: "trafego.anuncio_criado", actor: actor.user, organization: org, target: ad.id, ip: actor.ip, meta: { adset: adset.metaId, igMediaId } });
    return { ok: true, id: ad.id, status: "PAUSED" };
  }

  const level = ["campaign", "adset", "ad"].includes(b.level) ? b.level : "";
  const obj: any = level ? await AdObject.findOne({ organization: org, adAccount: acc._id, level, metaId: String(b.id || "") }) : null;
  if (!obj) throw notFound("Campanha, conjunto ou anúncio");
  if (action === "pause" || action === "activate") {
    const status = action === "pause" ? "PAUSED" : "ACTIVE";
    await client.post(`/${obj.metaId}`, { status });
    await AdObject.updateOne({ _id: obj._id, organization: org }, { $set: { status, effectiveStatus: status } });
    await audit({ action: action === "pause" ? "trafego.pausado" : "trafego.ativado", actor: actor.user, organization: org, target: obj.metaId, ip: actor.ip, meta: { level } });
    return { ok: true, id: obj.metaId, status };
  }
  // orçamento diário em reais (ou na moeda da conta) -> centavos, como a Meta pede
  if (level === "ad") throw new FriendlyError("Orçamento é da campanha ou do conjunto, não do anúncio.", 400, "level");
  const value = Number(String(b.dailyBudget ?? "").replace(",", "."));
  if (!Number.isFinite(value) || value < 1 || value > 100_000) throw new FriendlyError("Confira o orçamento diário (de 1 a 100.000).", 400, "dailyBudget");
  const cents = Math.round(value * 100);
  if (obj.dailyBudget == null) throw new FriendlyError("Esse item não usa orçamento diário (orçamento no outro nível ou vitalício). Ajuste pelo Gerenciador.", 400, "dailyBudget");
  await client.post(`/${obj.metaId}`, { daily_budget: cents });
  const before = obj.dailyBudget;
  await AdObject.updateOne({ _id: obj._id, organization: org }, { $set: { dailyBudget: cents } });
  await audit({ action: "trafego.orcamento", actor: actor.user, organization: org, target: obj.metaId, ip: actor.ip, meta: { level, before, after: cents } });
  return { ok: true, id: obj.metaId, dailyBudget: cents };
}
