import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { scriptFor, siteByKey } from "@/lib/tracking/collect";

// SCRIPT DO SITE (público). Só a configuração do próprio site (chave, domínios de checkout, aviso de cookies).
export const GET = route("public", async ({ params }) => {
  const found = await siteByKey(params.key);
  const headers = { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" };
  if (!found) return new NextResponse("/* site não encontrado */", { status: 404, headers });
  return new NextResponse(scriptFor(found.site), { headers });
});
