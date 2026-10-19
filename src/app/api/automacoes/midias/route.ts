import { json, route } from "@/lib/api";
import { recentMedia } from "@/lib/automations/crud";

// Posts recentes de uma conta, para escolher onde a automação vale (lidos do que já foi sincronizado).
export const GET = route("org", async ({ org, req }) => json(await recentMedia(org, req.nextUrl.searchParams.get("account"))));
