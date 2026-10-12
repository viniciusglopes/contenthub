// Tipos e rótulos do fluxo do post, usados pelo calendário, pelo formulário, pelo detalhe e pela fila.

export interface MediaItem {
  _id: string;
  kind: "image" | "video";
  url: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  originalName: string;
  fit: string;
  problems: { code: string; level: "erro" | "aviso"; message: string }[];
}

export interface ProjectLite { _id: string; name: string; slug?: string; color: string; icon: string; platforms?: string[] }

export interface PostT {
  _id: string;
  project: ProjectLite;
  title: string;
  content: string;
  caption: string;
  format: string;
  platforms: string[];
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  tags: string[];
  hashtags: string[];
  cta: string;
  productionNotes: string;
  media?: MediaItem[];
  publishAt?: string | null;
  approval?: { byName: string; at: string | null };
  review?: { requestedByName: string; requestedAt: string | null; note: string; noteByName: string; noteAt: string | null };
  publish?: { lastError: string; lastErrorKind: string; waitNote: string; uncertain: boolean; publishedAt: string | null; nextAttemptAt: string | null; attempts: number };
  history?: { at: string; type: string; by: string; note: string }[];
  externalIds?: Record<string, string>;
}

export interface Publishing { global: boolean; org: boolean; on: boolean; message: string }
export interface CheckItem { key: string; ok: boolean; label: string; detail: string }

// "approved" é do fluxo antigo (sem registro de quem aprovou): aparece como aguardando aprovação.
export const flowStatus = (s: string) => (s === "approved" ? "pending" : s);

export const STATUS: Record<string, { label: string; chip: string; dot: string; mark: string }> = {
  draft: { label: "Rascunho", chip: "bg-gray-500/20 text-gray-300", dot: "bg-gray-500", mark: "✎" },
  pending: { label: "Aguardando aprovação", chip: "bg-amber-500/20 text-amber-300", dot: "bg-amber-400", mark: "⏳" },
  scheduled: { label: "Aprovado · agendado", chip: "bg-sky-500/20 text-sky-300", dot: "bg-sky-400", mark: "🕒" },
  publishing: { label: "Publicando", chip: "bg-indigo-500/20 text-indigo-300", dot: "bg-indigo-400", mark: "⬆" },
  posted: { label: "Publicado", chip: "bg-green-500/20 text-green-400", dot: "bg-green-500", mark: "✓" },
  failed: { label: "Falhou", chip: "bg-red-500/20 text-red-300", dot: "bg-red-500", mark: "!" },
  missed: { label: "Perdeu o horário", chip: "bg-orange-500/20 text-orange-300", dot: "bg-orange-500", mark: "!" },
};
export const STATUS_ORDER = ["draft", "pending", "scheduled", "posted", "failed", "missed"];
export const statusOf = (s: string) => STATUS[flowStatus(s)] || STATUS.draft;

export const FORMATS: Record<string, { label: string; hint: string; auto: boolean }> = {
  post: { label: "Post (1 imagem)", hint: "1 imagem", auto: true },
  carrossel: { label: "Carrossel", hint: "de 2 a 10 imagens ou vídeos", auto: true },
  reel: { label: "Reel (vídeo)", hint: "1 vídeo em pé, de 3 segundos a 15 minutos", auto: true },
  story: { label: "Story", hint: "ainda não sai sozinho", auto: false },
  shorts: { label: "Shorts", hint: "ainda não sai sozinho", auto: false },
};

/** "14/10 às 09:00" a partir do dia e do horário do post (horário de Brasília). */
export function whenText(post: { scheduledDate: string; scheduledTime: string }): string {
  const [, m, d] = (post.scheduledDate || "").slice(0, 10).split("-");
  return d && m ? `${d}/${m} às ${post.scheduledTime}` : "";
}

const fmtAt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", " às") : "";
export { fmtAt };

/** Frase curta do estado: "Sai em 14/10 às 09:00", "Publicado em ...", "Falhou: ...". */
export function stateLine(post: PostT, publishing?: Publishing | null): string {
  const s = flowStatus(post.status);
  const when = whenText(post);
  if (s === "scheduled") {
    if (post.publish?.waitNote) return post.publish.waitNote;
    return publishing && !publishing.on ? `Agendado para ${when} · publicação automática desligada` : `Sai em ${when}`;
  }
  if (s === "pending") return `Aguardando aprovação · marcado para ${when}`;
  if (s === "publishing") return "Publicando agora";
  if (s === "posted") return post.publish?.publishedAt ? `Publicado em ${fmtAt(post.publish.publishedAt)}` : "Publicado";
  if (s === "failed") return "Não foi publicado";
  if (s === "missed") return `Perdeu o horário de ${when}`;
  return `Rascunho · marcado para ${when}`;
}

export const HISTORY_LABEL: Record<string, string> = {
  criado: "Criado",
  editado: "Editado",
  pedido: "Pediu aprovação",
  aprovado: "Aprovado",
  ajuste: "Pediu ajuste",
  voltou_aprovacao: "Editado depois de aprovado",
  rascunho: "Voltou para rascunho",
  tentar_de_novo: "Mandou publicar de novo",
  marcado_publicado: "Marcado como publicado",
  publicado: "Publicado no Instagram",
  falhou: "Falhou",
  perdeu: "Perdeu o horário",
};

export const fmtSize = (n: number) => (!n ? "0 MB" : n >= 1024 ** 3 ? `${(n / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const fmtDuration = (ms: number | null) => (ms == null ? "" : `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}`);
