"use client";
/* eslint-disable react-hooks/set-state-in-effect -- carrega o post ao abrir */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Circle, Copy, ExternalLink, Pencil, Trash2, X } from "lucide-react";
import { ghostBtn, primaryBtn } from "@/components/brand";
import { send } from "@/components/http";
import PhonePreview from "./PhonePreview";
import { type CheckItem, FORMATS, HISTORY_LABEL, type PostT, type Publishing, flowStatus, fmtAt, stateLine, statusOf } from "./flow";

interface Flow { post: PostT; check: { ok: boolean; items: CheckItem[] } | null; publishing: Publishing; canApprove: boolean; toleranceMin: number }

// Detalhe do post: prévia, situação, o que falta para aprovar, a ação principal e o histórico.
export default function PostDetail({ postId, username, onClose, onEdit, onChanged }: { postId: string; username: string; onClose: () => void; onEdit: (post: PostT) => void; onChanged: () => void }) {
  const [d, setD] = useState<Flow | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [askNote, setAskNote] = useState(false);
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const r = await send<Flow>("GET", `/api/posts/${postId}/workflow`);
    if (!r.ok || !r.data) return setError(r.error);
    setD(r.data);
  }, [postId]);
  useEffect(() => { load(); }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError("");
    const r = await send("POST", `/api/posts/${postId}/workflow`, { action, ...extra });
    setBusy("");
    if (!r.ok) setError(r.error);
    setAskNote(false);
    await load();
    onChanged();
  }
  async function remove() {
    setBusy("delete");
    const r = await send("DELETE", `/api/posts/${postId}`);
    setBusy("");
    if (!r.ok) return setError(r.error);
    onChanged();
    onClose();
  }

  const post = d?.post;
  const s = post ? flowStatus(post.status) : "draft";
  const st = statusOf(s);
  const missing = d?.check?.items.filter((i) => !i.ok) || [];
  const link = post?.externalIds?.instagramPermalink;
  const auto = post ? FORMATS[post.format]?.auto !== false : true;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full max-w-4xl max-h-[94dvh] flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Post" data-testid="post-detail">
        <div className="flex items-center justify-between gap-2 p-4 border-b border-gray-800 shrink-0">
          <div className="min-w-0 flex items-center gap-2">
            <span className="text-lg">{post?.project?.icon}</span>
            <h3 className="font-bold text-white truncate" title={post?.title}>{post?.title || "Post"}</h3>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {post && s !== "publishing" && <button type="button" onClick={() => onEdit(post)} className="p-2 hover:bg-gray-800 rounded text-gray-300" aria-label="Editar" title="Editar"><Pencil size={16} /></button>}
            {post && s !== "publishing" && <button type="button" onClick={() => setConfirmDelete(true)} className="p-2 hover:bg-red-500/20 rounded text-red-400" aria-label="Apagar" title="Apagar"><Trash2 size={16} /></button>}
            <button type="button" onClick={onClose} className="p-2 hover:bg-gray-800 rounded" aria-label="Fechar"><X size={18} /></button>
          </div>
        </div>
        {!post || !d ? (
          <p className="text-sm text-gray-400 p-6" role={error ? "alert" : "status"}>{error || "Carregando..."}</p>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto flex flex-col md:grid md:grid-cols-[340px_minmax(0,1fr)]">
            {/* no celular a situação e a ação vêm primeiro; a prévia fica logo abaixo */}
            <div className="p-4 order-2 md:order-1 border-t md:border-t-0 md:border-r border-gray-800">
              <PhonePreview username={username} media={post.media || []} format={post.format} caption={post.caption} hashtags={post.hashtags} />
            </div>
            <div className="p-4 space-y-4 order-1 md:order-2">
              {confirmDelete && (
                <div className="rounded-lg bg-red-500/10 px-3 py-2.5 text-sm text-red-200 flex flex-wrap items-center gap-2" role="alert">
                  <span className="flex-1 min-w-[180px]">Apagar este post e a mídia dele? Não dá para desfazer.</span>
                  <button type="button" onClick={remove} disabled={busy === "delete"} className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-bold disabled:opacity-50">Apagar</button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-gray-300 px-2">Cancelar</button>
                </div>
              )}
              <div>
                <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-semibold ${st.chip}`} data-testid="detail-status">{st.label}</span>
                <p className="text-sm text-gray-200 mt-2" data-testid="detail-when">{stateLine(post, d.publishing)}</p>
                <p className="text-xs text-gray-500 mt-0.5">{FORMATS[post.format]?.label || post.format} · {post.project?.name}{post.approval?.at ? ` · aprovado por ${post.approval.byName} em ${fmtAt(post.approval.at)}` : ""}</p>
              </div>

              {(s === "failed" || s === "missed") && (
                <div className={`rounded-lg px-3 py-3 text-sm ${s === "failed" ? "bg-red-500/10 text-red-200" : "bg-orange-500/10 text-orange-200"}`} role="alert" data-testid="detail-failure">
                  <p className="flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{post.publish?.lastError || "A publicação não foi concluída."}</span></p>
                  {d.canApprove ? (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button type="button" disabled={Boolean(busy)} onClick={() => act("retry", post.publish?.uncertain ? { confirm: true } : {})} className={primaryBtn} data-testid="detail-retry">
                        {busy === "retry" ? "Enviando..." : post.publish?.uncertain ? "Conferi, não saiu: tentar de novo" : s === "missed" ? "Publicar agora" : "Tentar de novo"}
                      </button>
                      {post.publish?.uncertain && <button type="button" disabled={Boolean(busy)} onClick={() => act("mark_posted")} className={ghostBtn}>Já saiu: marcar como publicado</button>}
                      {s === "missed" && <button type="button" onClick={() => onEdit(post)} className={ghostBtn}>Marcar outro horário</button>}
                    </div>
                  ) : (
                    <p className="text-xs mt-2 opacity-80">O dono da conta decide o que fazer.</p>
                  )}
                </div>
              )}

              {s === "draft" && post.review?.note && (
                <p className="text-sm text-amber-200 bg-amber-500/10 rounded-lg px-3 py-2.5" role="status"><strong>{post.review.noteByName || "O dono"} pediu ajuste:</strong> {post.review.note}</p>
              )}
              {!d.publishing.on && auto && ["draft", "pending", "scheduled"].includes(s) && (
                <p className="text-xs text-gray-300 bg-gray-800 rounded-lg px-3 py-2.5" role="status" data-testid="publish-off">{d.publishing.message}</p>
              )}

              {d.check && ["draft", "pending"].includes(s) && auto && (
                <div data-testid="detail-check">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{missing.length ? "O que falta para aprovar" : "Pronto para aprovar"}</h4>
                  <ul className="space-y-1.5">
                    {d.check.items.map((i) => (
                      <li key={i.key} className="flex gap-2 text-sm">
                        {i.ok ? <CheckCircle2 size={16} className="text-green-400 shrink-0 mt-0.5" /> : <Circle size={16} className="text-red-400 shrink-0 mt-0.5" />}
                        <span className={i.ok ? "text-gray-400" : "text-gray-100"}>{i.label}{i.detail && <span className={`block text-xs ${i.ok ? "text-gray-500" : "text-red-300"}`}>{i.detail}</span>}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!auto && <p className="text-xs text-gray-400 bg-gray-800 rounded-lg px-3 py-2.5">{FORMATS[post.format]?.label} ainda não sai sozinho. Publique por fora e marque como publicado.</p>}

              {error && <p className="text-sm text-red-400" role="alert">{error}</p>}

              {askNote ? (
                <form onSubmit={(e) => { e.preventDefault(); act("adjust", { note }); }} className="space-y-2">
                  <label htmlFor="pd-note" className="text-xs text-gray-400">O que precisa mudar?</label>
                  <textarea id="pd-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} autoFocus className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100" placeholder="Ex.: trocar a segunda foto" />
                  <div className="flex gap-2">
                    <button type="submit" disabled={Boolean(busy)} className={primaryBtn}>{busy === "adjust" ? "Enviando..." : "Enviar pedido de ajuste"}</button>
                    <button type="button" onClick={() => setAskNote(false)} className="text-sm text-gray-400 px-2">Cancelar</button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {auto && ["draft", "pending"].includes(s) && d.canApprove && (
                    <button type="button" disabled={Boolean(busy) || missing.length > 0} onClick={() => act("approve")} className={primaryBtn} data-testid="detail-approve" title={missing.length ? "Resolva o que falta para liberar a aprovação" : ""}>
                      {busy === "approve" ? "Aprovando..." : "Aprovar e agendar"}
                    </button>
                  )}
                  {auto && s === "draft" && !d.canApprove && (
                    <button type="button" disabled={Boolean(busy)} onClick={() => act("request")} className={primaryBtn} data-testid="detail-request">{busy === "request" ? "Enviando..." : "Pedir aprovação"}</button>
                  )}
                  {s === "pending" && !d.canApprove && <span className="text-sm text-gray-400">Esperando o dono da conta aprovar.</span>}
                  {s === "pending" && d.canApprove && <button type="button" onClick={() => setAskNote(true)} className="text-sm text-brand-400 hover:underline" data-testid="detail-adjust">Pedir ajuste</button>}
                  {["pending", "scheduled"].includes(s) && <button type="button" disabled={Boolean(busy)} onClick={() => act("draft")} className="text-sm text-gray-400 hover:text-gray-200 hover:underline">{s === "scheduled" ? "Cancelar agendamento" : "Voltar para rascunho"}</button>}
                  {d.canApprove && s !== "posted" && s !== "publishing" && (!auto || s === "draft") && <button type="button" disabled={Boolean(busy)} onClick={() => act("mark_posted")} className="text-sm text-gray-400 hover:text-gray-200 hover:underline">Já publiquei por fora</button>}
                  {link && <a href={link} target="_blank" rel="noreferrer" className={`${primaryBtn} inline-flex items-center gap-1.5`} data-testid="detail-link"><ExternalLink size={14} /> Ver no Instagram</a>}
                </div>
              )}

              {post.caption && (
                <button type="button" onClick={() => { navigator.clipboard.writeText(post.caption); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="text-xs text-gray-400 hover:text-brand-400 flex items-center gap-1">
                  {copied ? <><Check size={12} /> Legenda copiada</> : <><Copy size={12} /> Copiar legenda</>}
                </button>
              )}
              {(post.content || post.productionNotes || post.cta) && (
                <div className="text-sm space-y-2 rounded-lg border border-gray-800 p-3">
                  {post.content && <p><span className="block text-[11px] text-gray-500 uppercase tracking-wider">Roteiro</span><span className="text-gray-200 whitespace-pre-wrap">{post.content}</span></p>}
                  {post.productionNotes && <p><span className="block text-[11px] text-gray-500 uppercase tracking-wider">Notas de produção</span><span className="text-gray-300 whitespace-pre-wrap">{post.productionNotes}</span></p>}
                  {post.cta && <p><span className="block text-[11px] text-gray-500 uppercase tracking-wider">Chamada</span><span className="text-gray-300">{post.cta}</span></p>}
                </div>
              )}

              {(post.history?.length || 0) > 0 && (
                <div data-testid="detail-history">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Histórico</h4>
                  <ol className="space-y-1.5 border-l border-gray-700 ml-1.5 pl-3">
                    {[...post.history!].reverse().map((h, i) => (
                      <li key={i} className="text-xs text-gray-400 relative">
                        <span className="absolute -left-[17px] top-1 w-2 h-2 rounded-full bg-gray-600" />
                        <span className="text-gray-200">{HISTORY_LABEL[h.type] || h.type}</span>
                        {h.by && h.by !== "ContentHub" ? ` por ${h.by}` : ""} · {fmtAt(h.at)}
                        {h.note && (/^https?:\/\//.test(h.note) ? <a href={h.note} target="_blank" rel="noreferrer" className="block text-brand-400 truncate hover:underline">{h.note}</a> : <span className="block text-gray-500">{h.note}</span>)}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
