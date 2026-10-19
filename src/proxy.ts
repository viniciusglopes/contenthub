import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CRON_PATHS, SESSION_COOKIE, checkCronToken, verifySessionToken } from "@/lib/auth";

// Primeira barreira: sem cookie assinado válido, nada passa (menos entrar e aceitar convite).
// A segunda barreira é em cada rota (src/lib/api.ts): usuário ativo, papel e organização
// conferidos no banco.
// /api/instagram/webhook: quem chama é a Meta (assinatura conferida na rota);
// /api/r/: link da DM que conta o clique (código sorteado, sem dado da pessoa).
// /api/crm/lead-ads/webhook: quem chama é a Meta (formulário de cadastro; assinatura conferida na rota);
// /api/captura/: formulário de captura de lead (código sorteado + ficha anti-robô + teto por IP).
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/brand", "/api/instagram/webhook", "/api/crm/lead-ads/webhook"];
const PUBLIC_PREFIXES = ["/convite/", "/api/auth/invite/", "/api/r/", "/api/captura/"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (
    CRON_PATHS.some((p) => pathname === p) &&
    checkCronToken(request.headers.get("authorization"))
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Sessão expirada ou não autenticada. Entre de novo." },
      { status: 401 }
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" && !search ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

// Fora do proxy (o corpo/arquivo não pode ser guardado na memória pelo proxy, que corta em 10 MB):
//  - /api/uploads  envio de mídia; a sessão é conferida no banco pela própria rota (route("org"))
//  - /api/estudio/cenas  envio de cena (até 300 MB); mesma conferência pela rota
//  - /api/media/   arquivo público de mídia (o que a Meta baixa); nome sorteado, sem login
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/uploads$|api/estudio/cenas$|api/media/).*)"],
};
