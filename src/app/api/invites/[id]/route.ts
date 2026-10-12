import { json, route } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { audit } from "@/lib/orgs";
import { clientIp } from "@/lib/session";
import Invite from "@/models/Invite";

// Cancela um convite pendente da minha organização (o link para de valer na hora).
export const DELETE = route("owner", async ({ org, params, id, session, req }) => {
  const invite = await Invite.findOneAndUpdate(
    { _id: id(params.id, "Convite"), organization: org, usedAt: null, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!invite) throw notFound("Convite");
  await audit({ action: "convite.cancelado", actor: session!.user, organization: org, target: invite.email, ip: clientIp(req) });
  return json({ ok: true });
});
