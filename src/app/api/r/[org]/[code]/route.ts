import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { registerClick } from "@/lib/automations/links";
import { toObjectId } from "@/lib/tenant";

// LINK DA DM (público): soma 1 clique e redireciona. Sem dado da pessoa na URL.
// Só abre com o código sorteado (64 bits) dentro da organização do link.
export const GET = route("public", async ({ params, req }) => {
  const org = toObjectId(params.org);
  const to = org ? await registerClick(org, String(params.code || ""), Date.now(), req.nextUrl.searchParams.get("k") || "") : null;
  if (!to) return new NextResponse("Link não encontrado.", { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.redirect(to, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" } });
});
