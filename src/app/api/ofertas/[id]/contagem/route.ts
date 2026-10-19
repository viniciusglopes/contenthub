import { json, route } from "@/lib/api";
import { findOrgOffer, recordManual } from "@/lib/offers/offers";

// CONTAGEM MANUAL: { count, note, date? } (hoje ou até 7 dias atrás). Guarda quem, quando e de onde veio.
export const POST = route("org", async ({ org, params, body, session }) => {
  const page = await findOrgOffer(org, params.id);
  const r = await recordManual({ kind: "org", org, page }, await body(), { id: session!.userId, name: session!.user.name || session!.user.email });
  return json({ ok: true, ...r }, 201);
});
