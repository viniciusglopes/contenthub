import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { MAX_BODY_BYTES, badSignature, checkSignature, ingest, verifyChallenge, webhookSecret } from "@/lib/automations/webhook";

// WEBHOOK DO INSTAGRAM (público: quem chama é a Meta). Ver src/lib/automations/webhook.ts.
// GET  = verificação do painel da Meta (hub.challenge), só com IG_WEBHOOK_VERIFY_TOKEN certo.
// POST = eventos. Assinatura X-Hub-Signature-256 conferida no CORPO CRU antes de qualquer coisa.
//        Sem AUTOMACOES_ENABLED=true responde 200 e não guarda nada.
const text = (body: string, status: number) => new NextResponse(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export const GET = route("public", async ({ req }) => {
  const challenge = verifyChallenge(req.nextUrl.searchParams);
  return challenge ? text(challenge, 200) : text("Token de verificação inválido.", 403);
});

export const POST = route("public", async ({ req }) => {
  if (!webhookSecret()) return text("Webhook não configurado.", 503);
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return text("Corpo grande demais.", 413);
  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.length > MAX_BODY_BYTES) return text("Corpo grande demais.", 413);
  if (!checkSignature(raw, req.headers.get("x-hub-signature-256"))) {
    await badSignature();
    return text("Assinatura inválida.", 401);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return text("JSON inválido.", 400);
  }
  const r = await ingest(body);
  return NextResponse.json({ ok: true, ...r });
});
