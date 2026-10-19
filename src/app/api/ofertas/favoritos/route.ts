import { json, route } from "@/lib/api";
import { moduleEnabled, setFavorite } from "@/lib/offers/offers";

// Favoritar (por usuário): { kind: "org"|"casa", id, on: true|false }
export const POST = route("org", async ({ org, body, session }) => json(await setFavorite(org, session!.userId, await body(), await moduleEnabled(session!))));
