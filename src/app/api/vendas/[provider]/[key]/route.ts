import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { receiveSale } from "@/lib/tracking/sales";

// WEBHOOK DE VENDA (público: quem chama é a Hotmart ou a Kiwify). Chave sorteada de 128 bits na URL
// + autenticação do provedor (hottok / assinatura HMAC) conferida antes de guardar. Idempotente.
const MAX = 256 * 1024;
export const POST = route("public", async ({ params, req }) => {
  if (Number(req.headers.get("content-length") || 0) > MAX) return NextResponse.json({ error: "Corpo grande demais." }, { status: 413 });
  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.length > MAX) return NextResponse.json({ error: "Corpo grande demais." }, { status: 413 });
  const r = await receiveSale(String(params.provider || ""), params.key, raw, req.headers, req.nextUrl.searchParams);
  return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
});
