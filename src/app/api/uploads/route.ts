import { json, route } from "@/lib/api";
import { publicAsset, quotaBytes, storeUpload, usedBytes } from "@/lib/media/store";
import { IG_LIMITS, UPLOAD_LIMITS } from "@/lib/media/specs";

export const maxDuration = 300;

// Espaço usado e limites da organização da sessão (para o formulário mostrar).
export const GET = route("org", async ({ org }) => {
  return json({ usedBytes: await usedBytes(org), quotaBytes: quotaBytes(), limits: { upload: UPLOAD_LIMITS, instagram: IG_LIMITS } });
});

// Envio de UM arquivo: o corpo do pedido é o próprio arquivo (sem formulário), gravado direto
// no disco. ?name=<nome original>&fit=crop|pad (opcional). A pasta é a da organização da sessão.
// Esta rota fica fora do proxy (src/proxy.ts) para o corpo não ser guardado na memória.
export const POST = route("org", async ({ org, req, session }) => {
  const q = req.nextUrl.searchParams;
  const fit = q.get("fit");
  const asset = await storeUpload(org, {
    body: req.body,
    name: q.get("name") || "",
    declaredLength: Number(req.headers.get("content-length")) || undefined,
    fit: fit === "crop" || fit === "pad" ? fit : "",
    userId: session!.userId,
  });
  return json(publicAsset(asset), 201);
});
