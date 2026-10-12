// Dados de EXEMPLO para ver as telas sem token de verdade. Exige IG_MOCK=1 e banco local.
import mongoose from "mongoose";
import Post from "../src/models/Post";
import Project from "../src/models/Project";
import { InstagramAccountDaily } from "../src/models/InstagramMedia";
import { connectInstagram } from "../src/lib/instagram/accounts";
import { addDays, dayKey } from "../src/lib/instagram/dates";
import { syncAccount } from "../src/lib/instagram/sync";

const uri = process.env.MONGODB_URI || "";
if (!/127\.0\.0\.1|localhost/.test(uri) || process.env.IG_MOCK !== "1") {
  console.error(
    "Recusado: o seed de demonstração só roda em banco local e com IG_MOCK=1.",
  );
  process.exit(1);
}
async function main() {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();

  const hdmoj = await Project.create({
    name: "Hora de Mudar o Jogo",
    slug: "hora-de-mudar-o-jogo",
    color: "#f5c518",
    icon: "🔥",
    platforms: ["instagram", "tiktok"],
  });
  await Project.create({
    name: "Compre sem Moderação",
    slug: "compre-sem-moderacao",
    color: "#ec4899",
    icon: "🛍️",
    platforms: ["instagram"],
  });

  const now = Date.now();
  for (let i = 0; i < 6; i++) {
    await Post.create({
      project: hdmoj._id,
      title: [
        "Reel: 3 hábitos de manhã",
        "Carrossel: checklist do sim",
        "Frase do dia",
        "Reel: recomeçar",
        "Carrossel: rotina de 20 min",
        "Reel: constância",
      ][i],
      caption: "Legenda de exemplo",
      format: i % 2 === 0 ? "reel" : "carrossel",
      platforms: ["instagram"],
      scheduledDate: new Date(now + (i - 2) * 86_400_000),
      scheduledTime: ["09:00", "12:00", "19:00"][i % 3],
      status: i < 2 ? "posted" : i < 4 ? "scheduled" : "draft",
      // o primeiro casa com uma mídia do Instagram de exemplo
      externalIds: i === 0 ? { instagram: "1800000000000100" } : {},
    });
  }

  const account = await connectInstagram({
    project: String(hdmoj._id),
    token: "IGAA-token-de-demonstracao-0001",
  });
  const today = dayKey(now);
  for (let i = 1; i <= 45; i++) {
    const wobble = Math.round(Math.sin(i * 1.3) * 9);
    await InstagramAccountDaily.updateOne(
      { account: account._id, date: addDays(today, -i) },
      { $set: { project: hdmoj._id, followers: 12512 - i * 23 - wobble } },
      { upsert: true },
    );
  }
  const result = await syncAccount(String(account._id));
  console.log(
    "Seed pronto:",
    JSON.stringify({ projeto: String(hdmoj._id), ...result }),
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
