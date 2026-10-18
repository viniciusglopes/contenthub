import { json, route } from "@/lib/api";
import { findAdAccount, publicAdAccount, removeAdAccount } from "@/lib/ads/accounts";
import { FriendlyError } from "@/lib/errors";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Ajustes da conta de anúncio: ativa/inativa e qual Instagram usar para ler concorrentes.
export const PUT = route("org", async ({ org, params, body }) => {
  const acc: any = await findAdAccount(org, params.id);
  const b = await body();
  if (b.active !== undefined) acc.active = Boolean(b.active);
  if (b.igUserId !== undefined) {
    const v = String(b.igUserId || "");
    if (v && !(acc.igAccounts || []).some((i: any) => i.id === v)) throw new FriendlyError("Essa conta do Instagram não aparece para esse token.", 400, "igUserId");
    acc.igUserId = v;
  }
  await acc.save();
  return json(publicAdAccount(acc));
});

// Desconectar: apaga o token e os números guardados aqui. Nada muda na Meta.
export const DELETE = route("org", async ({ org, params }) => {
  await removeAdAccount(org, params.id);
  return json({ ok: true });
});
