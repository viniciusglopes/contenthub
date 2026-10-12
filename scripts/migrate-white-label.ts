// Migração para white label. Uso:
//   MONGODB_URI=... npx tsx scripts/migrate-white-label.ts            (ENSAIO: só conta, não escreve)
//   MONGODB_URI=... npx tsx scripts/migrate-white-label.ts --apply    (escreve)
// Em banco que não é local, --apply exige também --confirmo-producao.
// Pode rodar quantas vezes quiser: a segunda vez não muda nada.
import mongoose from "mongoose";
import { migrateToWhiteLabel } from "../src/lib/migration";

async function main() {
  const uri = process.env.MONGODB_URI || "";
  const apply = process.argv.includes("--apply");
  if (!uri) throw new Error("Defina MONGODB_URI.");
  const host = uri.replace(/^mongodb(\+srv)?:\/\/([^@/]*@)?/, "").split(/[/?]/)[0]; // sem usuário e senha
  const local = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
  if (apply && !local && !process.argv.includes("--confirmo-producao")) {
    throw new Error(`O banco ${host} não é local. Para escrever nele, acrescente --confirmo-producao.`);
  }
  await mongoose.connect(uri);
  console.log(`Banco: ${host} / ${mongoose.connection.name} · modo: ${apply ? "APLICAR" : "ENSAIO (nada é escrito)"}`);
  const report = await migrateToWhiteLabel({ apply });
  console.log(JSON.stringify(report, null, 2));
  if (apply && report.orphansAfter > 0) throw new Error(`Sobraram ${report.orphansAfter} registros sem organização.`);
  console.log(apply ? "Migração concluída: 0 registros sem organização." : "Ensaio concluído. Rode com --apply para gravar.");
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
