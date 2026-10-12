import { json, route } from "@/lib/api";
import { clearSessionCookie } from "@/lib/session";

export const POST = route("public", async () => {
  const res = json({ ok: true });
  clearSessionCookie(res);
  return res;
});
