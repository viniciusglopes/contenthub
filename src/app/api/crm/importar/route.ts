import { json, route } from "@/lib/api";
import { runImport } from "@/lib/crm/importer";

// Planilha CSV: { csv, mapping?, consent, consentBasis, pipeline, stage, owner, tags, commit }.
// Sem commit = só a prévia (nada é gravado).
export const maxDuration = 120;
export const POST = route("org", async ({ org, body, session }) => json(await runImport(org, await body(), session!.user)));
