import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { resolveMedia } from "@/lib/media/store";

// ARQUIVO PÚBLICO de mídia: é o endereço que a Meta baixa na hora de publicar.
// Sem login de propósito. A proteção é o nome: 192 bits sorteados, dentro da pasta da
// organização. Não existe listagem; o caminho só aceita a forma exata <24 hex>/<48 hex>.<ext>
// (nada de "..", barras ou outros nomes). Só leitura: apagar é por /api/posts e /api/uploads.
const TYPES: Record<string, string> = { jpg: "image/jpeg", mp4: "video/mp4", mov: "video/quicktime", png: "image/png", mp3: "audio/mpeg", m4a: "audio/mp4" };
const gone = () => new NextResponse("Não encontrado.", { status: 404, headers: { "Cache-Control": "no-store" } });

export const GET = route("public", async ({ params, req }) => {
  const file = resolveMedia(String(params.org || ""), String(params.file || ""));
  if (!file) return gone();
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return gone();
  const size = info.size;
  const headers: Record<string, string> = {
    "Content-Type": TYPES[file.slice(file.lastIndexOf(".") + 1)],
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Last-Modified": info.mtime.toUTCString(),
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Robots-Tag": "noindex",
  };
  // Range (vídeo): "bytes=início-fim", "bytes=início-" ou "bytes=-últimos"
  const range = req.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    let start = m && m[1] !== "" ? Number(m[1]) : NaN;
    let end = m && m[2] !== "" ? Number(m[2]) : size - 1;
    if (m && m[1] === "" && m[2] !== "") {
      start = Math.max(0, size - Number(m[2]));
      end = size - 1;
    }
    if (!m || Number.isNaN(start) || start >= size || start > end)
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" } });
    end = Math.min(end, size - 1);
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream;
    return new NextResponse(stream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const stream = Readable.toWeb(createReadStream(file)) as unknown as ReadableStream;
  return new NextResponse(stream, { status: 200, headers: { ...headers, "Content-Length": String(size) } });
});
