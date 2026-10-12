"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { fieldCls, primaryBtn } from "@/components/brand";
import { send } from "@/components/http";
import { IG_LIMITS } from "@/lib/media/specs";
import MediaUploader from "./MediaUploader";
import PhonePreview, { finalCaption } from "./PhonePreview";
import { FORMATS, type MediaItem, type PostT, type ProjectLite, type Publishing, flowStatus } from "./flow";

const PLATFORMS = ["instagram", "tiktok", "youtube", "facebook", "twitter"];
// padrão de um post novo: amanhã às 09:00 (hoje às 09:00 quase sempre já passou)
const tomorrow = () => new Date(Date.now() - 3 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);

// Formulário do post: dados, mídia e a prévia no celular lado a lado. UM botão Salvar.
// Depois de salvar abre o detalhe, onde ficam "Pedir aprovação" / "Aprovar e agendar".
export default function PostForm({
  post, projects, defaultProject, defaultDate, usernames, publishing, onClose, onSaved,
}: {
  post: PostT | null;
  projects: ProjectLite[];
  defaultProject?: string;
  defaultDate?: string;
  /** @usuario do Instagram por projeto, para a prévia */
  usernames: Record<string, string>;
  publishing?: Publishing | null;
  onClose: () => void;
  onSaved: (post: PostT) => void;
}) {
  const [f, setF] = useState({
    project: post?.project?._id || defaultProject || (projects.length === 1 ? projects[0]._id : ""),
    title: post?.title || "",
    format: post?.format || "post",
    scheduledDate: post?.scheduledDate?.slice(0, 10) || defaultDate || tomorrow(),
    scheduledTime: post?.scheduledTime || "09:00",
    platforms: post?.platforms?.length ? post.platforms : ["instagram"],
    caption: post?.caption || "",
    hashtags: (post?.hashtags || []).join(" "),
    content: post?.content || "",
    productionNotes: post?.productionNotes || "",
    cta: post?.cta || "",
  });
  const [media, setMedia] = useState<MediaItem[]>(post?.media || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ msg: string; field?: string } | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const hashtags = f.hashtags.split(/\s+/).filter(Boolean);
  const full = finalCaption(f.caption, hashtags);
  const tagCount = (full.match(/#[\p{L}\p{N}_]+/gu) || []).length;
  const over = full.length > IG_LIMITS.caption.chars;
  const status = post ? flowStatus(post.status) : "draft";
  const wasApproved = ["scheduled", "failed", "missed"].includes(status);
  const fmt = FORMATS[f.format];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = { ...f, hashtags, media: media.map((m) => m._id) };
    const r = post ? await send<PostT>("PUT", `/api/posts/${post._id}`, body) : await send<PostT>("POST", "/api/posts", body);
    setSaving(false);
    if (!r.ok || !r.data) return setError({ msg: r.error, field: r.field });
    onSaved(r.data);
  }

  const label = "text-xs text-gray-400";
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full max-w-4xl max-h-[94dvh] flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={post ? "Editar post" : "Novo post"} data-testid="post-form">
        <div className="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
          <h3 className="font-bold text-white">{post ? "Editar post" : "Novo post"}</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-800 rounded" aria-label="Fechar"><X size={18} /></button>
        </div>
        <form onSubmit={save} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-auto md:grid md:grid-cols-[minmax(0,1fr)_340px]">
            <div className="p-4 space-y-3">
              {wasApproved && <p className="text-xs text-gray-300 bg-gray-800 rounded-lg px-3 py-2" role="status">Este post já foi aprovado. Ao salvar uma mudança, ele volta para <strong>aguardando aprovação</strong>.</p>}
              {post?.review?.note && status === "draft" && <p className="text-xs text-amber-200 bg-amber-500/10 rounded-lg px-3 py-2" role="status"><strong>{post.review.noteByName || "O dono"} pediu ajuste:</strong> {post.review.note}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pf-project" className={label}>Projeto</label>
                  <select id="pf-project" value={f.project} onChange={(e) => set("project", e.target.value)} required className={fieldCls(error?.field === "project")}>
                    <option value="">Selecione...</option>
                    {projects.map((p) => <option key={p._id} value={p._id}>{p.icon} {p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="pf-format" className={label}>Formato</label>
                  <select id="pf-format" value={f.format} onChange={(e) => set("format", e.target.value)} className={fieldCls()}>
                    {Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="pf-title" className={label}>Título (só para a equipe, não vai para o Instagram)</label>
                <input id="pf-title" value={f.title} onChange={(e) => set("title", e.target.value)} required maxLength={160} className={fieldCls(error?.field === "title")} />
              </div>

              <div>
                <span className={label}>Mídia · {fmt?.hint}</span>
                <div className="mt-1"><MediaUploader items={media} onChange={setMedia} format={f.format} /></div>
                {fmt && !fmt.auto && <p className="mt-1 text-xs text-gray-400">Esse formato ainda não sai sozinho: o post fica no calendário e você publica por fora.</p>}
              </div>

              <div>
                <div className="flex items-end justify-between">
                  <label htmlFor="pf-caption" className={label}>Legenda</label>
                  <span className={`text-[11px] tabular-nums ${over || tagCount > IG_LIMITS.caption.hashtags ? "text-red-400" : "text-gray-500"}`} data-testid="caption-count">
                    {full.length.toLocaleString("pt-BR")} de 2.200 · {tagCount} de 30 hashtags
                  </span>
                </div>
                <textarea id="pf-caption" rows={5} value={f.caption} onChange={(e) => set("caption", e.target.value)} className={fieldCls(over)} />
                {over && <p className="text-xs text-red-400 mt-1" role="alert">A legenda passou do limite do Instagram. Tire {(full.length - IG_LIMITS.caption.chars).toLocaleString("pt-BR")} caracteres.</p>}
              </div>
              <div>
                <label htmlFor="pf-hashtags" className={label}>Hashtags (separadas por espaço; entram no fim da legenda)</label>
                <input id="pf-hashtags" value={f.hashtags} onChange={(e) => set("hashtags", e.target.value)} className={fieldCls()} placeholder="#suamarca #dica" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pf-date" className={label}>Dia</label>
                  <input id="pf-date" type="date" value={f.scheduledDate} onChange={(e) => set("scheduledDate", e.target.value)} required className={fieldCls(error?.field === "scheduledDate")} />
                </div>
                <div>
                  <label htmlFor="pf-time" className={label}>Hora (de Brasília)</label>
                  <input id="pf-time" type="time" value={f.scheduledTime} onChange={(e) => set("scheduledTime", e.target.value)} required className={fieldCls(error?.field === "scheduledTime")} />
                </div>
              </div>
              {publishing && !publishing.on && <p className="text-xs text-gray-400" role="status">{publishing.message}</p>}

              <div>
                <span className={label}>Redes</span>
                <div className="flex gap-x-4 gap-y-2 mt-1 flex-wrap">
                  {PLATFORMS.map((p) => (
                    <label key={p} className="flex items-center gap-1.5 text-sm text-gray-300 capitalize">
                      <input type="checkbox" checked={f.platforms.includes(p)} onChange={(e) => set("platforms", e.target.checked ? [...f.platforms, p] : f.platforms.filter((x) => x !== p))} className="w-4 h-4 accent-[var(--brand-500)]" />
                      {p}
                    </label>
                  ))}
                </div>
              </div>

              <details className="rounded-lg border border-gray-800" open={Boolean(f.content || f.productionNotes || f.cta)}>
                <summary className="px-3 py-2 text-xs text-gray-400 cursor-pointer select-none">Anotações da equipe (roteiro, produção, chamada)</summary>
                <div className="px-3 pb-3 space-y-3">
                  <div>
                    <label htmlFor="pf-content" className={label}>Texto do conteúdo / roteiro</label>
                    <textarea id="pf-content" rows={2} value={f.content} onChange={(e) => set("content", e.target.value)} className={fieldCls()} />
                  </div>
                  <div>
                    <label htmlFor="pf-notes" className={label}>Notas de produção</label>
                    <textarea id="pf-notes" rows={2} value={f.productionNotes} onChange={(e) => set("productionNotes", e.target.value)} className={fieldCls()} />
                  </div>
                  <div>
                    <label htmlFor="pf-cta" className={label}>Chamada (CTA)</label>
                    <input id="pf-cta" value={f.cta} onChange={(e) => set("cta", e.target.value)} className={fieldCls()} />
                  </div>
                </div>
              </details>
            </div>
            <div className="p-4 md:border-l border-t md:border-t-0 border-gray-800 md:sticky md:top-0 md:self-start">
              <PhonePreview username={usernames[f.project] || ""} media={media} format={f.format} caption={f.caption} hashtags={hashtags} />
            </div>
          </div>
          <div className="shrink-0 border-t border-gray-800 p-3 flex items-center gap-3">
            {error ? <p className="text-xs text-red-400 flex-1" role="alert">{error.msg}</p> : <p className="text-xs text-gray-500 flex-1 hidden sm:block">Salvar guarda como rascunho. A aprovação vem no passo seguinte.</p>}
            <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-gray-200 px-2 ml-auto">Cancelar</button>
            <button type="submit" disabled={saving} className={primaryBtn} data-testid="post-save">{saving ? "Salvando..." : "Salvar"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
