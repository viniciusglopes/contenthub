import { json, route } from "@/lib/api";
import { listScenes, publicScene, uploadScene } from "@/lib/studio/cenas";

export const maxDuration = 300;

// BIBLIOTECA DE CENAS da organização da sessão (?categoria= filtra).
export const GET = route("org", async ({ org, req }) => json(await listScenes(org, req.nextUrl.searchParams.get("categoria"))));

// Envia um clipe próprio. O corpo do pedido é o arquivo (MP4/MOV, até 300 MB). No endereço:
// categoria, licenca (obrigatória), fonte (https, obrigatória salvo gravação própria), autor, titulo,
// tags, foco (0 a 1, recorte vertical), inicio (s), duracao (3 a 20 s), desfoque, name. Vira 1080x1920 sem áudio, até 20 s.
export const POST = route("org", async ({ org, req, session }) => {
  const q = Object.fromEntries(req.nextUrl.searchParams.entries());
  const a = await uploadScene(org, req.body, q, session!.user._id, Number(req.headers.get("content-length")) || 0);
  return json(publicScene(a), 201);
});
