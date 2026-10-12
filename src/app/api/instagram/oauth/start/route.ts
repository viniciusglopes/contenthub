import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { OAUTH_COOKIE, STATE_TTL_MS, startOAuth } from "@/lib/instagram/oauth";
import { assertProject } from "@/lib/orgs";

// Botão "Conectar Instagram": confere que o projeto é do cliente, assina o `state`
// (usuário + organização + projeto + nonce) e manda a pessoa para a autorização do Instagram.
export const GET = route("org", async ({ org, session, req, id }) => {
  const project = id(req.nextUrl.searchParams.get("project"), "Projeto");
  await assertProject(org, project);
  const { url, nonce } = startOAuth({ org, userId: session!.userId, project: String(project) });
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/instagram/oauth",
    maxAge: STATE_TTL_MS / 1000,
  });
  return res;
});
