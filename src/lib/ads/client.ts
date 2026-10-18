// Cliente da Graph API do FACEBOOK (host graph.facebook.com): Marketing API (anúncios),
// Business Discovery (perfil público de outra conta do Instagram) e Biblioteca de Anúncios.
// Documentação oficial conferida em 18/10/2026 (exemplos em v25.0).
// Nunca registrar a URL em log: ela carrega o token.

import { FriendlyError } from "@/lib/errors";
import type { FetchLike, FetchResponseLike } from "@/lib/instagram/client";

export const FB_HOST = "https://graph.facebook.com";
export const META_API_VERSION = process.env.META_API_VERSION || "v25.0";

let override: FetchLike | null = null;
/** Testes e modo de demonstração (IG_MOCK=1). */
export function setMetaFetch(f: FetchLike | null) {
  override = f;
}
export function getMetaFetch(): FetchLike {
  if (override) return override;
  return (url, init) => fetch(url, { ...init, cache: "no-store" }) as Promise<FetchResponseLike>;
}

export type MetaErrorKind = "token_invalido" | "permissao" | "limite" | "temporario" | "parametro" | "rede" | "desconhecido";

const MSG: Record<MetaErrorKind, string> = {
  token_invalido: "O token do Facebook não é válido ou já venceu. Gere um novo e cole aqui.",
  permissao: "O token não tem a permissão necessária (para anúncios: ads_read; para concorrentes: instagram_basic, instagram_manage_insights e pages_read_engagement).",
  limite: "A Meta pediu para esperar (limite de chamadas atingido). Tente de novo em alguns minutos.",
  temporario: "A Meta está instável agora. Tente de novo em alguns minutos.",
  parametro: "A Meta recusou o pedido.",
  rede: "Não foi possível falar com a Meta. Confira a conexão do servidor e tente de novo.",
  desconhecido: "A Meta devolveu um erro inesperado.",
};

export class MetaApiError extends FriendlyError {
  kind: MetaErrorKind;
  code?: number;
  metaMessage?: string;
  constructor(kind: MetaErrorKind, opts: { code?: number; metaMessage?: string } = {}) {
    const detail = (kind === "parametro" || kind === "desconhecido") && opts.metaMessage ? ` Detalhe: ${opts.metaMessage.slice(0, 200)}` : "";
    const status = kind === "limite" ? 429 : kind === "rede" || kind === "temporario" ? 502 : 400;
    super(`${MSG[kind]}${detail}${opts.code ? ` (código ${opts.code})` : ""}`, status, kind === "token_invalido" ? "token" : undefined);
    this.name = "MetaApiError";
    this.kind = kind;
    this.code = opts.code;
    this.metaMessage = opts.metaMessage;
  }
}

export function classifyMetaError(err: { code?: number; message?: string } | undefined, status: number): MetaApiError {
  const code = err?.code;
  const opts = { code, metaMessage: err?.message || "" };
  if (code === 190 || code === 102 || code === 463 || code === 467) return new MetaApiError("token_invalido", opts);
  if (code === 10 || code === 3 || (code !== undefined && code >= 200 && code <= 299)) return new MetaApiError("permissao", opts);
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80004 || status === 429) return new MetaApiError("limite", opts);
  if (code === 1 || code === 2 || status >= 500) return new MetaApiError("temporario", opts);
  if (code === 100) return new MetaApiError("parametro", opts);
  return new MetaApiError("desconhecido", opts);
}

type Params = Record<string, string | number | boolean | undefined>;
function qs(params: Params): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") p.set(k, String(v));
  return p.toString();
}

export const normalizeActId = (raw: string): string => {
  const v = String(raw || "").trim().replace(/\s+/g, "");
  const digits = v.replace(/^act_/i, "");
  return /^\d{5,25}$/.test(digits) ? `act_${digits}` : "";
};

export interface RawInsightRow {
  date_start?: string;
  date_stop?: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
}

export interface ListResult<T> {
  items: T[];
  complete: boolean;
}

export class MetaGraphClient {
  calls = 0;
  constructor(
    private token: string,
    private fetchImpl: FetchLike = getMetaFetch(),
    private version: string = META_API_VERSION,
    /** teto de chamadas deste cliente (proteção contra laço de paginação) */
    private maxCalls = 400
  ) {}

  private async raw<T>(url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }): Promise<T> {
    if (this.calls >= this.maxCalls) throw new FriendlyError("Parei de buscar: chamadas demais à Meta numa vez só. Tente um período menor.", 429);
    this.calls++;
    let res: FetchResponseLike;
    try {
      res = await this.fetchImpl(url, init);
    } catch {
      throw new MetaApiError("rede");
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* corpo vazio */
    }
    const b = body as { error?: { code?: number; message?: string } } | null;
    if (!res.ok || b?.error) throw classifyMetaError(b?.error, res.status);
    return body as T;
  }

  async get<T>(path: string, params: Params = {}): Promise<T> {
    return this.raw<T>(`${FB_HOST}/${this.version}${path}?${qs({ ...params, access_token: this.token })}`);
  }

  async post<T>(path: string, params: Params): Promise<T> {
    return this.raw<T>(`${FB_HOST}/${this.version}${path}`, {
      method: "POST",
      body: qs({ ...params, access_token: this.token }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  }

  /** Percorre a paginação (`paging.next`) até o fim ou até `maxPages`. */
  async list<T>(path: string, params: Params, maxPages = 20): Promise<ListResult<T>> {
    const items: T[] = [];
    let page = await this.get<{ data?: T[]; paging?: { next?: string } }>(path, params);
    let pages = 1;
    for (;;) {
      items.push(...(page.data || []));
      const next = page.paging?.next;
      if (!next) return { items, complete: true };
      if (pages >= maxPages) return { items, complete: false };
      // o link de próxima página já vem com o token; só aceitamos o mesmo host
      if (!next.startsWith(`${FB_HOST}/`)) return { items, complete: false };
      page = await this.raw(next);
      pages++;
    }
  }

  me() {
    return this.get<{ id: string; name?: string }>("/me", { fields: "id,name" });
  }

  adAccount(actId: string) {
    return this.get<{ id: string; account_id?: string; name?: string; currency?: string; timezone_name?: string; account_status?: number }>(`/${actId}`, {
      fields: "id,account_id,name,currency,timezone_name,account_status",
    });
  }

  /** Páginas que o token enxerga e a conta do Instagram ligada a cada uma (para Business Discovery). */
  async igAccounts(): Promise<{ id: string; username: string; pageId: string; pageName: string }[]> {
    const r = await this.list<{ id: string; name?: string; instagram_business_account?: { id: string; username?: string } }>("/me/accounts", {
      fields: "id,name,instagram_business_account{id,username}",
      limit: 100,
    }, 3);
    return r.items
      .filter((p) => p.instagram_business_account?.id)
      .map((p) => ({ id: p.instagram_business_account!.id, username: p.instagram_business_account!.username || "", pageId: p.id, pageName: p.name || "" }));
  }

  /** Insights por anúncio e por dia (level=ad, time_increment=1). */
  insightsByAdDay(actId: string, since: string, until: string) {
    return this.list<RawInsightRow>(`/${actId}/insights`, {
      level: "ad",
      time_increment: 1,
      time_range: JSON.stringify({ since, until }),
      fields: "ad_id,adset_id,campaign_id,spend,impressions,reach,clicks,inline_link_clicks,actions,action_values",
      use_unified_attribution_setting: true,
      limit: 500,
    }, 60);
  }

  /** Alcance da CONTA no intervalo inteiro (sem somar dias). */
  async accountReach(actId: string, since: string, until: string): Promise<number | null> {
    const r = await this.get<{ data?: { reach?: string }[] }>(`/${actId}/insights`, {
      level: "account",
      time_range: JSON.stringify({ since, until }),
      fields: "reach",
    });
    const v = r.data?.[0]?.reach;
    return v == null ? 0 : Number(v);
  }

  campaigns(actId: string) {
    return this.list<Record<string, any>>(`/${actId}/campaigns`, { fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time", limit: 200 }, 10); // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  adsets(actId: string) {
    return this.list<Record<string, any>>(`/${actId}/adsets`, { fields: "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,optimization_goal,created_time", limit: 200 }, 10); // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  ads(actId: string) {
    return this.list<Record<string, any>>(`/${actId}/ads`, { // eslint-disable-line @typescript-eslint/no-explicit-any
      fields: "id,name,status,effective_status,campaign_id,adset_id,created_time,creative{id,thumbnail_url,effective_instagram_media_id,instagram_permalink_url}",
      limit: 200,
    }, 10);
  }

  /** Business Discovery: perfil público de outra conta profissional do Instagram. Só no host do Facebook. */
  businessDiscovery(igUserId: string, username: string) {
    const fields = `business_discovery.username(${username}){username,name,followers_count,media_count,media.limit(12){caption,like_count,comments_count,timestamp,media_type,media_product_type,permalink}}`;
    return this.get<{ business_discovery?: Record<string, any> }>(`/${igUserId}`, { fields }); // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  /** Biblioteca de Anúncios (ads_archive). Fora da UE, a Meta só devolve anúncio político/social. */
  adLibrary(q: { pageId?: string; terms?: string; country?: string }) {
    return this.get<{ data?: Record<string, any>[] }>("/ads_archive", { // eslint-disable-line @typescript-eslint/no-explicit-any
      ad_type: "ALL",
      ad_active_status: "ACTIVE",
      ad_reached_countries: JSON.stringify([q.country || "BR"]),
      search_page_ids: q.pageId || undefined,
      search_terms: q.pageId ? undefined : q.terms,
      fields: "id,page_id,page_name,ad_delivery_start_time,ad_snapshot_url,ad_creative_bodies,publisher_platforms",
      limit: 25,
    });
  }
}
