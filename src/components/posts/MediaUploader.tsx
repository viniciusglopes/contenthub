"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Film, Plus, X } from "lucide-react";
import { send } from "@/components/http";
import { ACCEPT_ATTR, IG_LIMITS, UPLOAD_LIMITS } from "@/lib/media/specs";
import { type MediaItem, fmtDuration, fmtSize } from "./flow";

interface Sending { key: string; name: string; pct: number }

function uploadFile(file: File, onProgress: (pct: number) => void): Promise<{ ok: boolean; data?: MediaItem; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/uploads?name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => resolve({ ok: false, error: "Sem conexão com o servidor. Tente de novo." });
    xhr.onload = () => {
      let body: { error?: string } & Partial<MediaItem> = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* resposta vazia */ }
      if (xhr.status === 401) return resolve({ ok: false, error: "Sua sessão expirou. Entre de novo e reenvie." });
      if (xhr.status >= 200 && xhr.status < 300) return resolve({ ok: true, data: body as MediaItem });
      resolve({ ok: false, error: body.error || "Não deu para enviar esse arquivo. Tente de novo." });
    };
    xhr.send(file);
  });
}

// Mídias do post: enviar, ver, reordenar (setas) e remover. Até 10 itens.
export default function MediaUploader({ items, onChange, format }: { items: MediaItem[]; onChange: (next: MediaItem[]) => void; format: string }) {
  const [sending, setSending] = useState<Sending[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [usage, setUsage] = useState<{ usedBytes: number; quotaBytes: number } | null>(null);
  const [fixing, setFixing] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(items);
  useEffect(() => { latest.current = items; }, [items]);

  const loadUsage = () => send<{ usedBytes: number; quotaBytes: number }>("GET", "/api/uploads").then((r) => r.ok && r.data && setUsage(r.data));
  useEffect(() => { loadUsage(); }, []);

  const max = format === "carrossel" ? IG_LIMITS.carousel.max : 1;
  const room = Math.max(0, IG_LIMITS.carousel.max - items.length - sending.length);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    const errs: string[] = [];
    const list = Array.from(files);
    if (list.length > room) errs.push(`Cabem só mais ${room} ${room === 1 ? "arquivo" : "arquivos"} (o máximo é ${IG_LIMITS.carousel.max} por post).`);
    for (const file of list.slice(0, room)) {
      const video = /\.(mp4|mov)$/i.test(file.name) || file.type.startsWith("video/");
      const limit = video ? UPLOAD_LIMITS.videoMaxBytes : UPLOAD_LIMITS.imageMaxBytes;
      if (file.size > limit) {
        errs.push(`"${file.name}" tem ${fmtSize(file.size)}. O limite para ${video ? "vídeo" : "imagem"} é ${fmtSize(limit)}.`);
        continue;
      }
      const key = `${file.name}-${file.size}-${Math.random()}`;
      setSending((s) => [...s, { key, name: file.name, pct: 0 }]);
      const r = await uploadFile(file, (pct) => setSending((s) => s.map((x) => (x.key === key ? { ...x, pct } : x))));
      setSending((s) => s.filter((x) => x.key !== key));
      if (r.ok && r.data) {
        latest.current = [...latest.current, r.data];
        onChange(latest.current);
      }
      else errs.push(`"${file.name}": ${r.error}`);
    }
    setErrors(errs);
    if (input.current) input.current.value = "";
    loadUsage();
  }
  function move(i: number, by: number) {
    const next = [...items];
    const [it] = next.splice(i, 1);
    next.splice(i + by, 0, it);
    onChange(next);
  }
  async function fix(item: MediaItem, fit: "crop" | "pad") {
    setFixing(item._id);
    const r = await send<MediaItem>("PUT", `/api/uploads/${item._id}`, { fit });
    setFixing("");
    if (r.ok && r.data) onChange(items.map((x) => (x._id === item._id ? r.data! : x)));
    else setErrors([r.error]);
  }

  return (
    <div data-testid="media-uploader">
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {items.map((m, i) => {
          const bad = m.problems.find((p) => p.level === "erro");
          const warn = m.problems.find((p) => p.level === "aviso");
          return (
            <div key={m._id} className={`relative rounded-lg overflow-hidden bg-gray-800 border ${bad ? "border-red-500/70" : "border-gray-700"}`} data-testid="media-item">
              <div className="aspect-square relative">
                {m.kind === "video" ? (
                  <>
                    <video src={m.url} className="absolute inset-0 w-full h-full object-cover" muted playsInline preload="metadata" />
                    <span className="absolute bottom-1 left-1 text-[10px] bg-black/70 text-white rounded px-1 flex items-center gap-1"><Film size={10} /> {fmtDuration(m.durationMs)}</span>
                  </>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- arquivo do próprio app
                  <img src={m.url} alt={m.originalName} className="absolute inset-0 w-full h-full object-cover" />
                )}
                <span className="absolute top-1 left-1 text-[10px] font-bold bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center">{i + 1}</span>
                <button type="button" onClick={() => onChange(items.filter((x) => x._id !== m._id))} aria-label={`Remover mídia ${i + 1}`} title="Remover" className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-600"><X size={13} /></button>
                {(bad || warn) && <span className={`absolute bottom-1 right-1 rounded-full p-0.5 ${bad ? "bg-red-600 text-white" : "bg-amber-400 text-black"}`} title={(bad || warn)!.message}><AlertTriangle size={11} /></span>}
              </div>
              {items.length > 1 && (
                <div className="flex border-t border-gray-700">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Mover mídia ${i + 1} para antes`} className="flex-1 py-1.5 flex justify-center text-gray-300 hover:bg-gray-700 disabled:opacity-25"><ChevronLeft size={14} /></button>
                  <button type="button" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={`Mover mídia ${i + 1} para depois`} className="flex-1 py-1.5 flex justify-center text-gray-300 hover:bg-gray-700 border-l border-gray-700 disabled:opacity-25"><ChevronRight size={14} /></button>
                </div>
              )}
            </div>
          );
        })}
        {sending.map((s) => (
          <div key={s.key} className="aspect-square rounded-lg bg-gray-800 border border-gray-700 flex flex-col items-center justify-center p-2 gap-1.5" role="status">
            <span className="text-[11px] text-gray-300 truncate max-w-full" title={s.name}>{s.name}</span>
            <span className="w-full h-1.5 rounded bg-gray-700 overflow-hidden"><span className="block h-full bg-brand-500 transition-all" style={{ width: `${s.pct}%` }} /></span>
            <span className="text-[11px] text-gray-400">{s.pct < 100 ? `Enviando ${s.pct}%` : "Conferindo..."}</span>
          </div>
        ))}
        {room > 0 && (
          <button type="button" onClick={() => input.current?.click()} className="aspect-square rounded-lg border-2 border-dashed border-gray-600 text-gray-300 hover:border-brand-500 hover:text-brand-400 flex flex-col items-center justify-center gap-1 text-xs px-1 text-center" data-testid="media-add">
            <Plus size={20} />
            {items.length ? "Adicionar" : "Enviar foto ou vídeo"}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept={ACCEPT_ATTR} multiple className="hidden" onChange={(e) => add(e.target.files)} data-testid="media-input" />

      {items.map((m, i) =>
        m.problems.map((p) => (
          <div key={`${m._id}-${p.code}`} className={`mt-2 text-xs rounded-lg px-3 py-2 ${p.level === "erro" ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-200"}`} role={p.level === "erro" ? "alert" : "status"}>
            <strong>Mídia {i + 1}:</strong> {p.message}
            {p.code === "proporcao" && (
              <span className="flex gap-2 mt-1.5">
                <button type="button" disabled={fixing === m._id} onClick={() => fix(m, "crop")} className="px-2.5 py-1.5 rounded-md bg-red-500/20 text-red-100 font-semibold hover:bg-red-500/30 disabled:opacity-50">Recortar</button>
                <button type="button" disabled={fixing === m._id} onClick={() => fix(m, "pad")} className="px-2.5 py-1.5 rounded-md bg-red-500/20 text-red-100 font-semibold hover:bg-red-500/30 disabled:opacity-50">Ajustar com fundo</button>
                {fixing === m._id && <span className="text-gray-400 self-center">Ajustando...</span>}
              </span>
            )}
          </div>
        ))
      )}
      {errors.map((e) => <p key={e} className="mt-2 text-xs text-red-400" role="alert">{e}</p>)}
      {items.length > max && <p className="mt-2 text-xs text-red-400" role="alert">{format === "reel" ? "Reel aceita só 1 vídeo." : "Post aceita só 1 imagem."} Remova as outras ou troque o formato para Carrossel.</p>}
      <p className="mt-2 text-[11px] text-gray-500 leading-relaxed">
        Imagem JPG, PNG ou WebP até {fmtSize(UPLOAD_LIMITS.imageMaxBytes)} · vídeo MP4 ou MOV até {fmtSize(UPLOAD_LIMITS.videoMaxBytes)}, de {IG_LIMITS.video.minSeconds} segundos a 15 minutos · até {IG_LIMITS.carousel.max} itens.
        {usage && <> Espaço usado: {fmtSize(usage.usedBytes)} de {fmtSize(usage.quotaBytes)}.</>}
      </p>
    </div>
  );
}
