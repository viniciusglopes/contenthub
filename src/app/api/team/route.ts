import { json, route } from "@/lib/api";
import { publicInvite } from "@/lib/invites";
import { publicUser } from "@/lib/orgs";
import Invite from "@/models/Invite";
import User from "@/models/User";

// Equipe do cliente (da organização da sessão) + convites ainda de pé.
export const GET = route("owner", async ({ org }) => {
  const [users, invites] = await Promise.all([
    User.find({ organization: org }).sort({ active: -1, name: 1 }).lean(),
    Invite.find({ organization: org, usedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean(),
  ]);
  return json({ users: users.map(publicUser), invites: invites.map((i) => publicInvite(i)) });
});
