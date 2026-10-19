// CONTAGEM DE ANÚNCIOS ATIVOS pela API oficial da Biblioteca de Anúncios da Meta (ads_archive).
//
// Referência oficial lida em 19/10/2026: https://developers.facebook.com/docs/graph-api/reference/ads_archive/
//  - ad_active_status: "Defaults to ACTIVE for all ads that are eligible for delivery" (pedimos ACTIVE explícito);
//  - ad_reached_countries: "Search ALL or by ISO country code to return ads that reached specific countries";
//  - "Ads that did not reach any location in the EU will only return if they are about social issues,
//    elections or politics" => anúncio COMERCIAL só aparece se alcançou a UE. Por isso pedimos países da UE
//    e gravamos quais foram; oferta que roda só no Brasil vai pela contagem manual;
//  - search_page_ids: "up to 10 Facebook Page IDs at once" (usamos 1 por vez para contar por página);
//  - a resposta tem só `data` e `paging`: NÃO existe campo de total. Contar = paginar até o fim;
//  - erro 613: "Calls to this api have exceeded the rate limit".
// Acesso (fonte secundária + mensagem de erro já vista no app; a página oficial facebook.com/ads/library/api
// devolveu 403 para leitura automática): a PESSOA dona do token confirma identidade e localização em
// facebook.com/ID e aceita os termos em facebook.com/ads/library/api; token de usuário de um app da Meta.
// A página de referência não fala em App Review para ads_archive (não confirmado).
//
// ⛔ NUNCA ler as páginas públicas da Biblioteca por robô (Termos de Coleta Automatizada da Meta).

import { FriendlyError } from "@/lib/errors";
import { MetaApiError, MetaGraphClient } from "@/lib/ads/client";

/** Os 27 países da União Europeia (ISO 3166-1 alfa-2). */
export const EU_COUNTRIES = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];

export function cleanCountries(raw: unknown): string[] {
  const list = (Array.isArray(raw) ? raw : String(raw || "").split(/[\s,;]+/)).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  const out = [...new Set(list)];
  for (const c of out) if (!/^[A-Z]{2}$/.test(c)) throw new FriendlyError(`País inválido: ${c}. Use o código de 2 letras (ex.: PT).`, 400, "countries");
  if (out.length > 30) throw new FriendlyError("No máximo 30 países.", 400, "countries");
  return out;
}

/** Países pedidos à API: env OFFERS_AD_COUNTRIES > configuração do administrador > os 27 da UE. */
export function apiCountries(configured?: string[] | null): string[] {
  const env = process.env.OFFERS_AD_COUNTRIES;
  if (env) return cleanCountries(env);
  return configured?.length ? configured : EU_COUNTRIES;
}

export const PAGE_SIZE = Number(process.env.OFFERS_PAGE_SIZE || 250);
/** teto de páginas da paginação por oferta (250 x 40 = 10.000 anúncios) */
export const MAX_PAGES = Number(process.env.OFFERS_MAX_PAGES || 40);

export interface CountResult {
  count: number;
  complete: boolean;
  calls: number;
  countries: string[];
}

export async function countActiveAds(client: MetaGraphClient, pageId: string, countries: string[]): Promise<CountResult> {
  if (!/^\d{5,25}$/.test(pageId)) throw new FriendlyError("Para contar pela API, cadastre o id numérico da página do Facebook.", 400, "pageId");
  const before = client.calls;
  const r = await client.list<{ id: string }>(
    "/ads_archive",
    { ad_type: "ALL", ad_active_status: "ACTIVE", ad_reached_countries: JSON.stringify(countries), search_page_ids: pageId, fields: "id", limit: PAGE_SIZE },
    MAX_PAGES
  );
  return { count: new Set(r.items.map((a) => a.id)).size, complete: r.complete, calls: client.calls - before, countries };
}

export function libraryError(e: unknown): string {
  if (e instanceof MetaApiError && e.kind === "permissao")
    return "A Meta recusou: a pessoa dona do token precisa confirmar identidade e localização (facebook.com/ID) e aceitar os termos da API da Biblioteca de Anúncios (facebook.com/ads/library/api).";
  if (e instanceof MetaApiError && e.kind === "token_invalido") return "O token da Biblioteca de Anúncios venceu ou não é válido. Gere outro.";
  if (e instanceof MetaApiError && e.kind === "limite") return "A Meta pediu para esperar (limite de chamadas da Biblioteca de Anúncios). A próxima rodada tenta de novo.";
  return e instanceof FriendlyError ? e.message : "Erro inesperado na Biblioteca de Anúncios.";
}

/** Link HUMANO para a busca pública da Biblioteca (abre no navegador da pessoa; nada é lido por nós). */
export function publicLibraryUrl(o: { pageId?: string; name?: string; tags?: { countries?: string[] } }): string {
  const country = o.tags?.countries?.length === 1 ? o.tags.countries[0] : "ALL";
  const base = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&media_type=all`;
  if (/^\d{5,25}$/.test(String(o.pageId || ""))) return `${base}&search_type=page&view_all_page_id=${o.pageId}`;
  return `${base}&search_type=keyword_unordered&q=${encodeURIComponent(String(o.name || ""))}`;
}
