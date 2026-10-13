// Roda uma vez quando o servidor sobe. Liga o laço da fila do Estúdio: é ele que retoma os
// trabalhos de Reel que estavam no meio quando o servidor reiniciou (ver src/lib/studio/jobs.ts).
// STUDIO_LOOP=0 desliga (fica só a rota /api/estudio/worker com CRON_TOKEN).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.STUDIO_LOOP === "0" || !process.env.MONGODB_URI) return;
  const { startLoop } = await import("@/lib/studio/jobs");
  startLoop();
}
