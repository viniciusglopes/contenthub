import { json, route } from "@/lib/api";
import { runHouseCount } from "@/lib/offers/offers";

export const maxDuration = 300;

// Contar agora pela API a lista da casa: { offer? } (uma) ou todas as ativas de contagem pela API.
export const POST = route("admin", async ({ body }) => {
  const b = await body();
  const results = await runHouseCount({ page: b.offer });
  return json({ ok: true, pages: results.length, counted: results.filter((r) => r.status === "ok").length, results });
});
