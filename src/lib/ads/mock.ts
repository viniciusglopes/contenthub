/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FetchLike, FetchResponseLike } from "@/lib/instagram/client";
import { addDays, dayKey } from "@/lib/instagram/dates";
import { setMetaFetch } from "./client";
import { setYoutubeFetch } from "@/lib/competitors/youtube";

// META (graph.facebook.com) e YOUTUBE SIMULADOS: modo de demonstração (IG_MOCK=1) e testes.
// Nada aqui sai para a internet.

const rnd = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
const ok = (body: unknown): FetchResponseLike => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number, code: number, message: string): FetchResponseLike => ({ ok: false, status, json: async () => ({ error: { code, message } }) });

export const MOCK_CAMPAIGNS = [
  { id: "120200000000001", name: "VENDAS | Curso | Advantage+", objective: "OUTCOME_SALES", daily_budget: "5000", status: "ACTIVE" },
  { id: "120200000000002", name: "TRÁFEGO | Perfil | Reels", objective: "OUTCOME_TRAFFIC", daily_budget: "2000", status: "ACTIVE" },
  { id: "120200000000003", name: "LEADS | Aula grátis", objective: "OUTCOME_LEADS", lifetime_budget: "60000", status: "PAUSED" },
];
const ADSETS = [
  { id: "120210000000001", campaign_id: "120200000000001", name: "Mulheres 25-45 | Brasil", optimization_goal: "OFFSITE_CONVERSIONS" },
  { id: "120210000000002", campaign_id: "120200000000001", name: "Público semelhante 1%", optimization_goal: "OFFSITE_CONVERSIONS" },
  { id: "120210000000003", campaign_id: "120200000000002", name: "Interesses | Desenvolvimento pessoal", optimization_goal: "LINK_CLICKS" },
  { id: "120210000000004", campaign_id: "120200000000003", name: "Formulário | Brasil", optimization_goal: "LEAD_GENERATION" },
];
const ADS = [
  { id: "120220000000001", adset_id: "120210000000001", name: "CRIATIVO_1 | vídeo depoimento", ig: "1800000000000101" },
  { id: "120220000000002", adset_id: "120210000000001", name: "CRIATIVO_2 | carrossel benefícios", ig: "" },
  { id: "120220000000003", adset_id: "120210000000002", name: "CRIATIVO_1 | vídeo depoimento (LAL)", ig: "1800000000000101" },
  { id: "120220000000004", adset_id: "120210000000003", name: "Reel impulsionado: 3 hábitos", ig: "1800000000000103" },
  { id: "120220000000005", adset_id: "120210000000004", name: "Aula grátis | imagem", ig: "" },
  { id: "120220000000006", adset_id: "120210000000004", name: "Aula grátis | vídeo curto", ig: "" },
];
const campaignOf = (adsetId: string) => ADSETS.find((a) => a.id === adsetId)!.campaign_id;

function dayRow(ad: (typeof ADS)[number], date: string, i: number) {
  const seed = Number(ad.id.slice(-2)) * 1000 + Number(date.replace(/-/g, "").slice(-4));
  const camp = campaignOf(ad.adset_id);
  if (camp === "120200000000003" && i < 20) return null; // campanha de leads pausada há 20 dias
  const spend = 8 + rnd(seed) * 45;
  const impressions = Math.round(spend * (18 + rnd(seed + 1) * 14));
  const reach = Math.round(impressions * (0.62 + rnd(seed + 2) * 0.2));
  const clicks = Math.round(impressions * (0.009 + rnd(seed + 3) * 0.03));
  const link = Math.round(clicks * 0.7);
  const actions: any[] = [{ action_type: "link_click", value: String(link) }];
  const values: any[] = [];
  if (camp === "120200000000001") {
    const p = rnd(seed + 4) < 0.55 ? Math.round(rnd(seed + 5) * 2) + 1 : 0;
    if (p) {
      actions.push({ action_type: "omni_purchase", value: String(p) }, { action_type: "purchase", value: String(p) }, { action_type: "offsite_conversion.fb_pixel_purchase", value: String(p) });
      values.push({ action_type: "omni_purchase", value: String((p * 97).toFixed(2)) });
    }
  }
  if (camp === "120200000000003") {
    const l = Math.round(rnd(seed + 6) * 6);
    if (l) actions.push({ action_type: "lead", value: String(l) }, { action_type: "onsite_conversion.lead_grouped", value: String(l) });
  }
  return {
    date_start: date, date_stop: date, ad_id: ad.id, adset_id: ad.adset_id, campaign_id: camp,
    spend: spend.toFixed(2), impressions: String(impressions), reach: String(reach), clicks: String(clicks), inline_link_clicks: String(link),
    actions, action_values: values,
  };
}

const IG_PROFILES: Record<string, { name: string; followers: number; media: number }> = {
  concorrente_a: { name: "Concorrente A Oficial", followers: 182_400, media: 1430 },
  mentora_b: { name: "Mentora B", followers: 54_900, media: 612 },
  marca_c: { name: "Marca C", followers: 12_380, media: 288 },
};

export function metaMockFetch(now: () => number = Date.now): FetchLike {
  return async (url, init) => {
    const u = new URL(url);
    const token = u.searchParams.get("access_token") || new URLSearchParams(init?.body || "").get("access_token") || "";
    if (/invalido/.test(token)) return fail(400, 190, "Error validating access token");
    const path = u.pathname.replace(/^\/v\d+\.\d+/, "");
    const method = init?.method || "GET";
    if (method === "POST") return ok({ success: true, id: "120220000000099" });
    if (path === "/me") return ok({ id: "100000000000001", name: "Usuário de Demonstração" });
    if (path === "/me/accounts")
      return ok({ data: [{ id: "200000000000001", name: "Página de Demonstração", instagram_business_account: { id: "17841400000000001", username: "contademo" } }] });
    if (path === "/ads_archive") return ok({ data: [] });
    const act = path.match(/^\/(act_\d+)(\/[a-z_]+)?$/);
    if (act) {
      if (act[1] === "act_404") return fail(400, 100, "Unsupported get request. Object with ID 'act_404' does not exist");
      const edge = act[2] || "";
      if (!edge) return ok({ id: act[1], account_id: act[1].slice(4), name: "Conta de anúncio de demonstração", currency: "BRL", timezone_name: "America/Sao_Paulo", account_status: 1 });
      if (edge === "/campaigns") return ok({ data: MOCK_CAMPAIGNS.map((c) => ({ ...c, effective_status: c.status, created_time: "2026-08-01T10:00:00-0300" })) });
      if (edge === "/adsets")
        return ok({ data: ADSETS.map((a) => { const c = MOCK_CAMPAIGNS.find((x) => x.id === a.campaign_id)!; return { ...a, status: "ACTIVE", effective_status: c.status === "PAUSED" ? "CAMPAIGN_PAUSED" : "ACTIVE", created_time: "2026-08-01T10:00:00-0300" }; }) });
      if (edge === "/ads")
        return ok({
          data: ADS.map((a) => {
            const c = MOCK_CAMPAIGNS.find((x) => x.id === campaignOf(a.adset_id))!;
            return {
              id: a.id, name: a.name, adset_id: a.adset_id, campaign_id: c.id, status: "ACTIVE", effective_status: c.status === "PAUSED" ? "CAMPAIGN_PAUSED" : "ACTIVE", created_time: "2026-08-02T10:00:00-0300",
              creative: { id: `9${a.id}`, thumbnail_url: "", ...(a.ig ? { effective_instagram_media_id: a.ig, instagram_permalink_url: `https://www.instagram.com/p/DEMO${a.ig.slice(-3)}/` } : {}) },
            };
          }),
        });
      if (edge === "/insights") {
        const range = JSON.parse(u.searchParams.get("time_range") || "{}");
        const today = dayKey(now());
        const since: string = range.since || addDays(today, -29);
        const until: string = range.until || today;
        if (u.searchParams.get("level") === "account") {
          let total = 0;
          for (let d = since, i = 0; d <= until && i < 400; d = addDays(d, 1), i++) for (const ad of ADS) total += Number(dayRow(ad, d, Math.round((Date.parse(today) - Date.parse(d)) / 86_400_000))?.reach || 0);
          return ok({ data: [{ reach: String(Math.round(total * 0.41)) }] });
        }
        const rows: any[] = [];
        for (let d = since, i = 0; d <= until && i < 400; d = addDays(d, 1), i++) {
          if (d > today) break;
          const age = Math.round((Date.parse(today) - Date.parse(d)) / 86_400_000);
          for (const ad of ADS) {
            const r = dayRow(ad, d, age);
            if (r) rows.push(r);
          }
        }
        // paginação de verdade: 200 por página, com o cursor no link (como a Meta faz)
        const after = Number(u.searchParams.get("after") || 0);
        const page = rows.slice(after, after + 200);
        const next = after + 200 < rows.length ? (() => { const n = new URL(url); n.searchParams.set("after", String(after + 200)); return n.toString(); })() : undefined;
        return ok({ data: page, paging: next ? { next } : {} });
      }
    }
    const bd = path.match(/^\/(\d+)$/);
    if (bd && (u.searchParams.get("fields") || "").startsWith("business_discovery")) {
      const user = (u.searchParams.get("fields") || "").match(/username\(([^)]+)\)/)?.[1] || "";
      const p = IG_PROFILES[user];
      if (!p) return fail(400, 110, "Invalid user id");
      const media = Array.from({ length: 12 }, (_, i) => ({
        id: `1790000000000${i}`, caption: `Post ${i + 1} de ${p.name}: dica rápida sobre o assunto #dica`, like_count: Math.round(p.followers * (0.004 + rnd(i + p.media) * 0.03)),
        comments_count: Math.round(20 + rnd(i * 7 + p.media) * 180), timestamp: new Date(now() - (i * 2.3 + 0.4) * 86_400_000).toISOString().replace("Z", "+0000"),
        media_type: i % 3 === 0 ? "CAROUSEL_ALBUM" : "VIDEO", media_product_type: i % 3 === 0 ? "FEED" : "REELS", permalink: `https://www.instagram.com/p/C${user.slice(0, 3)}${i}/`,
      }));
      return ok({ business_discovery: { username: user, name: p.name, followers_count: p.followers, media_count: p.media, media: { data: media } }, id: bd[1] });
    }
    // CRM (formulário de cadastro da Meta): conferir o token da Página e ler um lead (só leitura)
    if (bd && u.searchParams.get("fields") === "id,name") return ok({ id: bd[1], name: `Página ${bd[1].slice(-4)} (demonstração)` });
    if (bd && (u.searchParams.get("fields") || "").startsWith("id,created_time")) {
      const n = Number(bd[1].slice(-2)) || 1;
      const names = ["Ana Souza", "Bruno Lima", "Carla Dias", "Diego Rocha", "Elisa Prado"];
      return ok({
        id: bd[1], created_time: new Date(now() - n * 3_600_000).toISOString(), ad_id: ADS[n % ADS.length].id, form_id: "880000000000001",
        field_data: [{ name: "full_name", values: [names[n % names.length]] }, { name: "email", values: [`lead${n}@exemplo.com.br`] }, { name: "phone_number", values: [`+5511990${String(n).padStart(6, "0")}`] }],
      });
    }
    return fail(400, 100, `Simulador: caminho não previsto ${path}`);
  };
}

const YT: Record<string, { id: string; title: string; subs: number; videos: number; views: number }> = {
  concorrentea: { id: "UCaaaaaaaaaaaaaaaaaaaaaa", title: "Concorrente A", subs: 412_000, videos: 388, views: 51_200_000 },
  mentorab: { id: "UCbbbbbbbbbbbbbbbbbbbbbb", title: "Mentora B", subs: 38_700, videos: 141, views: 2_930_000 },
};

export function youtubeMockFetch(now: () => number = Date.now): FetchLike {
  return async (url) => {
    const u = new URL(url);
    if ((u.searchParams.get("key") || "").includes("invalida")) return fail(400, 400, "API key not valid. Please pass a valid API key.");
    const ep = u.pathname.split("/").pop();
    if (ep === "channels") {
      const handle = (u.searchParams.get("forHandle") || "").replace(/^@/, "").toLowerCase();
      const id = u.searchParams.get("id") || "";
      const c = Object.values(YT).find((x) => x.id === id) || YT[handle];
      if (!c) return ok({ items: [] });
      return ok({ items: [{ id: c.id, snippet: { title: c.title, customUrl: `@${handle || "canal"}` }, statistics: { subscriberCount: String(c.subs), videoCount: String(c.videos), viewCount: String(c.views) }, contentDetails: { relatedPlaylists: { uploads: `UU${c.id.slice(2)}` } } }] });
    }
    if (ep === "playlistItems") {
      const pl = u.searchParams.get("playlistId") || "";
      return ok({ items: Array.from({ length: 10 }, (_, i) => ({ contentDetails: { videoId: `${pl.slice(2, 6)}vid${i}`, videoPublishedAt: new Date(now() - (i * 3 + 1) * 86_400_000).toISOString() } })) });
    }
    if (ep === "videos") {
      const ids = (u.searchParams.get("id") || "").split(",").filter(Boolean);
      return ok({
        items: ids.map((id, i) => ({
          id, snippet: { title: `Vídeo ${i + 1}: como sair do zero`, publishedAt: new Date(now() - (i * 3 + 1) * 86_400_000).toISOString() },
          statistics: { viewCount: String(Math.round(3000 + rnd(i + id.length) * 90_000)), likeCount: String(Math.round(100 + rnd(i * 3) * 4000)), commentCount: String(Math.round(10 + rnd(i * 5) * 400)) },
          contentDetails: { duration: i % 2 ? "PT9M12S" : "PT48S" },
        })),
      });
    }
    return fail(404, 404, "não previsto");
  };
}

let installed = false;
/** Modo demonstração: liga os simuladores uma vez (só com IG_MOCK=1, que não existe em produção). */
export function ensureAdsMock(): void {
  if (installed || process.env.IG_MOCK !== "1") return;
  setMetaFetch(metaMockFetch());
  setYoutubeFetch(youtubeMockFetch());
  installed = true;
}
