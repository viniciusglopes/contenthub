import { json, route } from "@/lib/api";
import { decrypt, encrypt } from "@/lib/crypto";
import { FriendlyError } from "@/lib/errors";
import { YT_SERVICE, fetchYoutubeChannel } from "@/lib/competitors/youtube";
import { audit } from "@/lib/orgs";
import { clientIp } from "@/lib/session";
import { HouseCredential } from "@/models/Platform";

/* eslint-disable @typescript-eslint/no-explicit-any */

// CHAVES DA CASA de dados públicos (hoje: YouTube Data API, para concorrentes). Só administrador.
// A chave nunca volta: só "tem chave" e o resultado do último teste.
async function state() {
  const yt: any = await HouseCredential.findOne({ service: YT_SERVICE }).lean();
  const creds = yt?.credentials instanceof Map ? Object.fromEntries(yt.credentials) : yt?.credentials || {};
  return { youtube: { hasKey: Boolean(creds.apiKey), active: yt ? yt.active !== false : false, lastTest: yt?.lastTest?.at ? yt.lastTest : null } };
}

export const GET = route("admin", async () => json(await state()));

// { acao: "youtube", apiKey } | { acao: "testar_youtube" } | { acao: "apagar_youtube" }
export const PUT = route("admin", async ({ body, session, req }) => {
  const b = await body();
  if (b.acao === "youtube") {
    const key = String(b.apiKey || "").trim();
    if (!/^[A-Za-z0-9_-]{30,60}$/.test(key)) throw new FriendlyError("A chave parece incompleta. Copie de novo, inteira e sem espaços.", 400, "apiKey");
    await HouseCredential.updateOne(
      { service: YT_SERVICE },
      { $set: { "credentials.apiKey": encrypt(key), active: true, purposes: [], lastTest: { at: null, ok: false, message: "" } }, $setOnInsert: { service: YT_SERVICE } },
      { upsert: true }
    );
    await audit({ action: "integracoes.youtube_chave_salva", actor: session!.user, ip: clientIp(req) });
  } else if (b.acao === "testar_youtube") {
    const doc: any = await HouseCredential.findOne({ service: YT_SERVICE });
    const raw = doc?.credentials?.get("apiKey");
    if (!raw) throw new FriendlyError("Cadastre a chave primeiro.", 400, "apiKey");
    let ok = true;
    let message = "";
    try {
      const s = await fetchYoutubeChannel("@YouTube", decrypt(String(raw)));
      message = `Chave funcionando (${s.units} unidades da cota gratuita gastas no teste).`;
    } catch (e) {
      ok = false;
      message = e instanceof FriendlyError ? e.message : "Falhou.";
    }
    doc.lastTest = { at: new Date(), ok, message };
    await doc.save();
  } else if (b.acao === "apagar_youtube") {
    await HouseCredential.deleteOne({ service: YT_SERVICE });
    await audit({ action: "integracoes.youtube_chave_apagada", actor: session!.user, ip: clientIp(req) });
  } else throw new FriendlyError("Ação desconhecida.", 400);
  return json(await state());
});
