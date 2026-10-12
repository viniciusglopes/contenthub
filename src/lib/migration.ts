import mongoose from "mongoose";
import "@/models/ApiCredential";
import "@/models/InstagramMedia";
import "@/models/Post";
import "@/models/Project";
import "@/models/SocialAccount";
import Organization from "@/models/Organization";
import { DEFAULT_ORG, ensureAdmin, ensureDefaultOrganization } from "@/lib/orgs";
import { TENANT_MODELS } from "@/lib/tenant";

// MIGRAÇÃO PARA WHITE LABEL (idempotente).
// 1) cria a organização padrão ("Vínculo Digital");
// 2) põe nela tudo que ainda não tem organização (projetos, posts, contas, chaves, Instagram);
// 3) troca os índices únicos antigos (globais) pelos novos (por organização);
// 4) cria o administrador inicial se ADMIN_EMAIL/ADMIN_PASSWORD estiverem definidos.
// Rodar de novo não muda nada. Sem `apply` é só um ensaio: conta e não escreve.

// Índices únicos do tempo de um cliente só. Enquanto existirem, dois clientes não podem
// ter um projeto com o mesmo nome nem guardar a chave do mesmo serviço.
const LEGACY_UNIQUE: [model: string, index: string][] = [
  ["Project", "slug_1"],
  ["ApiCredential", "service_1"],
  ["InstagramMedia", "igId_1"],
  ["InstagramMediaDaily", "igId_1_date_1"],
];

const MISSING = { $or: [{ organization: { $exists: false } }, { organization: null }] };

export interface MigrationReport {
  applied: boolean;
  organization: { id: string | null; name: string; created: boolean };
  moved: Record<string, number>;
  movedTotal: number;
  droppedIndexes: string[];
  admin: string;
  orphansAfter: number;
}

export async function migrateToWhiteLabel(opts: { apply: boolean }): Promise<MigrationReport> {
  const before = await Organization.findOne({ slug: DEFAULT_ORG.slug });
  const org = opts.apply ? await ensureDefaultOrganization() : before;
  const report: MigrationReport = {
    applied: opts.apply,
    organization: { id: org ? String(org._id) : null, name: DEFAULT_ORG.name, created: !before && opts.apply },
    moved: {},
    movedTotal: 0,
    droppedIndexes: [],
    admin: "não verificado (ensaio)",
    orphansAfter: 0,
  };

  for (const name of TENANT_MODELS) {
    const collection = mongoose.models[name].collection;
    const missing = await collection.countDocuments(MISSING);
    report.moved[name] = missing;
    report.movedTotal += missing;
    if (opts.apply && missing > 0) await collection.updateMany(MISSING, { $set: { organization: org._id } });
  }

  for (const [name, index] of LEGACY_UNIQUE) {
    const collection = mongoose.models[name].collection;
    const indexes = await collection.indexes().catch(() => []);
    if (!indexes.some((i) => i.name === index && i.unique)) continue;
    report.droppedIndexes.push(`${collection.collectionName}.${index}`);
    if (opts.apply) await collection.dropIndex(index);
  }

  if (opts.apply) {
    for (const name of [...TENANT_MODELS, "Organization", "User", "Invite"]) {
      if (mongoose.models[name]) await mongoose.models[name].createIndexes();
    }
    await import("@/models/User");
    report.admin = await ensureAdmin({ force: true });
  }

  for (const name of TENANT_MODELS) report.orphansAfter += await mongoose.models[name].collection.countDocuments(MISSING);
  return report;
}
