import { type FetchLike, type FetchResponseLike, setFetchOverride } from "./client";

// MODO DEMONSTRAÇÃO (IG_MOCK=1): responde no lugar da Meta com dados de exemplo.
// Serve para ver as telas antes de existir token. Nada sai para a internet.

export function mockEnabled(): boolean {
  return process.env.IG_MOCK === "1";
}

let installed = false;
export function ensureMock(): void {
  if (mockEnabled() && !installed) {
    setFetchOverride(mockFetch());
    installed = true;
  }
}

const rnd = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const CAPTIONS = [
  "3 hábitos de manhã que mudam o seu dia inteiro (salva pra não esquecer)",
  "Você não está atrasada. Você está no seu tempo.",
  "O erro que te faz desistir na segunda semana",
  "Checklist: 5 perguntas antes de dizer sim",
  "Disciplina não é castigo, é cuidado com quem você vai ser",
  "Como recomeçar depois de um dia ruim",
  "Para de esperar a motivação chegar",
  "7 frases para ler quando bater o desânimo",
  "Rotina simples de 20 minutos para quem não tem tempo",
  "O que ninguém conta sobre constância",
  "Guarde este passo a passo para organizar a semana",
  "Pequenas vitórias também contam",
  "Antes e depois de 30 dias de foco",
  "Manda para aquela amiga que precisa ouvir isso hoje",
  "Planejar o domingo muda a segunda",
  "Um lembrete para quando você pensar em parar",
  "4 sinais de que você está evoluindo e não percebeu",
  "Meta sem prazo é só desejo",
  "O método das 3 tarefas que salvou minha agenda",
  "Hoje é dia de fazer o básico bem feito",
  "Por que comparar a sua jornada atrasa você",
  "Lista de leitura: 5 livros que mudam o jogo",
  "Respira. Recomeça. Repete.",
  "Como dizer não sem culpa",
  "O que eu faria diferente se começasse hoje",
  "Sua versão de daqui a um ano agradece",
];

const COLORS = ["#f5c518", "#a855f7", "#06b6d4", "#f97316", "#22c55e", "#ec4899"];

function thumb(i: number): string {
  const a = COLORS[i % COLORS.length];
  const b = COLORS[(i + 2) % COLORS.length];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs><rect width='96' height='96' fill='url(#g)'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const MOCK_USER_ID = "17841400000000001";

interface MockMedia {
  id: string;
  i: number;
  type: "VIDEO" | "CAROUSEL_ALBUM" | "IMAGE";
  product: "REELS" | "FEED";
  ts: number;
}

function mockMedia(now: number): MockMedia[] {
  return CAPTIONS.map((_, i) => {
    const type = i % 3 === 0 ? "VIDEO" : i % 3 === 1 ? "CAROUSEL_ALBUM" : "IMAGE";
    return {
      id: `1800000000000${String(100 + i)}`,
      i,
      type: type as MockMedia["type"],
      product: type === "VIDEO" ? "REELS" : "FEED",
      ts: now - Math.round((i * 1.7 + 0.4) * 86_400_000),
    };
  });
}

function mediaNumbers(m: MockMedia) {
  const boost = m.type === "VIDEO" ? 2.4 : m.type === "CAROUSEL_ALBUM" ? 1.5 : 1;
  const hit = m.i === 4 || m.i === 9 ? 3.2 : 1;
  const reach = Math.round((1800 + rnd(m.i + 1) * 5200) * boost * hit);
  const likes = Math.round(reach * (0.045 + rnd(m.i + 7) * 0.04));
  const comments = Math.round(likes * (0.03 + rnd(m.i + 13) * 0.05));
  const saved = Math.round(reach * (0.008 + rnd(m.i + 21) * 0.03) * (m.type === "CAROUSEL_ALBUM" ? 2 : 1));
  const shares = Math.round(reach * (0.004 + rnd(m.i + 33) * 0.025) * (m.type === "VIDEO" ? 1.8 : 1));
  return {
    reach,
    views: Math.round(reach * (1.3 + rnd(m.i + 41) * 0.9)),
    likes,
    comments,
    saved,
    shares,
    total_interactions: likes + comments + saved + shares,
    ig_reels_avg_watch_time: Math.round(4200 + rnd(m.i + 55) * 9000),
    ig_reels_video_view_total_time: Math.round(reach * (5000 + rnd(m.i + 61) * 6000)),
  } as Record<string, number>;
}

function ok(body: unknown): FetchResponseLike {
  return { ok: true, status: 200, json: async () => body };
}
function fail(code: number, message: string, status = 400): FetchResponseLike {
  return { ok: false, status, json: async () => ({ error: { code, message, type: "OAuthException" } }) };
}

export function mockFetch(nowFn: () => number = Date.now): FetchLike {
  return async (url, init) => {
    const u = new URL(url);
    const params = init?.body ? new URLSearchParams(init.body) : u.searchParams;
    const token = params.get("access_token") || "";
    const path = u.pathname.replace(/^\/v\d+\.\d+/, "");
    const now = nowFn();
    if (/invalido/i.test(token)) return fail(190, "Invalid OAuth access token - Cannot parse access token", 400);

    if (path === "/me")
      return ok({
        user_id: MOCK_USER_ID,
        username: "horademudarojogo",
        name: "Hora de Mudar o Jogo",
        account_type: /pessoal/i.test(token) ? "PERSONAL" : "MEDIA_CREATOR",
        followers_count: 12512,
        follows_count: 310,
        media_count: 240,
      });
    if (path === "/access_token") return fail(100, "Token is already long-lived");
    if (path === "/refresh_access_token")
      return ok({ access_token: `${token.replace(/-r\d+$/, "")}-r${now}`, token_type: "bearer", expires_in: 5_184_000 });

    const list = mockMedia(now);
    let m = /^\/(\d+)\/media$/.exec(path);
    if (m && (init?.method || "GET") === "GET")
      return ok({
        data: list.map((x) => ({
          id: x.id,
          caption: `${CAPTIONS[x.i]}\n\n#horademudarojogo #mentalidade`,
          media_type: x.type,
          media_product_type: x.product,
          permalink: `https://www.instagram.com/${x.product === "REELS" ? "reel" : "p"}/EXEMPLO${x.i}/`,
          timestamp: new Date(x.ts).toISOString(),
          thumbnail_url: thumb(x.i),
          media_url: thumb(x.i),
          like_count: mediaNumbers(x).likes,
          comments_count: mediaNumbers(x).comments,
        })),
        paging: { cursors: { after: "fim" } },
      });
    if (m) return ok({ id: `1790000000000${Math.round(rnd(now) * 1000)}` });

    m = /^\/(\d+)\/insights$/.exec(path);
    if (m && m[1] === MOCK_USER_ID) {
      const day = Math.floor(Number(params.get("since") || 0) / 86_400);
      const trend = 1 + ((day % 60) / 60) * 0.25;
      const weekend = [0, 6].includes(new Date(day * 86_400_000).getUTCDay()) ? 0.8 : 1;
      const reach = Math.round((5200 + rnd(day) * 3800) * trend * weekend);
      return ok({
        data: [
          { name: "reach", period: "day", total_value: { value: reach } },
          { name: "views", period: "day", total_value: { value: Math.round(reach * (1.9 + rnd(day + 3) * 0.6)) } },
        ],
      });
    }
    if (m) {
      const media = list.find((x) => x.id === m![1]);
      if (!media) return fail(100, "Unsupported get request. Object does not exist");
      const nums = mediaNumbers(media);
      const wanted = (params.get("metric") || "").split(",");
      return ok({
        data: wanted
          .filter((k) => k in nums && (media.product === "REELS" || !k.startsWith("ig_reels")))
          .map((k) => ({ name: k, period: "lifetime", values: [{ value: nums[k] }] })),
      });
    }

    if (/^\/\d+\/media_publish$/.test(path)) return ok({ id: "17900000000009999" });
    if (/^\/\d+\/content_publishing_limit$/.test(path))
      return ok({ data: [{ quota_usage: 2, config: { quota_total: 100, quota_duration: 86400 } }] });
    if (/^\/\d+$/.test(path)) return ok({ status_code: "FINISHED", id: path.slice(1) });
    return fail(100, "Unsupported request");
  };
}
