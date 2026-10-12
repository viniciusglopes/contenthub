import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CRON_PATHS, SESSION_COOKIE, checkCronToken, verifySessionToken } from "@/lib/auth";

// Tudo exige login, menos a tela de login e a rota que cria a sessão.
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p)) return NextResponse.next();

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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
