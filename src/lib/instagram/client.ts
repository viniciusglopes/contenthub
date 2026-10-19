// Cliente da "Instagram API com login do Instagram" (host graph.instagram.com).
// Conferido na documentação oficial em 12/10/2026: versão v25.0.
// Nunca registrar a URL em log: ela carrega o token.

export const IG_HOST = "https://graph.instagram.com";
export const IG_API_VERSION = process.env.IG_API_VERSION || "v25.0";

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (
  url: string,
  init?: { method?: string; body?: string; headers?: Record<string, string> }
) => Promise<FetchResponseLike>;

export type IgErrorKind =
  | "token_invalido"
  | "permissao"
  | "conta_nao_profissional"
  | "limite"
  | "temporario"
  | "parametro"
  | "rede"
  | "desconhecido";

const FRIENDLY: Record<IgErrorKind, string> = {
  token_invalido:
    "O token não é válido ou já venceu. Gere um novo no painel do app da Meta e cole aqui.",
  permissao:
    "O token não tem a permissão necessária. Gere de novo marcando: instagram_business_basic, instagram_business_manage_insights, instagram_business_manage_comments e instagram_business_content_publish.",
  conta_nao_profissional:
    "Essa conta do Instagram não é profissional. Mude para Empresa ou Criador de conteúdo no app do Instagram e gere o token de novo.",
  limite: "O Instagram pediu para esperar (limite de chamadas atingido). Tente de novo em alguns minutos.",
  temporario: "O Instagram está instável agora. Tente de novo em alguns minutos.",
  parametro: "O Instagram recusou o pedido (dado inválido).",
  rede: "Não foi possível falar com o Instagram. Confira a conexão do servidor e tente de novo.",
  desconhecido: "O Instagram devolveu um erro inesperado.",
};

export class InstagramApiError extends Error {
  kind: IgErrorKind;
  code?: number;
  subcode?: number;
  status?: number;
  metaMessage?: string;
  constructor(kind: IgErrorKind, opts: { code?: number; subcode?: number; status?: number; metaMessage?: string } = {}) {
    super(FRIENDLY[kind]);
    this.name = "InstagramApiError";
    this.kind = kind;
    Object.assign(this, opts);
  }
  /** Mensagem para a tela: em português, com o código da Meta entre parênteses quando ajuda. */
  get friendly(): string {
    const detail =
      (this.kind === "parametro" || this.kind === "desconhecido") && this.metaMessage
        ? ` Detalhe: ${this.metaMessage}`
        : "";
    return `${this.message}${detail}${this.code ? ` (código ${this.code})` : ""}`;
  }
}

export function classifyError(
  err: { code?: number; error_subcode?: number; type?: string; message?: string } | undefined,
  status: number
): InstagramApiError {
  const code = err?.code;
  const msg = err?.message || "";
  const opts = { code, subcode: err?.error_subcode, status, metaMessage: msg };
  if (code === 190 || code === 102 || code === 463 || code === 467)
    return new InstagramApiError("token_invalido", opts);
  if (code === 10 || code === 3 || (code !== undefined && code >= 200 && code <= 299))
    return new InstagramApiError("permissao", opts);
  if (code === 4 || code === 17 || code === 32 || code === 613 || status === 429)
    return new InstagramApiError("limite", opts);
  if (code === 1 || code === 2 || status >= 500) return new InstagramApiError("temporario", opts);
  if (code === 100) return new InstagramApiError("parametro", opts);
  return new InstagramApiError("desconhecido", opts);
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") p.set(k, String(v));
  return p.toString();
}

export interface IgProfile {
  userId: string;
  username: string;
  name?: string;
  accountType?: string;
  followersCount?: number;
  followsCount?: number;
  mediaCount?: number;
  profilePictureUrl?: string;
}

export interface RawMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  timestamp?: string;
  thumbnail_url?: string;
  media_url?: string;
  like_count?: number;
  comments_count?: number;
}

export interface RawComment {
  id: string;
  text?: string;
  timestamp?: string;
  username?: string;
  like_count?: number;
  hidden?: boolean;
  parent_id?: string;
  from?: { id?: string; username?: string };
  replies?: { data?: RawComment[]; paging?: { cursors?: { after?: string }; next?: string } };
}

export interface CommentsPage {
  /** comentários de primeiro nível, cada um com TODAS as respostas que a Meta entregou */
  items: (RawComment & { allReplies: RawComment[] })[];
  /** foi até o fim da paginação (comentários e respostas) */
  complete: boolean;
  pages: number;
  stopped: "paginas" | "chamadas" | null;
}

export interface RawInsight {
  name: string;
  values?: { value?: number | Record<string, number>; end_time?: string }[];
  total_value?: { value?: number };
}

export interface MediaPage {
  items: RawMedia[];
  /** chegou na data de corte ou no fim das mídias */
  complete: boolean;
  pages: number;
  /** por que parou antes do fim: teto de mídias, teto de páginas, ou a Meta limitou/falhou */
  stopped: "max" | "paginas" | "limite" | "temporario" | "rede" | null;
}

const MEDIA_FIELDS_FULL =
  "id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url,like_count,comments_count";
// Conjunto mínimo, caso a Meta recuse algum campo do conjunto completo.
// Comentários (documentação oficial conferida em 12/10/2026: IG Media › comments e IG Comment).
// A lista devolve só o primeiro nível, no máximo 50 por consulta, do mais novo para o mais antigo;
// as respostas vêm por expansão de campo (`replies`) ou por GET /{comentário}/replies.
const COMMENT_FIELDS = "id,text,timestamp,username,like_count,hidden,parent_id";
const COMMENT_FIELDS_FULL = `${COMMENT_FIELDS},replies.limit(50){${COMMENT_FIELDS}}`;
const COMMENT_FIELDS_SAFE = "id,text,timestamp,username,like_count";
export const COMMENTS_PAGE_SIZE = 50;

const MEDIA_FIELDS_SAFE = "id,media_type,permalink,timestamp,thumbnail_url,media_url,like_count,comments_count";

export class InstagramClient {
  /** Chamadas feitas à Meta por este cliente (para o limite de segurança do histórico). */
  calls = 0;

  constructor(
    private token: string,
    private fetchImpl: FetchLike = getDefaultFetch(),
    private version: string = IG_API_VERSION
  ) {}

  private async call<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined> = {},
    method: "GET" | "POST" = "GET",
    versioned = true
  ): Promise<T> {
    const base = `${IG_HOST}${versioned ? `/${this.version}` : ""}${path}`;
    const all = { ...params, access_token: this.token };
    let res: FetchResponseLike;
    this.calls++;
    try {
      res =
        method === "GET"
          ? await this.fetchImpl(`${base}?${qs(all)}`)
          : await this.fetchImpl(base, {
              method: "POST",
              body: qs(all),
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });
    } catch {
      throw new InstagramApiError("rede");
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* corpo vazio */
    }
    const b = body as { error?: Parameters<typeof classifyError>[0] } | null;
    if (!res.ok || b?.error) throw classifyError(b?.error, res.status);
    return body as T;
  }

  async getMe(): Promise<IgProfile> {
    const r = await this.call<Record<string, unknown> & { data?: Record<string, unknown>[] }>("/me", {
      fields: "user_id,username,name,account_type,followers_count,follows_count,media_count,profile_picture_url",
    });
    const d = (Array.isArray(r.data) ? r.data[0] : r) as Record<string, unknown>;
    return {
      userId: String(d.user_id ?? d.id ?? ""),
      username: String(d.username ?? ""),
      name: d.name as string | undefined,
      accountType: d.account_type as string | undefined,
      followersCount: d.followers_count as number | undefined,
      followsCount: d.follows_count as number | undefined,
      mediaCount: d.media_count as number | undefined,
      profilePictureUrl: d.profile_picture_url as string | undefined,
    };
  }

  /** Troca token curto (1h) por longo (60 dias). Só no servidor: usa o segredo do app. */
  async exchangeForLongLived(appSecret: string): Promise<{ accessToken: string; expiresIn: number }> {
    const r = await this.call<{ access_token: string; expires_in: number }>(
      "/access_token",
      { grant_type: "ig_exchange_token", client_secret: appSecret },
      "GET",
      false
    );
    return { accessToken: r.access_token, expiresIn: r.expires_in };
  }

  /** Renova token longo. A Meta exige: token com mais de 24h e ainda não vencido. */
  async refreshLongLived(): Promise<{ accessToken: string; expiresIn: number }> {
    const r = await this.call<{ access_token: string; expires_in: number }>(
      "/refresh_access_token",
      { grant_type: "ig_refresh_token" },
      "GET",
      false
    );
    return { accessToken: r.access_token, expiresIn: r.expires_in };
  }

  /** Lista mídias da mais nova para a mais antiga, parando em `sinceMs` ou em `max`. */
  async listMedia(igUserId: string, opts: { sinceMs?: number; max?: number } = {}): Promise<RawMedia[]> {
    const r = await this.listMediaPaged(igUserId, { ...opts, tolerant: false });
    return r.items;
  }

  /**
   * Paginação com limites de segurança, para o histórico.
   * `complete` = chegou na data de corte (ou no fim das mídias da conta).
   * Com `tolerant`, limite de taxa / instabilidade DEPOIS da primeira página não joga fora o que
   * já veio: devolve o que tem e diz por que parou em `stopped`.
   */
  async listMediaPaged(
    igUserId: string,
    opts: { sinceMs?: number; max?: number; maxPages?: number; pageSize?: number; tolerant?: boolean } = {}
  ): Promise<MediaPage> {
    const max = opts.max ?? 200;
    const maxPages = opts.maxPages ?? 20;
    const out: RawMedia[] = [];
    let after: string | undefined;
    let fields = MEDIA_FIELDS_FULL;
    let pages = 0;
    let complete = false;
    let stopped: MediaPage["stopped"] = null;
    for (let page = 0; ; page++) {
      if (out.length >= max) {
        stopped = "max";
        break;
      }
      if (page >= maxPages) {
        stopped = "paginas";
        break;
      }
      let r: { data?: RawMedia[]; paging?: { cursors?: { after?: string }; next?: string } };
      try {
        r = await this.call(`/${igUserId}/media`, { fields, limit: opts.pageSize ?? 50, after });
      } catch (e) {
        if (e instanceof InstagramApiError && e.kind === "parametro" && fields === MEDIA_FIELDS_FULL) {
          fields = MEDIA_FIELDS_SAFE;
          page--;
          continue;
        }
        if (opts.tolerant && pages > 0 && e instanceof InstagramApiError && (e.kind === "limite" || e.kind === "temporario" || e.kind === "rede")) {
          stopped = e.kind;
          break;
        }
        throw e;
      }
      pages++;
      const items = r.data || [];
      let reachedOld = false;
      for (const m of items) {
        if (opts.sinceMs && m.timestamp && new Date(m.timestamp).getTime() < opts.sinceMs) {
          reachedOld = true;
          break;
        }
        if (out.length >= max) break;
        out.push(m);
      }
      after = r.paging?.cursors?.after;
      if (reachedOld || !r.paging?.next || !after || items.length === 0) {
        complete = true;
        break;
      }
    }
    return { items: out, complete, pages, stopped };
  }

  async getMediaInsights(mediaId: string, metrics: string[]): Promise<RawInsight[]> {
    const r = await this.call<{ data?: RawInsight[] }>(`/${mediaId}/insights`, { metric: metrics.join(",") });
    return r.data || [];
  }

  /** Totais da conta num intervalo (um dia por chamada para montar o histórico diário). */
  async getAccountTotals(igUserId: string, sinceUnix: number, untilUnix: number): Promise<RawInsight[]> {
    const r = await this.call<{ data?: RawInsight[] }>(`/${igUserId}/insights`, {
      metric: "reach,views",
      period: "day",
      metric_type: "total_value",
      since: sinceUnix,
      until: untilUnix,
    });
    return r.data || [];
  }

  // ---- Comentários (leitura) ----

  /**
   * Comentários de UMA mídia com as respostas, paginando. Só leitura.
   * `budget()` devolve quantas chamadas ainda podem ser feitas: ao zerar, para e avisa em `stopped`.
   */
  async listComments(mediaId: string, opts: { maxPages?: number; budget?: () => number } = {}): Promise<CommentsPage> {
    const maxPages = opts.maxPages ?? 40;
    const left = opts.budget ?? (() => Infinity);
    type Page = { data?: RawComment[]; paging?: { cursors?: { after?: string }; next?: string } };
    const items: CommentsPage["items"] = [];
    let fields = COMMENT_FIELDS_FULL;
    let after: string | undefined;
    let pages = 0;
    let stopped: CommentsPage["stopped"] = null;
    let complete = false;
    for (;;) {
      if (pages >= maxPages) { stopped = "paginas"; break; }
      if (left() <= 0) { stopped = "chamadas"; break; }
      let r: Page;
      try {
        r = await this.call<Page>(`/${mediaId}/comments`, { fields, limit: COMMENTS_PAGE_SIZE, after });
      } catch (e) {
        // A Meta recusou algum campo: tenta de novo só com o conjunto mínimo.
        if (e instanceof InstagramApiError && e.kind === "parametro" && fields === COMMENT_FIELDS_FULL && pages === 0) {
          fields = COMMENT_FIELDS_SAFE;
          continue;
        }
        throw e;
      }
      pages++;
      for (const c of r.data || []) {
        const allReplies = [...(c.replies?.data || [])];
        // mais respostas do que couberam na expansão: busca o restante na borda /replies
        let rAfter = c.replies?.paging?.next ? c.replies.paging.cursors?.after : undefined;
        while (rAfter) {
          if (left() <= 0) { stopped = "chamadas"; break; }
          const rr = await this.call<Page>(`/${c.id}/replies`, { fields: COMMENT_FIELDS, limit: COMMENTS_PAGE_SIZE, after: rAfter });
          allReplies.push(...(rr.data || []));
          rAfter = rr.paging?.next ? rr.paging.cursors?.after : undefined;
        }
        items.push({ ...c, allReplies });
        if (stopped) break;
      }
      if (stopped) break;
      after = r.paging?.cursors?.after;
      if (!r.paging?.next || !after || (r.data || []).length === 0) { complete = true; break; }
    }
    return { items, complete, pages, stopped };
  }

  /** Resposta PÚBLICA a um comentário. ESCRITA: só é chamada com as duas chaves de resposta ligadas. */
  async replyToComment(commentId: string, message: string): Promise<string> {
    const r = await this.call<{ id: string }>(`/${commentId}/replies`, { message }, "POST");
    return r.id;
  }

  // ---- Mensagens (automações do direct). ESCRITA: só com as três chaves de automação ligadas
  // e fora do modo ensaio. Documentação oficial lida em 18/10/2026:
  //   POST /<IG_ID>/messages  recipient {id: IGSID} (dentro das 24h) ou {comment_id} (private reply,
  //   1 por comentário, até 7 dias). Nunca mandamos `tag` (HUMAN_AGENT exige App Review e humano).

  async sendMessage(igUserId: string, recipient: { id: string } | { comment_id: string }, message: Record<string, unknown>): Promise<{ messageId: string; recipientId: string }> {
    const r = await this.call<{ message_id?: string; recipient_id?: string }>(
      `/${igUserId}/messages`,
      { recipient: JSON.stringify(recipient), message: JSON.stringify(message) },
      "POST"
    );
    return { messageId: String(r.message_id || ""), recipientId: String(r.recipient_id || "") };
  }

  /** Liga o webhook do app para esta conta (comments, messages, messaging_postbacks). ESCRITA. */
  async subscribeApp(fields: string[]): Promise<boolean> {
    const r = await this.call<{ success?: boolean }>("/me/subscribed_apps", { subscribed_fields: fields.join(",") }, "POST");
    return r.success === true;
  }

  /** Data de publicação de uma mídia (para o escopo "próximo post"). Só leitura. */
  async getMediaTimestamp(mediaId: string): Promise<string> {
    const r = await this.call<{ timestamp?: string }>(`/${mediaId}`, { fields: "timestamp" });
    return r.timestamp || "";
  }

  // ---- Publicação (container -> publish) ----

  async createContainer(igUserId: string, params: Record<string, string | boolean | undefined>): Promise<string> {
    const r = await this.call<{ id: string }>(`/${igUserId}/media`, params, "POST");
    return r.id;
  }

  async getContainerStatus(containerId: string): Promise<string> {
    const r = await this.call<{ status_code?: string }>(`/${containerId}`, { fields: "status_code" });
    return r.status_code || "IN_PROGRESS";
  }

  async publishContainer(igUserId: string, creationId: string): Promise<string> {
    const r = await this.call<{ id: string }>(`/${igUserId}/media_publish`, { creation_id: creationId }, "POST");
    return r.id;
  }

  /** Link público de uma mídia já publicada. */
  async getPermalink(mediaId: string): Promise<string> {
    const r = await this.call<{ permalink?: string }>(`/${mediaId}`, { fields: "permalink" });
    return r.permalink || "";
  }

  async getPublishingLimit(igUserId: string): Promise<{ used: number; total: number }> {
    const r = await this.call<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>(
      `/${igUserId}/content_publishing_limit`,
      { fields: "quota_usage,config" }
    );
    const d = r.data?.[0];
    // A documentação cita 100 e, em outro trecho, 50 por 24h; vale o que a própria API informar.
    return { used: d?.quota_usage ?? 0, total: d?.config?.quota_total ?? 50 };
  }
}

let overrideFetch: FetchLike | null = null;
/** Usado pelo modo de demonstração (IG_MOCK=1) e pelos testes. */
export function setFetchOverride(f: FetchLike | null) {
  overrideFetch = f;
}
export function getDefaultFetch(): FetchLike {
  if (overrideFetch) return overrideFetch;
  return (url, init) => fetch(url, { ...init, cache: "no-store" }) as Promise<FetchResponseLike>;
}
