import { json, route } from "@/lib/api";
import { publicBrand } from "@/lib/brand";
import { FriendlyError, notFound } from "@/lib/errors";
import { publishEnabled } from "@/lib/instagram/publish";
import { publicInvite } from "@/lib/invites";
import { applyBrand, audit, publicUser } from "@/lib/orgs";
import { clientIp } from "@/lib/session";
import AuditLog from "@/models/AuditLog";
import Invite from "@/models/Invite";
import Organization from "@/models/Organization";
import User from "@/models/User";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Detalhe de um cliente: usuários, convites de pé e os últimos acessos "entrar como".
export const GET = route("admin", async ({ params, id }) => {
  const organization: any = await Organization.findById(id(params.id, "Cliente")).lean();
  if (!organization) throw notFound("Cliente");
  const [users, invites, log] = await Promise.all([
    User.find({ organization: organization._id }).sort({ active: -1, name: 1 }).lean(),
    Invite.find({ organization: organization._id, usedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean(),
    AuditLog.find({ organization: organization._id, action: /^impersonacao\./ }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  return json({
    _id: String(organization._id),
    name: organization.name,
    slug: organization.slug,
    active: organization.active,
    publishEnabled: organization.publishEnabled === true,
    publishGlobal: publishEnabled(),
    commentReplyEnabled: organization.commentReplyEnabled === true,
    commentReplyGlobal: process.env.IG_COMMENT_REPLY_ENABLED === "true",
    brand: publicBrand(organization),
    rawBrand: organization.brand || {},
    users: users.map(publicUser),
    invites: invites.map((i) => publicInvite(i)),
    impersonations: (log as any[]).map((l) => ({ action: l.action, actorEmail: l.actorEmail, at: l.createdAt })),
  });
});

// Um Salvar: nome, marca e ativo/inativo. Desativar NÃO apaga nada: só bloqueia o acesso.
export const PUT = route("admin", async ({ params, id, body, session, req }) => {
  const s = session!;
  const organization = await Organization.findById(id(params.id, "Cliente"));
  if (!organization) throw notFound("Cliente");
  const b = await body();
  if (b.name !== undefined) {
    const name = String(b.name).trim().slice(0, 80);
    if (name.length < 2) throw new FriendlyError("Diga o nome do cliente.", 400, "name");
    organization.name = name;
  }
  applyBrand(organization, b);
  if (b.active !== undefined) {
    if (!b.active && String(organization._id) === String(s.homeOrgId))
      throw new FriendlyError("Essa é a sua própria organização: não dá para desativar.", 400);
    organization.active = Boolean(b.active);
  }
  // Chave de publicação automática deste cliente: só aqui, só o administrador da plataforma.
  const publishChanged = b.publishEnabled !== undefined && Boolean(b.publishEnabled) !== (organization.publishEnabled === true);
  if (publishChanged) organization.publishEnabled = Boolean(b.publishEnabled);
  // Chave de responder comentários pelo ContentHub: mesma regra (só aqui, só o administrador).
  const replyChanged = b.commentReplyEnabled !== undefined && Boolean(b.commentReplyEnabled) !== (organization.commentReplyEnabled === true);
  if (replyChanged) organization.commentReplyEnabled = Boolean(b.commentReplyEnabled);
  await organization.save();
  if (replyChanged)
    await audit({ action: organization.commentReplyEnabled ? "cliente.resposta_comentario_ligada" : "cliente.resposta_comentario_desligada", actor: s.user, organization: organization._id, ip: clientIp(req) });
  if (publishChanged)
    await audit({ action: organization.publishEnabled ? "cliente.publicacao_ligada" : "cliente.publicacao_desligada", actor: s.user, organization: organization._id, ip: clientIp(req) });
  await audit({
    action: b.active === undefined ? "cliente.alterado" : organization.active ? "cliente.ativado" : "cliente.desativado",
    actor: s.user,
    organization: organization._id,
    ip: clientIp(req),
  });
  return json({ _id: String(organization._id), name: organization.name, active: organization.active, publishEnabled: organization.publishEnabled === true, commentReplyEnabled: organization.commentReplyEnabled === true, brand: publicBrand(organization) });
});
