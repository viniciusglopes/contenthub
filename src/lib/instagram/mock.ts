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

// Comentários de exemplo (português informal de Instagram). Autores inventados.
const COMMENT_POOL = [
  "Amei esse conteúdo 😍", "Quanto custa?", "valor?", "Como faço pra agendar?", "@carol.mendes olha isso", "Top demais 👏👏",
  "Será que funciona mesmo? já tentei de tudo", "Muito caro pra mim, infelizmente", "Atende aos sábados?", "🔥🔥🔥", "Manda no direct por favor",
  "Qual o valor da consulta?", "Onde fica? qual cidade?", "Parcelam no cartão?", "Mandei mensagem faz 3 dias e ninguém respondeu", "Perfeito, salvei pra ver depois",
  "Dói muito?", "Quero!! como eu compro?", "Obrigada pela dica 🙏", "Quanto tempo demora pra ver resultado?", "@ju_santos @bia.rocha vamos?",
  "Parabéns pelo trabalho, sensacional", "Tem como passar o whats?", "Renda extra trabalhando de casa, link na minha bio", "Tenho medo de não dar certo",
  "Aceita convênio?", "Ótimo atendimento, só que não né", "Que conteúdo necessário ❤️", "Tem vaga pra essa semana?", "Passa o orçamento por favor",
  "kkkkk eu todinha", "Isso serve pra qualquer idade?", "❤️", "Não gostei do atendimento, demorou demais", "Qual o horário de atendimento?", "Maravilhosa 😍😍",
];
const COMMENT_USERS = ["carol.mendes", "ju_santos", "bia.rocha", "leo.martins", "nanda_alves", "rafa.lima", "dani.souza", "paty_oliveira", "gabi.ferraz", "marcos.tavares", "lu_castro", "tati.nunes", "vivi.araujo", "fe_ribeiro", "duda.pires", "camila.reis"];
const OWNER_REPLIES = ["Te chamei no direct 😉", "Obrigada pelo carinho! ❤️", "Respondemos por mensagem, dá uma olhada lá", "Atendemos sim! Chama no direct que explico tudo"];

/** Lista completa (primeiro nível + respostas) de uma mídia de exemplo, da mais nova para a mais antiga. */
function mockComments(m: MockMedia, owner: string, now: number) {
  const total = Math.min(mediaNumbers(m).comments, 140);
  // Para a demonstração do aviso: a cada 4 mídias, uma não libera nada e outra libera só parte.
  const allowed = m.i % 4 === 1 ? 0 : m.i % 4 === 3 ? Math.round(total * 0.6) : total;
  const out: { id: string; text: string; timestamp: string; username: string; like_count: number; hidden: boolean; replies: { id: string; text: string; timestamp: string; username: string; like_count: number; hidden: boolean; parent_id: string }[] }[] = [];
  let used = 0;
  for (let k = 0; used < allowed; k++) {
    const seed = m.i * 131 + k * 17;
    const ts = Math.min(now - 60_000, m.ts + Math.round((0.3 + rnd(seed + 1) * 70) * 3_600_000));
    const id = `1790${String(m.i).padStart(3, "0")}${String(k).padStart(6, "0")}`;
    const c = { id, text: COMMENT_POOL[Math.floor(rnd(seed + 2) * COMMENT_POOL.length)], timestamp: new Date(ts).toISOString(), username: COMMENT_USERS[Math.floor(rnd(seed + 3) * COMMENT_USERS.length)], like_count: Math.floor(rnd(seed + 4) * 6), hidden: false, replies: [] as (typeof out)[number]["replies"] };
    used++;
    if (used < allowed && rnd(seed + 5) < 0.4) {
      c.replies.push({ id: `${id}1`, text: OWNER_REPLIES[Math.floor(rnd(seed + 6) * OWNER_REPLIES.length)], timestamp: new Date(Math.min(now - 30_000, ts + Math.round((0.2 + rnd(seed + 7) * 9) * 3_600_000))).toISOString(), username: owner, like_count: 0, hidden: false, parent_id: id });
      used++;
    }
    out.push(c);
  }
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
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

    // Login pelo Instagram (demonstração): código -> token curto -> token longo.
    if (u.hostname === "api.instagram.com" && path === "/oauth/access_token") {
      if (/invalido/i.test(params.get("code") || "")) return { ok: false, status: 400, json: async () => ({ error_type: "OAuthException", code: 400, error_message: "Matching code was not found or was already used" }) };
      return ok({ data: [{ access_token: "IGAA-token-curto-do-login-0001", user_id: MOCK_USER_ID, permissions: "instagram_business_basic,instagram_business_manage_insights" }] });
    }
    if (path === "/access_token" && /curto/.test(token))
      return ok({ access_token: token.replace("curto", "longo"), token_type: "bearer", expires_in: 5_183_944 });

    // Token com "conta-<nome>" simula outra conta (para ver dois clientes com dados diferentes).
    const named = /conta-([a-z0-9_.]+)/.exec(token)?.[1];
    const seed = named ? [...named].reduce((n, c) => n + c.charCodeAt(0), 0) : 0;
    if (path === "/me")
      return ok({
        user_id: named ? `178414${String(10_000_000_000 + seed).slice(1)}` : MOCK_USER_ID,
        username: named || "horademudarojogo",
        name: named || "Hora de Mudar o Jogo",
        account_type: /pessoal/i.test(token) ? "PERSONAL" : "MEDIA_CREATOR",
        followers_count: named ? 2400 + ((seed * 37) % 9000) : 12512,
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
    if (m && m[1].startsWith("178414")) {
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

    // Comentários (leitura): 50 por página, mais novos primeiro, respostas por expansão de campo.
    m = /^\/(\d+)\/comments$/.exec(path);
    if (m && (init?.method || "GET") === "GET") {
      const media = list.find((x) => x.id === m![1]);
      if (!media) return fail(100, "Unsupported get request. Object does not exist");
      // token com "padrao" simula o acesso padrão da Meta: 200 com lista vazia
      const all = /padrao/.test(token) ? [] : mockComments(media, named || "horademudarojogo", now);
      const start = Number(params.get("after") || 0);
      const size = Math.min(Number(params.get("limit") || 50), 50);
      const slice = all.slice(start, start + size);
      const withReplies = (params.get("fields") || "").includes("replies");
      const more = start + size < all.length;
      return ok({
        data: slice.map(({ replies, ...c }) => (withReplies && replies.length ? { ...c, replies: { data: replies } } : c)),
        ...(slice.length ? { paging: { cursors: { after: String(start + size) }, ...(more ? { next: "proxima" } : {}) } } : {}),
      });
    }
    if (/^\/\d+\/replies$/.test(path)) return (init?.method || "GET") === "POST" ? ok({ id: `1791${String(Math.round(rnd(now) * 1e9)).padStart(9, "0")}` }) : ok({ data: [] });

    if (/^\/\d+\/media_publish$/.test(path)) return ok({ id: "17900000000009999" });
    if (/^\/\d+\/content_publishing_limit$/.test(path))
      return ok({ data: [{ quota_usage: 2, config: { quota_total: 100, quota_duration: 86400 } }] });
    if (/^\/\d+$/.test(path))
      return ok({ status_code: "FINISHED", id: path.slice(1), permalink: `https://www.instagram.com/p/EXEMPLO${path.slice(-4)}/` });
    return fail(100, "Unsupported request");
  };
}
