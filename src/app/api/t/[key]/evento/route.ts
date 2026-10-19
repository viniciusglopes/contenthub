import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { MAX_EVENT_BYTES, collectEvent } from "@/lib/tracking/collect";
import { clientIp } from "@/lib/session";

// EVENTO DO SCRIPT (público, texto puro por sendBeacon). Não devolve nada do cliente: só o código.
const H = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
export const POST = route("public", async ({ params, req }) => {
  if (Number(req.headers.get("content-length") || 0) > MAX_EVENT_BYTES) return new NextResponse(null, { status: 413, headers: H });
  const raw = await req.text();
  if (raw.length > MAX_EVENT_BYTES) return new NextResponse(null, { status: 413, headers: H });
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400, headers: H });
  }
  const r = await collectEvent(params.key, body, { ip: clientIp(req), ua: req.headers.get("user-agent") || "", origin: req.headers.get("origin") || req.headers.get("referer") || "" });
  return new NextResponse(null, { status: r.status, headers: H });
});
