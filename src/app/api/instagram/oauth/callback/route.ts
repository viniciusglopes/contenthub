import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { toFriendly } from "@/lib/errors";
import { OAUTH_COOKIE, checkState, finishOAuth, oauthEnabled } from "@/lib/instagram/oauth";

// Volta do Instagram. Exige a sessão E o `state` assinado desta sessão/organização.
// Sempre termina num redirecionamento para a tela do Instagram, com o resultado no link.
export const GET = route("org", async ({ org, session, req }) => {
  const q = req.nextUrl.searchParams;
  const base = (process.env.APP_URL || req.nextUrl.origin).replace(/\/+$/, "");
  const back = (params: Record<string, string>) => {
    const url = new URL(`${base}/`);
    url.searchParams.set("view", "instagram");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = NextResponse.redirect(url);
    res.cookies.set(OAUTH_COOKIE, "", { httpOnly: true, path: "/api/instagram/oauth", maxAge: 0 });
    return res;
  };
  try {
    if (!oauthEnabled()) return back({ ig_erro: "O login pelo Instagram ainda não está liberado." });
    const state = checkState(q.get("state"), { org, userId: session!.userId, nonce: req.cookies.get(OAUTH_COOKIE)?.value });
    if (q.get("error"))
      return back({
        project: state.project,
        ig_erro: q.get("error_reason") === "user_denied" ? "Você cancelou a autorização no Instagram. Nada foi conectado." : "O Instagram não autorizou a conexão.",
      });
    const account = await finishOAuth(org, { code: q.get("code") || "", project: state.project });
    return back({ project: state.project, ig_ok: account?.username || "conectada" });
  } catch (e) {
    return back({ ig_erro: toFriendly(e).message });
  }
});
