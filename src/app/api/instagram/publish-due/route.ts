import { json, route } from "@/lib/api";
import { runDue } from "@/lib/instagram/scheduler";

export const maxDuration = 300;

// AGENDADOR. Só entra com "Authorization: Bearer <CRON_TOKEN>" (login não entra).
// Publica os posts aprovados cujo horário chegou, de TODAS as organizações com a publicação
// ligada. Com IG_PUBLISH_ENABLED desligada responde { enabled: false } e não toca em nada.
export const POST = route("cron", async () => {
  const report = await runDue();
  return json({ ok: report.failed === 0, ...report });
});
