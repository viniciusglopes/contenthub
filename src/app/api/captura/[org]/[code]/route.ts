import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { MAX_BODY, captureInfo, submitCapture } from "@/lib/crm/capture";
import { clientIp } from "@/lib/session";

// CAPTURA DE LEAD (pública: quem chama é a página do cliente). Ver src/lib/crm/capture.ts.
// GET = ficha anti-robô + texto de consentimento. POST = formulário (JSON ou HTML comum).
// Nunca devolve dado do cliente: só ok, erro ou para onde ir.
const CORS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const out = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: CORS });

export const GET = route("public", async ({ params }) => {
  const info = await captureInfo(params.org, params.code);
  return info ? out(info) : out({ error: "Formulário não encontrado." }, 404);
});

export const POST = route("public", async ({ params, req }) => {
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return out({ error: "Envio grande demais." }, 413);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return out({ error: "Envio grande demais." }, 413);
  const isForm = (req.headers.get("content-type") || "").includes("application/x-www-form-urlencoded");
  let body: Record<string, unknown> = {};
  try {
    body = isForm ? Object.fromEntries(new URLSearchParams(raw)) : (JSON.parse(raw || "{}") as Record<string, unknown>);
  } catch {
    return out({ error: "Envio inválido." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return out({ error: "Envio inválido." }, 400);
  const r = await submitCapture(params.org, params.code, body, clientIp(req));
  // formulário HTML comum: volta para a página de obrigado (ou mostra um texto simples)
  if (isForm) {
    if (r.status === 200 && r.redirect) return NextResponse.redirect(r.redirect, { status: 303, headers: CORS });
    const msg = r.status === 200 ? "Recebemos o seu contato. Obrigado!" : r.error || "Não deu certo.";
    return new NextResponse(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Contato</title><p style="font:16px system-ui;padding:24px">${msg.replace(/</g, "&lt;")}</p>`, { status: r.status, headers: { ...CORS, "Content-Type": "text/html; charset=utf-8" } });
  }
  return r.status === 200 ? out({ ok: true, redirect: r.redirect || "" }) : out({ error: r.error, field: r.field }, r.status);
});
