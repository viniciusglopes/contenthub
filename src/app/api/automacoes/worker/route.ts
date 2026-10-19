import { json, route } from "@/lib/api";
import { processDue } from "@/lib/automations/engine";

// Rodada do motor (além do laço interno): só com o token de rotina. Percorre só organizações com a chave ligada.
export const maxDuration = 120;
export const POST = route("cron", async () => json(await processDue()));
