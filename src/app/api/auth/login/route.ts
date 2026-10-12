import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  authConfigured,
  checkPassword,
  clearLoginFailures,
  createSessionToken,
  loginAllowed,
  registerLoginFailure,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: "Acesso ainda não configurado no servidor (faltam APP_PASSWORD e AUTH_SECRET)." },
      { status: 503 }
    );
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!loginAllowed(ip)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Espere 10 minutos e tente de novo." },
      { status: 429 }
    );
  }
  const body = await req.json().catch(() => ({}));
  if (!checkPassword(String(body?.password || ""))) {
    registerLoginFailure(ip);
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }
  clearLoginFailures(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  return res;
}
