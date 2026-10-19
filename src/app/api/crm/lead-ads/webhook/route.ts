import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { MAX_BODY_BYTES, checkLeadAdsSignature, ingestLeadgen, leadAdsBadSignature, leadAdsSecret, verifyLeadAdsChallenge } from "@/lib/crm/leadads";

// WEBHOOK DOS FORMULÁRIOS DA META (objeto Page, campo leadgen). Público: quem chama é a Meta.
// GET  = verificação (hub.challenge) só com LEAD_ADS_VERIFY_TOKEN certo.
// POST = avisos; assinatura X-Hub-Signature-256 (META_APP_SECRET) conferida no corpo cru antes de tudo.
//        Sem CRM_LEAD_ADS_ENABLED=true responde 200 e não guarda nada.
const text = (body: string, status: number) => new NextResponse(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export const GET = route("public", async ({ req }) => {
  const challenge = verifyLeadAdsChallenge(req.nextUrl.searchParams);
  return challenge ? text(challenge, 200) : text("Token de verificação inválido.", 403);
});

export const POST = route("public", async ({ req }) => {
  if (!leadAdsSecret()) return text("Webhook não configurado.", 503);
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) return text("Corpo grande demais.", 413);
  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.length > MAX_BODY_BYTES) return text("Corpo grande demais.", 413);
  if (!checkLeadAdsSignature(raw, req.headers.get("x-hub-signature-256"))) {
    await leadAdsBadSignature();
    return text("Assinatura inválida.", 401);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return text("JSON inválido.", 400);
  }
  const r = await ingestLeadgen(body);
  return NextResponse.json({ ok: true, ...r });
});
