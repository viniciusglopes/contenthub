import { json, route } from "@/lib/api";
import { findHouseOffer, recordManual } from "@/lib/offers/offers";

// CONTAGEM MANUAL na lista da casa: { count, note, date? }. Guarda quem, quando e de onde veio.
export const POST = route("admin", async ({ params, body, session }) => {
  const page = await findHouseOffer(params.id);
  const r = await recordManual({ kind: "casa", page }, await body(), { id: session!.userId, name: session!.user.name || session!.user.email });
  return json({ ok: true, ...r }, 201);
});
