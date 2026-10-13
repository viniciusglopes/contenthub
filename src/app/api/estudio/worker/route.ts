import { json, route } from "@/lib/api";
import { drain } from "@/lib/studio/jobs";

export const maxDuration = 300;

// FILA DO ESTÚDIO. Só entra com "Authorization: Bearer <CRON_TOKEN>" (login não entra).
// Processa os trabalhos que podem rodar agora, de todas as organizações, e espera terminarem.
// O servidor já tem um laço interno; esta rota é a rede de segurança (cron opcional).
export const POST = route("cron", async () => json({ ok: true, ...(await drain({ wait: true })) }));
