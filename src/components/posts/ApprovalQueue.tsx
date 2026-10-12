"use client";

import { useState } from "react";
import { AlertTriangle, Film, ImageIcon } from "lucide-react";
import { ghostBtn, primaryBtn } from "@/components/brand";
import { send } from "@/components/http";
import { FORMATS, type PostT, type Publishing, flowStatus, statusOf, whenText } from "./flow";

function Thumb({ post }: { post: PostT }) {
  const m = post.media?.[0];
  return (
    <span className="w-11 h-11 rounded-md bg-gray-800 overflow-hidden shrink-0 flex items-center justify-center text-gray-600 relative">
      {!m ? <ImageIcon size={18} /> : m.kind === "video" ? <><video src={m.url} muted playsInline preload="metadata" className="w-full h-full object-cover" /><Film size={12} className="absolute bottom-0.5 right-0.5 text-white" /></> : (
        // eslint-disable-next-line @next/next/no-img-element -- arquivo do próprio app
        <img src={m.url} alt="" className="w-full h-full object-cover" />
      )}
    </span>
  );
}

// Fila do dono: aprovar ou pedir ajuste em um toque; e o que falhou ou perdeu o horário, com o motivo.
export default function ApprovalQueue({ posts, canApprove, publishing, onOpen, onChanged }: { posts: PostT[] | null; canApprove: boolean; publishing?: Publishing | null; onOpen: (post: PostT) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [noteFor, setNoteFor] = useState("");
  const [note, setNote] = useState("");

  async function act(post: PostT, action: string, extra: Record<string, unknown> = {}) {
    setBusy(post._id + action);
    const r = await send("POST", `/api/posts/${post._id}/workflow`, { action, ...extra });
    setBusy("");
    setErrors((e) => ({ ...e, [post._id]: r.ok ? "" : r.error }));
    if (r.ok) setNoteFor("");
    onChanged();
  }

  if (posts === null) return <p className="text-sm text-gray-400 py-16 text-center">Carregando...</p>;
  const pending = posts.filter((p) => flowStatus(p.status) === "pending");
  const trouble = posts.filter((p) => ["failed", "missed"].includes(p.status));

  const row = (post: PostT, actions: React.ReactNode, extra?: React.ReactNode) => (
    <li key={post._id} className="border-b border-gray-800 last:border-b-0" data-testid="queue-row">
      <div className="flex items-center gap-3 px-3 md:px-4 py-2.5">
        <button type="button" onClick={() => onOpen(post)} className="flex items-center gap-3 min-w-0 flex-1 text-left" title="Abrir o post">
          <Thumb post={post} />
          <span className="min-w-0">
            <span className="block text-sm text-gray-100 font-medium truncate" title={post.title}>{post.title}</span>
            <span className="block text-xs text-gray-400 truncate">
              {whenText(post)} · {FORMATS[post.format]?.label.split(" (")[0] || post.format} · {post.project?.icon} {post.project?.name}
              {post.review?.requestedByName && flowStatus(post.status) === "pending" ? ` · pedido por ${post.review.requestedByName}` : ""}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      </div>
      {extra}
      {errors[post._id] && <p className="px-3 md:px-4 pb-2.5 text-xs text-red-400" role="alert">{errors[post._id]}</p>}
    </li>
  );

  return (
    <div className="flex-1 overflow-auto" data-testid="approval-queue">
      <div className="max-w-3xl mx-auto p-3 md:p-6 space-y-5">
        {publishing && !publishing.on && <p className="text-xs text-gray-300 bg-gray-800 rounded-lg px-3 py-2.5" role="status">{publishing.message}</p>}
        <section>
          <h3 className="text-sm font-bold text-white mb-2">Aguardando aprovação <span className="text-gray-500 font-normal">({pending.length})</span></h3>
          {pending.length === 0 ? (
            <p className="text-sm text-gray-400 bg-gray-900 rounded-xl px-4 py-8 text-center">Nada esperando aprovação. Quando alguém da equipe pedir, aparece aqui.</p>
          ) : (
            <ul className="bg-gray-900 rounded-xl overflow-hidden">
              {pending.map((post) =>
                row(
                  post,
                  canApprove ? (
                    <>
                      <button type="button" onClick={() => { setNoteFor(noteFor === post._id ? "" : post._id); setNote(""); }} className="text-xs text-gray-300 hover:text-white hover:underline whitespace-nowrap hidden sm:block">Pedir ajuste</button>
                      <button type="button" disabled={Boolean(busy)} onClick={() => act(post, "approve")} className={`${primaryBtn} !py-2 !px-3`} data-testid="queue-approve">{busy === post._id + "approve" ? "..." : "Aprovar"}</button>
                    </>
                  ) : (
                    <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${statusOf("pending").chip}`}>com o dono</span>
                  ),
                  <>
                    {canApprove && noteFor !== post._id && <button type="button" onClick={() => { setNoteFor(post._id); setNote(""); }} className="sm:hidden px-3 pb-2.5 text-xs text-gray-300 underline">Pedir ajuste</button>}
                    {noteFor === post._id && (
                      <form onSubmit={(e) => { e.preventDefault(); act(post, "adjust", { note }); }} className="flex gap-2 px-3 md:px-4 pb-3">
                        <input value={note} onChange={(e) => setNote(e.target.value)} autoFocus placeholder="O que precisa mudar?" aria-label="O que precisa mudar?" className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100" />
                        <button type="submit" disabled={Boolean(busy)} className={ghostBtn}>Enviar</button>
                      </form>
                    )}
                  </>
                )
              )}
            </ul>
          )}
        </section>

        {trouble.length > 0 && (
          <section>
            <h3 className="text-sm font-bold text-white mb-2">Não saíram: precisam de decisão <span className="text-gray-500 font-normal">({trouble.length})</span></h3>
            <ul className="bg-gray-900 rounded-xl overflow-hidden">
              {trouble.map((post) =>
                row(
                  post,
                  canApprove && !post.publish?.uncertain ? (
                    <button type="button" disabled={Boolean(busy)} onClick={() => act(post, "retry")} className={`${primaryBtn} !py-2 !px-3`} data-testid="queue-retry">{busy === post._id + "retry" ? "..." : post.status === "missed" ? "Publicar agora" : "Tentar de novo"}</button>
                  ) : (
                    <button type="button" onClick={() => onOpen(post)} className={ghostBtn}>Abrir</button>
                  ),
                  <p className={`mx-3 md:mx-4 mb-2.5 text-xs rounded-md px-2.5 py-2 flex gap-1.5 ${post.status === "failed" ? "bg-red-500/10 text-red-200" : "bg-orange-500/10 text-orange-200"}`}>
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" /> <span><strong>{statusOf(post.status).label}:</strong> {post.publish?.lastError || "A publicação não foi concluída."}</span>
                  </p>
                )
              )}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
