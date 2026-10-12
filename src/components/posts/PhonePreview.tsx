"use client";

import { useState } from "react";
import { Bookmark, ChevronLeft, ChevronRight, Heart, ImageIcon, MessageCircle, Send } from "lucide-react";
import type { MediaItem } from "./flow";

/** A legenda como vai para o Instagram: texto + hashtags que ainda não estão nele. */
export function finalCaption(caption: string, hashtags: string[]): string {
  const text = (caption || "").trim();
  const missing = (hashtags || []).filter(Boolean).map((h) => (h.startsWith("#") ? h : `#${h}`)).filter((h) => !text.toLowerCase().includes(h.toLowerCase()));
  return [text, missing.join(" ")].filter(Boolean).join("\n\n");
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Prévia de como o post aparece no feed do Instagram, no celular.
// No carrossel o Instagram corta todas as imagens na proporção da primeira: a prévia faz igual.
export default function PhonePreview({ username, media, format, caption, hashtags }: { username: string; media: MediaItem[]; format: string; caption: string; hashtags: string[] }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const i = Math.min(index, Math.max(0, media.length - 1));
  const current = media[i];
  const first = media[0];
  const reel = format === "reel";
  const ratio = reel ? 9 / 16 : first?.width && first?.height ? clamp(first.width / first.height, 4 / 5, 1.91) : 1;
  const text = finalCaption(caption, hashtags);
  const short = text.length > 125 && !open;
  const name = username || "sua_conta";

  return (
    <div className="mx-auto w-full max-w-[260px] md:max-w-[300px]" data-testid="phone-preview">
      <div className="rounded-[28px] border-[6px] border-gray-700 bg-black overflow-hidden shadow-xl">
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="w-7 h-7 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px] shrink-0">
            <span className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center text-[11px] font-bold text-white">{name.slice(0, 1).toUpperCase()}</span>
          </span>
          <span className="text-[13px] font-semibold text-white truncate">{name}</span>
          <span className="ml-auto text-white text-lg leading-none">···</span>
        </div>
        <div className="relative bg-gray-900" style={{ aspectRatio: String(ratio) }}>
          {!current ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 gap-2">
              <ImageIcon size={32} />
              <span className="text-xs">A mídia aparece aqui</span>
            </div>
          ) : current.kind === "video" ? (
            <video key={current.url} src={current.url} className="absolute inset-0 w-full h-full object-cover" controls muted playsInline preload="metadata" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- arquivo do próprio app, já no tamanho certo
            <img key={current.url} src={current.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          {media.length > 1 && (
            <>
              <span className="absolute top-2 right-2 text-[11px] bg-black/70 text-white rounded-full px-2 py-0.5">{i + 1}/{media.length}</span>
              {i > 0 && <button type="button" onClick={() => setIndex(i - 1)} aria-label="Mídia anterior" className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/80 text-black flex items-center justify-center"><ChevronLeft size={16} /></button>}
              {i < media.length - 1 && <button type="button" onClick={() => setIndex(i + 1)} aria-label="Próxima mídia" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/80 text-black flex items-center justify-center"><ChevronRight size={16} /></button>}
            </>
          )}
        </div>
        <div className="px-3 pt-2 pb-3 text-white">
          <div className="flex items-center gap-3">
            <Heart size={20} /> <MessageCircle size={20} /> <Send size={20} />
            {media.length > 1 && (
              <span className="flex gap-1 mx-auto">
                {media.map((m, k) => <span key={m._id} className={`w-1.5 h-1.5 rounded-full ${k === i ? "bg-sky-400" : "bg-gray-600"}`} />)}
              </span>
            )}
            <Bookmark size={20} className="ml-auto" />
          </div>
          <p className="text-[13px] leading-snug mt-2 whitespace-pre-wrap break-words">
            <span className="font-semibold">{name}</span>{" "}
            {text ? (short ? `${text.slice(0, 125).trimEnd()}… ` : text) : <span className="text-gray-500">A legenda aparece aqui</span>}
            {short && <button type="button" onClick={() => setOpen(true)} className="text-gray-400">mais</button>}
          </p>
        </div>
      </div>
      <p className="text-[11px] text-gray-500 text-center mt-2">
        {reel ? "Prévia do Reel (vídeo em pé)" : media.length > 1 ? "Prévia no feed · o Instagram corta todas as imagens na proporção da primeira" : "Prévia no feed do Instagram"}
      </p>
    </div>
  );
}
