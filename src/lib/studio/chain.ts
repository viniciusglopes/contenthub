import type { Types } from "mongoose";
import { decrypt } from "@/lib/crypto";
import { FriendlyError } from "@/lib/errors";
import ApiCredential from "@/models/ApiCredential";
import Organization from "@/models/Organization";
import { HouseCredential } from "@/models/Platform";
import { PURPOSES, type Purpose, SERVICES, defaultModel } from "./catalog";
import { assertUnderCap, recordUsage, settings } from "./cost";
import { ProviderError } from "./providers";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Org = Types.ObjectId;

// CADEIA DE PROVEDORES POR FINALIDADE, COM FALLBACK EM SEQUÊNCIA.
// Ordem: as chaves do cliente, na ordem de preferência dele; depois (se o cliente não tem chave
// daquele serviço e a conta permite) as chaves "da casa", na ordem da plataforma. Se o primeiro
// falhar, estourar o tempo ou estiver sem saldo, tenta o próximo; cada tentativa fica registrada
// no uso (quem respondeu, quanto custou, de quem era a chave).

export interface Cred { service: string; apiKey: string; model: string; house: boolean; extra: Record<string, string> }
export interface Meter { units: number; unit: string; costUsd: number; add(units: number, unit: string, costUsd: number): void }

function ordered<T extends { service: string }>(list: T[], order: unknown): T[] {
  const pref = Array.isArray(order) ? order.map(String) : [];
  const pos = (s: string) => (pref.includes(s) ? pref.indexOf(s) : pref.length + Object.keys(SERVICES).indexOf(s));
  return [...list].sort((a, b) => pos(a.service) - pos(b.service));
}
const serves = (c: any, purpose: Purpose) => c.active !== false && SERVICES[c.service]?.purposes[purpose] && (c.purposes || []).includes(purpose);
function toCred(c: any, purpose: Purpose, house: boolean): Cred | null {
  const raw = c.credentials instanceof Map ? c.credentials.get("apiKey") : c.credentials?.apiKey;
  if (!raw) return null;
  const models = c.models instanceof Map ? Object.fromEntries(c.models) : c.models || {};
  const allowed = SERVICES[c.service].purposes[purpose]!.map((m) => m.id);
  const all: Record<string, string> = c.credentials instanceof Map ? Object.fromEntries(c.credentials) : c.credentials || {};
  const extra = Object.fromEntries((SERVICES[c.service].extra || []).map((f) => [f.key, String(all[f.key] || "")]));
  return { service: c.service, apiKey: decrypt(String(raw)), model: allowed.includes(models[purpose]) ? models[purpose] : defaultModel(c.service, purpose), house, extra };
}

export async function resolveChain(org: Org, purpose: Purpose): Promise<Cred[]> {
  const [o, own, cfg]: [any, any[], any] = await Promise.all([
    Organization.findById(org).select("ai studio").lean(),
    ApiCredential.find({ organization: org }).lean(),
    settings(),
  ]);
  const mine = ordered(own.filter((c) => serves(c, purpose)), o?.ai?.chains?.[purpose]).map((c) => toCred(c, purpose, false)).filter(Boolean) as Cred[];
  if (o?.studio?.useHouse === false) return mine;
  const house: any[] = await HouseCredential.find({ active: true }).lean();
  const extra = ordered(house.filter((c) => serves(c, purpose) && !mine.some((m) => m.service === c.service)), cfg.chains?.[purpose]).map((c) => toCred(c, purpose, true)).filter(Boolean) as Cred[];
  return [...mine, ...extra];
}

export interface Attempt { service: string; model: string; house: boolean; ok: boolean; ms: number; error?: string }
export interface ChainCtx { org: Org; purpose: Purpose; what: string; job?: unknown; project?: unknown; by?: string; timeoutMs?: number }

const KIND_MSG: Record<string, string> = { chave: "chave recusada", saldo: "sem saldo ou cota", limite: "limite de uso atingido", tempo: "não respondeu a tempo", rede: "sem conexão", recusado: "pedido recusado pelo provedor", invalido: "resposta inválida", provedor: "erro do provedor" };
export const attemptText = (a: Attempt) => `${SERVICES[a.service]?.label || a.service}: ${a.error || "falhou"}`;

/**
 * Tenta os provedores NA ORDEM. `call` faz a chamada com a credencial e anota no medidor o que
 * consumiu (unidades e custo); pode lançar para forçar o próximo (ex.: saída que não passou na
 * validação): o que já foi consumido fica registrado mesmo assim.
 */
export async function runChain<T>(ctx: ChainCtx, call: (cred: Cred, signal: AbortSignal, meter: Meter) => Promise<T>): Promise<{ result: T; cred: Cred; attempts: Attempt[] }> {
  const creds = await resolveChain(ctx.org, ctx.purpose);
  const label = PURPOSES[ctx.purpose].label.toLowerCase();
  if (!creds.length) throw new FriendlyError(`Nenhuma chave de IA para ${label} está cadastrada. Cadastre em Estúdio › Chaves de IA.`, 400, "chave");
  const attempts: Attempt[] = [];
  for (const cred of creds) {
    await assertUnderCap(ctx.org);
    const started = Date.now();
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const base = { purpose: ctx.purpose, service: cred.service, model: cred.model, what: ctx.what, house: cred.house, job: ctx.job, project: ctx.project, by: ctx.by };
    const meter: Meter = { units: 0, unit: "", costUsd: 0, add(u, unit, c) { this.units += u; this.unit = unit; this.costUsd += c; } };
    try {
      const result = await Promise.race([
        call(cred, ctl.signal, meter),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { ctl.abort(); reject(new ProviderError("tempo", "tempo esgotado")); }, ctx.timeoutMs ?? 60_000); }),
      ]);
      const ms = Date.now() - started;
      await recordUsage(ctx.org, { ...base, units: meter.units, unit: meter.unit, costUsd: meter.costUsd, ok: true, ms });
      attempts.push({ service: cred.service, model: cred.model, house: cred.house, ok: true, ms });
      return { result, cred, attempts };
    } catch (e) {
      const ms = Date.now() - started;
      // a mensagem pode carregar texto do provedor; a chave nunca entra aqui
      const error = e instanceof ProviderError ? KIND_MSG[e.kind] || e.kind : e instanceof Error && e.name === "ScriptInvalid" ? "roteiro fora das regras" : "erro inesperado";
      // tentativa falha também fica registrada, com o que chegou a consumir antes de falhar
      await recordUsage(ctx.org, { ...base, units: meter.units, unit: meter.unit, costUsd: meter.costUsd, ok: false, error, ms });
      attempts.push({ service: cred.service, model: cred.model, house: cred.house, ok: false, ms, error });
    } finally {
      clearTimeout(timer);
    }
  }
  throw new FriendlyError(`Nenhum provedor de ${label} respondeu. ${attempts.map(attemptText).join("; ")}.`, 502, "provedor");
}
