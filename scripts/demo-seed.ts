// Dados de EXEMPLO (white label) para ver as telas sem token de verdade.
// Exige IG_MOCK=1 e banco local. Cria o administrador (ADMIN_EMAIL/ADMIN_PASSWORD) e
// clientes em situações diferentes: com dados, recém-criado, aguardando o dono e inativo.
import mongoose from "mongoose";
import type { Types } from "mongoose";
import Organization from "../src/models/Organization";
import Post from "../src/models/Post";
import Project from "../src/models/Project";
import User from "../src/models/User";
import { InstagramAccountDaily } from "../src/models/InstagramMedia";
import { hashPassword } from "../src/lib/auth";
import { connectInstagram } from "../src/lib/instagram/accounts";
import { addDays, dayKey } from "../src/lib/instagram/dates";
import { syncAccount } from "../src/lib/instagram/sync";
import { createInvite } from "../src/lib/invites";
import { ensureAdmin, ensureDefaultOrganization } from "../src/lib/orgs";

const uri = process.env.MONGODB_URI || "";
if (!/127\.0\.0\.1|localhost/.test(uri) || process.env.IG_MOCK !== "1") {
  console.error("Recusado: o seed de demonstração só roda em banco local e com IG_MOCK=1.");
  process.exit(1);
}

export const DEMO_PASSWORD = "demo-senha-2026";
const LOGO = (letter: string, color: string) =>
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${color}"/><text x="32" y="44" font-family="Arial" font-size="36" font-weight="700" text-anchor="middle" fill="#fff">${letter}</text></svg>`
  ).toString("base64");

async function content(org: Types.ObjectId, project: Types.ObjectId, titles: string[], token: string, followers: number) {
  const now = Date.now();
  for (const [i, title] of titles.entries()) {
    await Post.create({
      organization: org,
      project,
      title,
      caption: "Legenda de exemplo",
      format: i % 2 === 0 ? "reel" : "carrossel",
      platforms: ["instagram"],
      scheduledDate: new Date(now + (i - 2) * 86_400_000),
      scheduledTime: ["09:00", "12:00", "19:00"][i % 3],
      status: i < 2 ? "posted" : i < 4 ? "scheduled" : "draft",
      externalIds: i === 0 ? { instagram: "1800000000000100" } : {},
    });
  }
  const account = await connectInstagram(org, { project: String(project), token });
  const today = dayKey(now);
  for (let i = 1; i <= 45; i++) {
    await InstagramAccountDaily.updateOne(
      { organization: org, account: account._id, date: addDays(today, -i) },
      { $set: { project, followers: followers - i * Math.round(followers / 600) - Math.round(Math.sin(i * 1.3) * 9) } },
      { upsert: true }
    );
  }
  return syncAccount(org, String(account._id));
}

async function main() {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const password = await hashPassword(DEMO_PASSWORD);
  const user = (organization: Types.ObjectId, role: string, name: string, email: string, lastLoginAt?: Date) =>
    User.create({ organization, role, name, email, passwordHash: password, passwordSetAt: new Date(), lastLoginAt: lastLoginAt ?? null });

  // 1) A casa: Vínculo Digital (organização padrão) + administrador pelas envs
  const home = await ensureDefaultOrganization();
  console.log("Administrador:", await ensureAdmin({ force: true }));
  const hdmoj = await Project.create({ organization: home._id, name: "Hora de Mudar o Jogo", slug: "hora-de-mudar-o-jogo", color: "#f5c518", icon: "🔥", platforms: ["instagram", "tiktok"] });
  await Project.create({ organization: home._id, name: "Compre sem Moderação", slug: "compre-sem-moderacao", color: "#ec4899", icon: "🛍️", platforms: ["instagram"] });
  const r1 = await content(home._id, hdmoj._id, ["Reel: 3 hábitos de manhã", "Carrossel: checklist do sim", "Frase do dia", "Reel: recomeçar", "Carrossel: rotina de 20 min", "Reel: constância"], "IGAA-token-de-demonstracao-0001", 12512);

  // 2) Cliente com marca própria e dados diferentes
  const bella = await Organization.create({ name: "Studio Bella Forma", slug: "bella-forma", brand: { displayName: "Bella Forma", color: "#ec4899", logo: LOGO("B", "#ec4899") } });
  await user(bella._id, "owner", "Marina Duarte", "marina@bellaforma.exemplo", new Date(Date.now() - 3 * 3_600_000));
  await user(bella._id, "member", "Rafael Lima", "rafael@bellaforma.exemplo", new Date(Date.now() - 26 * 3_600_000));
  const pilates = await Project.create({ organization: bella._id, name: "Bella Forma Pilates", slug: "bella-forma-pilates", color: "#ec4899", icon: "🧘", platforms: ["instagram"] });
  const r2 = await content(bella._id, pilates._id, ["Reel: alongamento de 5 minutos", "Carrossel: 4 erros na postura", "Depoimento da aluna Ana", "Reel: aula experimental", "Carrossel: horários de novembro"], "IGAA-conta-bellaformapilates-01", 4380);
  await createInvite({ kind: "member", organization: bella._id, email: "recepcao@bellaforma.exemplo" });

  // 3) Cliente que acabou de entrar: dono criado, nenhum projeto (primeira experiência)
  const padaria = await Organization.create({ name: "Padaria Pão Quente", slug: "pao-quente", brand: { displayName: "Pão Quente", color: "#f97316" } });
  await user(padaria._id, "owner", "Seu Jorge", "jorge@paoquente.exemplo");

  // 4) Cliente criado, aguardando o dono aceitar o convite
  const clinica = await Organization.create({ name: "Clínica Sorriso Certo", slug: "sorriso-certo", brand: { color: "#06b6d4" } });
  const invite = await createInvite({ kind: "owner", organization: clinica._id, email: "dra.paula@sorrisocerto.exemplo" });

  // 5) Cliente desativado
  const antiga = await Organization.create({ name: "Loja Antiga Modas", slug: "loja-antiga", active: false });
  await user(antiga._id, "owner", "Carla Nunes", "carla@lojaantiga.exemplo", new Date(Date.now() - 80 * 86_400_000));

  console.log(
    JSON.stringify({
      senhaDeTodos: DEMO_PASSWORD,
      admin: process.env.ADMIN_EMAIL,
      donaBella: "marina@bellaforma.exemplo",
      donoNovo: "jorge@paoquente.exemplo",
      convite: invite.path,
      sincronizados: [r1.media, r2.media],
    })
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
