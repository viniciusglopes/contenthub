import { describe, expect, it } from "vitest";
import { InstagramClient, classifyError, type FetchLike } from "@/lib/instagram/client";
import { addDays, dayKey, dayRangeUnix, mondayOf } from "@/lib/instagram/dates";
import {
  metricsFor,
  parseAccountTotals,
  parseMediaInsights,
  resolveKind,
  resolveProductType,
  withMediaCounters,
} from "@/lib/instagram/metrics";
import { buildMondayReport, buildXrayReport, fmtPct, suggestAction } from "@/lib/instagram/report";
import {
  type DailyPoint,
  type MediaItem,
  buildDashboard,
  comparePeriods,
  followersDelta,
  lastFullWeek,
  pctChange,
  rankBySavesShares,
} from "@/lib/instagram/stats";
import { establishToken, isProfessionalAccount, planTokenAction, renewToken } from "@/lib/instagram/token";
import { buildCaption, planPublish, publishPost } from "@/lib/instagram/publish";

const DAY = 86_400_000;
const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });

describe("métricas por tipo de mídia", () => {
  it("pede views (nunca impressions/plays) e tempo assistido só em reel", () => {
    for (const t of ["FEED", "REELS", "STORY"] as const) {
      expect(metricsFor(t)).toContain("views");
      expect(metricsFor(t)).not.toContain("impressions");
      expect(metricsFor(t)).not.toContain("plays");
    }
    expect(metricsFor("REELS")).toContain("ig_reels_avg_watch_time");
    expect(metricsFor("FEED")).not.toContain("ig_reels_avg_watch_time");
    expect(metricsFor("FEED")).toEqual(expect.arrayContaining(["reach", "likes", "comments", "saved", "shares", "total_interactions"]));
    expect(metricsFor("STORY")).not.toContain("saved");
  });

  it("descobre o tipo mesmo sem media_product_type", () => {
    expect(resolveProductType({ media_type: "VIDEO", media_product_type: "REELS" })).toBe("REELS");
    expect(resolveProductType({ media_type: "VIDEO" })).toBe("REELS");
    expect(resolveProductType({ media_type: "IMAGE", permalink: "https://www.instagram.com/reel/abc/" })).toBe("REELS");
    expect(resolveProductType({ media_type: "CAROUSEL_ALBUM" })).toBe("FEED");
    expect(resolveKind({ media_type: "CAROUSEL_ALBUM", media_product_type: "FEED" })).toBe("carrossel");
    expect(resolveKind({ media_type: "IMAGE" })).toBe("imagem");
    expect(resolveKind({ media_type: "VIDEO" })).toBe("reel");
  });

  it("lê a resposta de insights e deixa ausente o que a Meta não mandou", () => {
    const m = parseMediaInsights([
      { name: "reach", values: [{ value: 1200 }] },
      { name: "saved", values: [{ value: 40 }] },
      { name: "shares", total_value: { value: 15 } },
      { name: "total_interactions", values: [{ value: 300 }] },
      { name: "ig_reels_avg_watch_time", values: [{ value: 5300 }] },
      { name: "views", values: [] },
      { name: "metrica_nova_desconhecida", values: [{ value: 9 }] },
    ]);
    expect(m).toEqual({ reach: 1200, saved: 40, shares: 15, totalInteractions: 300, avgWatchTimeMs: 5300 });
    expect(withMediaCounters(m, { like_count: 88, comments_count: 7 })).toMatchObject({ likes: 88, comments: 7 });
    expect(withMediaCounters({ likes: 5 }, { like_count: 88 }).likes).toBe(5);
    expect(parseAccountTotals([{ name: "reach", total_value: { value: 10 } }, { name: "views", total_value: { value: 30 } }])).toEqual({ reach: 10, views: 30 });
  });
});

describe("datas em horário de Brasília", () => {
  it("vira o dia às 03:00 UTC", () => {
    expect(dayKey(Date.parse("2026-10-12T02:59:00Z"))).toBe("2026-10-11");
    expect(dayKey(Date.parse("2026-10-12T03:00:00Z"))).toBe("2026-10-12");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    const r = dayRangeUnix("2026-10-12");
    expect(r.since * 1000).toBe(Date.parse("2026-10-12T03:00:00Z"));
    expect(r.until - r.since).toBe(86_400);
    expect(mondayOf("2026-10-12")).toBe("2026-10-12"); // segunda
    expect(mondayOf("2026-10-18")).toBe("2026-10-12"); // domingo
    expect(lastFullWeek("2026-10-12")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
  });
});

function daily(today: string, n: number, f: (i: number) => Partial<DailyPoint>): DailyPoint[] {
  return Array.from({ length: n }, (_, i) => ({ date: addDays(today, -i), ...f(i) }));
}

describe("variações", () => {
  const today = "2026-10-12";
  it("percentual e base zero", () => {
    expect(pctChange(110, 100)).toBeCloseTo(10);
    expect(pctChange(90, 100)).toBeCloseTo(-10);
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(null, 5)).toBeNull();
  });

  it("seguidores em 7 e 30 dias, com histórico completo e parcial", () => {
    const full = daily(today, 40, (i) => ({ followers: 1000 - i * 10 }));
    expect(followersDelta(full, today, 7)).toMatchObject({ start: 930, end: 1000, delta: 70, partial: false });
    expect(followersDelta(full, today, 30)).toMatchObject({ start: 700, delta: 300, partial: false });
    const short = daily(today, 4, (i) => ({ followers: 500 - i }));
    expect(followersDelta(short, today, 7)).toMatchObject({ start: 497, end: 500, delta: 3, partial: true, since: "2026-10-09" });
    expect(followersDelta(daily(today, 1, () => ({ followers: 500 })), today, 7)).toBeNull();
    expect(followersDelta([], today, 7)).toBeNull();
  });

  it("usa o registro anterior mais próximo quando falta o dia exato", () => {
    const d: DailyPoint[] = [
      { date: "2026-10-12", followers: 200 },
      { date: "2026-10-03", followers: 150 },
    ];
    expect(followersDelta(d, today, 7)).toMatchObject({ start: 150, delta: 50, since: "2026-10-03", partial: false });
  });

  it("compara período com o anterior e avisa quando não há base", () => {
    const d = daily("2026-10-11", 14, (i) => ({ reach: i < 7 ? 120 : 100, views: 10 }));
    const c = comparePeriods(d, "reach", "2026-10-11", 7);
    expect(c).toMatchObject({ from: "2026-10-05", current: 840, previous: 700, days: 7 });
    expect(c.pct).toBeCloseTo(20);
    expect(comparePeriods(d.slice(0, 7), "reach", "2026-10-11", 7).pct).toBeNull();
  });
});

const NOW = Date.parse("2026-10-12T15:00:00Z"); // segunda, 12h de Brasília
function media(id: string, daysAgo: number, kind: MediaItem["kind"], saved: number, shares: number, reach = 1000): MediaItem {
  return {
    igId: id,
    kind,
    caption: `Legenda do ${id}`,
    permalink: `https://www.instagram.com/p/${id}/`,
    timestamp: new Date(NOW - daysAgo * DAY).toISOString(),
    metrics: { saved, shares, reach, views: reach * 2, likes: 50, comments: 5 },
  };
}

describe("painel e relatórios", () => {
  const today = dayKey(NOW);
  const d = daily(today, 70, (i) => ({
    followers: 12_500 - i * 20,
    reach: i >= 1 && i <= 7 ? 1100 : 1000, // semana passada 10% acima
    views: i >= 1 && i <= 7 ? 1800 : 2000, // e views 10% abaixo
  }));
  const items = [
    media("A", 2, "reel", 300, 80),
    media("B", 3, "carrossel", 120, 200),
    media("C", 5, "imagem", 10, 5),
    media("D", 20, "reel", 500, 20),
    media("E", 45, "reel", 900, 900), // fora dos 30 dias
  ];

  it("ordena por salvamentos + compartilhamentos e corta em 30 dias", () => {
    expect(rankBySavesShares(items).map((m) => m.igId)).toEqual(["E", "D", "A", "B", "C"]);
    const dash = buildDashboard(d, items, NOW);
    expect(dash.posts30.map((m) => m.igId)).toEqual(["D", "A", "B", "C"]);
    expect(dash.followers).toBe(12_500);
    expect(dash.followers7).toMatchObject({ delta: 140 });
    expect(dash.followers30).toMatchObject({ delta: 600 });
    expect(dash.reach7.pct).toBeCloseTo(10);
    expect(dash.views7.pct).toBeCloseTo(-10);
    expect(dash.series).toHaveLength(30);
  });

  it("relatório da segunda: texto plano, semana fechada, campeões e ação", () => {
    const t = buildMondayReport({ username: "conta", daily: d, media: items, lastSync: new Date(NOW), now: NOW });
    expect(t).toContain("RELATÓRIO DA SEGUNDA: @conta");
    expect(t).toContain("Semana de 05/10 a 11/10");
    expect(t).toContain("Seguidores: 12.340 no início, 12.480 no fim (+140");
    expect(t).toContain("Alcance: 7.700 (+10,0% sobre a semana anterior)");
    expect(t).toContain("Views: 12.600 (-10,0% sobre a semana anterior)");
    expect(t).toContain("Posts publicados na semana: 3");
    expect(t).toMatch(/Mais salvo: "Legenda do A" \(Reel de 10\/10\), 300 salvamentos/);
    expect(t).toMatch(/Mais compartilhado: "Legenda do B" \(Carrossel de 09\/10\), 200 compartilhamentos/);
    expect(t).toContain("Ação sugerida: ");
    expect(t).toContain("podem atrasar até 48h");
    expect(t).toContain("Última sincronização: 12/10 às 12:00");
    expect(t).not.toMatch(/[*_`#—]|\*\*/); // sem markdown e sem travessão
  });

  it("raio-x de 30 dias traz formatos, top 3 e comparação", () => {
    const t = buildXrayReport({ username: "conta", daily: d, media: items, lastSync: null, now: NOW });
    expect(t).toContain("RAIO-X DE 30 DIAS: @conta");
    expect(t).toContain("Período de 12/09 a 11/10");
    expect(t).toContain("Posts publicados: 4");
    expect(t).toContain("Reel: 2 post(s)");
    expect(t).toMatch(/1\. "Legenda do D"/);
    expect(t).toContain("Última sincronização: ainda não feita");
    expect(t).not.toMatch(/[*_`#—]/);
  });

  it("relatório não quebra sem dado nenhum", () => {
    const t = buildMondayReport({ username: "nova", daily: [], media: [], now: NOW });
    expect(t).toContain("ainda sem histórico");
    expect(t).toContain("Alcance: sem dado na semana");
    expect(t).toContain("Nenhum post no período");
    expect(buildXrayReport({ username: "nova", daily: [], media: [], now: NOW })).toContain("Posts publicados: 0");
  });

  it("ação sugerida aponta o formato que rende mais", () => {
    expect(suggestAction([media("A", 1, "reel", 300, 100), media("B", 2, "imagem", 10, 5)], null)).toMatch(/Fazer mais reel/);
    expect(suggestAction([media("A", 1, "reel", 0, 0)], null)).toMatch(/só 1 post/);
    expect(fmtPct(null)).toBe("sem base de comparação");
  });
});

describe("token: troca, validade e renovação", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  it("decide a ação pelo prazo e pela idade", () => {
    const at = (ms: number) => new Date(now + ms);
    expect(planTokenAction({}, now)).toBe("sem_token");
    expect(planTokenAction({ obtainedAt: at(-5 * DAY), expiresAt: at(-1) }, now)).toBe("vencido");
    expect(planTokenAction({ obtainedAt: at(-5 * DAY), expiresAt: at(55 * DAY) }, now)).toBe("ok");
    expect(planTokenAction({ obtainedAt: at(-50 * DAY), expiresAt: at(10 * DAY) }, now)).toBe("renovar");
    // validade presumida: renova assim que a Meta deixar (24h)
    expect(planTokenAction({ obtainedAt: at(-2 * 3_600_000), expiresAt: at(60 * DAY), expiryEstimated: true }, now)).toBe("aguardar_24h");
    expect(planTokenAction({ obtainedAt: at(-25 * 3_600_000), expiresAt: at(59 * DAY), expiryEstimated: true }, now)).toBe("renovar");
  });

  it("troca token curto por longo quando há segredo do app", async () => {
    const calls: string[] = [];
    const f: FetchLike = async (url) => {
      calls.push(url);
      return json({ access_token: "LONGO", token_type: "bearer", expires_in: 5_183_944 });
    };
    const r = await establishToken("CURTO", { appSecret: "segredo", fetchImpl: f, now });
    expect(r).toMatchObject({ token: "LONGO", exchanged: true, expiryEstimated: false });
    expect(r.expiresAt.getTime()).toBe(now + 5_183_944_000);
    expect(calls[0]).toMatch(/^https:\/\/graph\.instagram\.com\/access_token\?/);
    expect(calls[0]).toContain("grant_type=ig_exchange_token");
    expect(calls[0]).toContain("client_secret=segredo");
  });

  it("token já longo (troca recusada) ou sem segredo: guarda e presume 60 dias", async () => {
    const refused: FetchLike = async () => json({ error: { code: 100, message: "already long-lived" } }, false, 400);
    const a = await establishToken("LONGO", { appSecret: "s", fetchImpl: refused, now });
    expect(a).toMatchObject({ token: "LONGO", exchanged: false, expiryEstimated: true });
    expect(a.expiresAt.getTime()).toBe(now + 60 * DAY);
    let called = false;
    const b = await establishToken("LONGO", { fetchImpl: async () => ((called = true), json({})), now });
    expect(called).toBe(false);
    expect(b.expiryEstimated).toBe(true);
  });

  it("renova e passa a ter a validade real", async () => {
    const calls: string[] = [];
    const f: FetchLike = async (url) => (calls.push(url), json({ access_token: "NOVO", expires_in: 5_184_000 }));
    const r = await renewToken("VELHO", { fetchImpl: f, now });
    expect(r).toMatchObject({ token: "NOVO", expiryEstimated: false });
    expect(calls[0]).toContain("/refresh_access_token?");
    expect(calls[0]).toContain("grant_type=ig_refresh_token");
    expect(calls[0]).toContain("access_token=VELHO");
  });

  it("conta pessoal não passa", () => {
    expect(isProfessionalAccount("BUSINESS")).toBe(true);
    expect(isProfessionalAccount("MEDIA_CREATOR")).toBe(true);
    expect(isProfessionalAccount("PERSONAL")).toBe(false);
    expect(isProfessionalAccount(undefined)).toBe(true);
  });
});

describe("cliente e erros amigáveis", () => {
  it("traduz os códigos da Meta", () => {
    expect(classifyError({ code: 190, message: "Invalid OAuth access token" }, 400).kind).toBe("token_invalido");
    expect(classifyError({ code: 10, message: "permission" }, 403).kind).toBe("permissao");
    expect(classifyError({ code: 200 }, 403).kind).toBe("permissao");
    expect(classifyError({ code: 4 }, 400).kind).toBe("limite");
    expect(classifyError({ code: 2 }, 500).kind).toBe("temporario");
    expect(classifyError({ code: 100, message: "bad metric" }, 400).kind).toBe("parametro");
    const e = classifyError({ code: 190, message: "x" }, 400);
    expect(e.friendly).toMatch(/token não é válido/);
    expect(e.friendly).toContain("código 190");
  });

  it("chama /me no host e versão certos e aceita os dois formatos de resposta", async () => {
    let seen = "";
    const flat: FetchLike = async (url) => ((seen = url), json({ user_id: "1", username: "a", account_type: "BUSINESS", followers_count: 9 }));
    expect(await new InstagramClient("T", flat, "v25.0").getMe()).toMatchObject({ userId: "1", username: "a", followersCount: 9 });
    expect(seen).toMatch(/^https:\/\/graph\.instagram\.com\/v25\.0\/me\?fields=/);
    const wrapped: FetchLike = async () => json({ data: [{ user_id: "2", username: "b" }] });
    expect(await new InstagramClient("T", wrapped).getMe()).toMatchObject({ userId: "2", username: "b" });
  });

  it("falha de rede vira mensagem amigável, sem vazar a URL", async () => {
    const f: FetchLike = async () => {
      throw new Error("ECONNRESET https://graph.instagram.com/me?access_token=SEGREDO");
    };
    await expect(new InstagramClient("SEGREDO", f).getMe()).rejects.toMatchObject({ kind: "rede" });
    await new InstagramClient("SEGREDO", f).getMe().catch((e) => expect(String(e.friendly)).not.toContain("SEGREDO"));
  });

  it("lista mídias paginando e para na data de corte", async () => {
    const pages = [
      { data: [{ id: "3", timestamp: "2026-10-10T00:00:00Z" }, { id: "2", timestamp: "2026-10-01T00:00:00Z" }], paging: { cursors: { after: "c1" }, next: "x" } },
      { data: [{ id: "1", timestamp: "2026-06-01T00:00:00Z" }], paging: { cursors: { after: "c2" }, next: "x" } },
    ];
    let n = 0;
    const f: FetchLike = async () => json(pages[n++]);
    const r = await new InstagramClient("T", f).listMedia("9", { sinceMs: Date.parse("2026-09-01T00:00:00Z") });
    expect(r.map((m) => m.id)).toEqual(["3", "2"]);
    expect(n).toBe(2);
  });
});

describe("base de publicação", () => {
  const base = { status: "scheduled", platforms: ["instagram"], caption: "Oi", hashtags: ["#a", "b"], mediaUrls: ["https://x.com/a.jpg"] };

  it("monta a legenda sem repetir hashtag", () => {
    expect(buildCaption({ ...base, format: "post", caption: "Oi #a" })).toBe("Oi #a\n\n#b");
  });

  it("valida status, mídia e formato", () => {
    expect(planPublish({ ...base, format: "post" })).toMatchObject({ ok: true, plan: { kind: "IMAGE" } });
    expect(planPublish({ ...base, format: "reel", mediaUrls: ["https://x.com/v.mp4"] })).toMatchObject({ ok: true, plan: { kind: "REELS" } });
    expect(planPublish({ ...base, format: "carrossel", mediaUrls: ["https://x.com/1.jpg", "https://x.com/2.jpg"] })).toMatchObject({ ok: true, plan: { kind: "CAROUSEL" } });
    const errs = (p: Parameters<typeof planPublish>[0]) => {
      const r = planPublish(p);
      return r.ok ? [] : r.errors.join(" | ");
    };
    expect(errs({ ...base, format: "post", status: "draft" })).toMatch(/Aprovado ou Agendado/);
    expect(errs({ ...base, format: "post", mediaUrls: ["https://x.com/a.png"] })).toMatch(/JPEG/);
    expect(errs({ ...base, format: "post", mediaUrls: ["http://x.com/a.jpg"] })).toMatch(/https/);
    expect(errs({ ...base, format: "post", mediaUrls: [] })).toMatch(/não tem mídia/);
    expect(errs({ ...base, format: "carrossel", mediaUrls: Array(11).fill("https://x.com/a.jpg") })).toMatch(/2 a 10/);
    expect(errs({ ...base, format: "story" })).toMatch(/ainda não é publicado/);
    expect(errs({ ...base, format: "post", platforms: ["tiktok"] })).toMatch(/Instagram/);
    expect(errs({ ...base, format: "post", externalIds: { instagram: "1" } })).toMatch(/já foi publicado/);
  });

  function fakeClient(statuses: string[] = ["FINISHED"], limit = { used: 0, total: 100 }) {
    const calls: [string, unknown][] = [];
    let n = 0;
    return {
      calls,
      client: {
        createContainer: async (_id: string, p: Record<string, unknown>) => (calls.push(["container", p]), `c${++n}`),
        getContainerStatus: async () => statuses.shift() || "FINISHED",
        publishContainer: async (_id: string, c: string) => (calls.push(["publish", c]), "MIDIA1"),
        getPublishingLimit: async () => limit,
      },
    };
  }
  const noSleep = async () => {};

  it("com a chave desligada não chama a Meta", async () => {
    const f = fakeClient();
    await expect(publishPost({ ...base, format: "post" }, { client: f.client, igUserId: "9", enabled: false })).rejects.toThrow(/desligada/);
    expect(f.calls).toHaveLength(0);
  });

  it("imagem: container -> espera -> publish", async () => {
    const f = fakeClient(["IN_PROGRESS", "FINISHED"]);
    const r = await publishPost({ ...base, format: "post" }, { client: f.client, igUserId: "9", enabled: true, sleep: noSleep });
    expect(r).toEqual({ mediaId: "MIDIA1", kind: "IMAGE" });
    expect(f.calls).toEqual([
      ["container", { image_url: "https://x.com/a.jpg", caption: "Oi\n\n#a #b" }],
      ["publish", "c1"],
    ]);
  });

  it("carrossel: filhos primeiro, depois o container pai", async () => {
    const f = fakeClient();
    await publishPost(
      { ...base, format: "carrossel", mediaUrls: ["https://x.com/1.jpg", "https://x.com/2.jpg"] },
      { client: f.client, igUserId: "9", enabled: true, sleep: noSleep }
    );
    expect(f.calls[0][1]).toMatchObject({ is_carousel_item: true });
    expect(f.calls[2][1]).toMatchObject({ media_type: "CAROUSEL", children: "c1,c2" });
    expect(f.calls[3]).toEqual(["publish", "c3"]);
  });

  it("reel usa media_type REELS; erro e limite param antes de publicar", async () => {
    const f = fakeClient(["ERROR"]);
    await expect(
      publishPost({ ...base, format: "reel", mediaUrls: ["https://x.com/v.mp4"] }, { client: f.client, igUserId: "9", enabled: true, sleep: noSleep })
    ).rejects.toThrow(/recusou a mídia/);
    expect(f.calls[0][1]).toMatchObject({ media_type: "REELS", video_url: "https://x.com/v.mp4" });
    expect(f.calls.some((c) => c[0] === "publish")).toBe(false);
    const full = fakeClient([], { used: 100, total: 100 });
    await expect(publishPost({ ...base, format: "post" }, { client: full.client, igUserId: "9", enabled: true })).rejects.toThrow(/Limite/);
    expect(full.calls).toHaveLength(0);
  });
});
