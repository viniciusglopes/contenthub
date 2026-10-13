import mongoose, { Schema } from "mongoose";

// DADOS DA PLATAFORMA (não são de cliente: só o administrador mexe, por /api/admin/estudio).

// Chave "da casa": usada quando o cliente não tem a própria. O custo é contabilizado para o cliente.
const HouseCredentialSchema = new Schema(
  {
    service: { type: String, required: true, unique: true },
    credentials: { type: Map, of: String, default: {} },
    purposes: { type: [String], default: [] },
    models: { type: Map, of: String, default: {} },
    active: { type: Boolean, default: true },
    lastTest: { at: { type: Date, default: null }, ok: { type: Boolean, default: false }, message: { type: String, default: "" } },
  },
  { timestamps: true }
);
export const HouseCredential = mongoose.models.HouseCredential || mongoose.model("HouseCredential", HouseCredentialSchema);

export const STUDIO_DEFAULTS = { capUsd: 5, confirmAboveUsd: 0.1, maxJobsGlobal: 2, maxJobsPerOrg: 1, jobMaxMinutes: 30 };
const PlatformSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "main" },
    chains: { type: Schema.Types.Mixed, default: {} },
    capUsd: { type: Number, default: STUDIO_DEFAULTS.capUsd },
    confirmAboveUsd: { type: Number, default: STUDIO_DEFAULTS.confirmAboveUsd },
    maxJobsGlobal: { type: Number, default: STUDIO_DEFAULTS.maxJobsGlobal },
    maxJobsPerOrg: { type: Number, default: STUDIO_DEFAULTS.maxJobsPerOrg },
    jobMaxMinutes: { type: Number, default: STUDIO_DEFAULTS.jobMaxMinutes },
  },
  { timestamps: true, minimize: false }
);
export const PlatformSettings = mongoose.models.PlatformSettings || mongoose.model("PlatformSettings", PlatformSettingsSchema);

// Cotação do dólar por dia (PTAX de venda do Banco Central).
const FxRateSchema = new Schema({ date: { type: String, required: true, unique: true }, rate: { type: Number, required: true }, source: { type: String, default: "" }, fetchedAt: { type: Date, default: null } });
export const FxRate = mongoose.models.FxRate || mongoose.model("FxRate", FxRateSchema);
