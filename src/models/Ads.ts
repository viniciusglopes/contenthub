import mongoose, { Schema } from "mongoose";
import { tenantPlugin } from "@/lib/tenant";

// TRÁFEGO (Meta Ads, só leitura na v1).
// Uma conta de anúncio por projeto (pode haver mais de uma). O token fica criptografado em
// credentials.accessToken (AES-256-GCM, CONTENTHUB_ENC_KEY), igual às contas do Instagram.
const AdAccountSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    platform: { type: String, enum: ["meta"], default: "meta" },
    /** "act_123..." */
    adAccountId: { type: String, required: true },
    name: { type: String, default: "" },
    currency: { type: String, default: "" },
    timezone: { type: String, default: "" },
    /** 1 = ativa (código da Meta); o texto vai pronto para a tela em accountStatusText */
    accountStatus: { type: Number, default: null },
    credentials: { accessToken: String },
    tokenObtainedAt: { type: Date, default: null },
    /** quem gerou o token (nome do usuário do Facebook), só para a pessoa reconhecer */
    metaUserName: { type: String, default: "" },
    /** contas do Instagram ligadas às páginas que o token enxerga (para a busca de concorrentes) */
    igAccounts: { type: [{ _id: false, id: String, username: String, pageId: String, pageName: String }], default: [] },
    /** conta do Instagram escolhida para a busca de concorrentes (Business Discovery) */
    igUserId: { type: String, default: "" },
    active: { type: Boolean, default: true },
    lastSync: { type: Date, default: null },
    lastSyncError: { type: String, default: "" },
    lastSyncStats: { type: Schema.Types.Mixed, default: null },
    /** dia mais antigo já buscado (AAAA-MM-DD) */
    insightsSince: { type: String, default: "" },
    /** alcance de verdade (sem somar dias) dos períodos-padrão: { "<de>_<ate>": { reach, at } } */
    reachByRange: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false }
);
AdAccountSchema.plugin(tenantPlugin, { model: "AdAccount" });
AdAccountSchema.index({ organization: 1, project: 1, adAccountId: 1 }, { unique: true });

// Campanha, conjunto ou anúncio (última foto conhecida).
const AdObjectSchema = new Schema(
  {
    adAccount: { type: Schema.Types.ObjectId, ref: "AdAccount", required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    level: { type: String, enum: ["campaign", "adset", "ad"], required: true },
    metaId: { type: String, required: true },
    name: { type: String, default: "" },
    status: { type: String, default: "" },
    effectiveStatus: { type: String, default: "" },
    objective: { type: String, default: "" },
    campaignId: { type: String, default: "" },
    adsetId: { type: String, default: "" },
    /** em centavos da moeda da conta (como a Meta devolve) */
    dailyBudget: { type: Number, default: null },
    lifetimeBudget: { type: Number, default: null },
    optimizationGoal: { type: String, default: "" },
    thumbnailUrl: { type: String, default: "" },
    /** anúncio feito a partir de um post do Instagram: id da mídia (liga com o orgânico) */
    igMediaId: { type: String, default: "" },
    igPermalink: { type: String, default: "" },
    createdTime: { type: Date, default: null },
  },
  { timestamps: true }
);
AdObjectSchema.plugin(tenantPlugin, { model: "AdObject" });
AdObjectSchema.index({ adAccount: 1, level: 1, metaId: 1 }, { unique: true });

// Números por anúncio e por dia (dia da conta de anúncio). O período escolhido soma estas linhas.
const AdInsightDailySchema = new Schema(
  {
    adAccount: { type: Schema.Types.ObjectId, ref: "AdAccount", required: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    date: { type: String, required: true },
    adId: { type: String, required: true },
    adsetId: { type: String, default: "" },
    campaignId: { type: String, default: "" },
    spend: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    /** alcance do dia: somar dias conta a mesma pessoa mais de uma vez */
    reach: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    linkClicks: { type: Number, default: 0 },
    purchases: { type: Number, default: 0 },
    purchaseValue: { type: Number, default: 0 },
    leads: { type: Number, default: 0 },
  },
  { timestamps: true }
);
AdInsightDailySchema.plugin(tenantPlugin, { model: "AdInsightDaily" });
AdInsightDailySchema.index({ adAccount: 1, adId: 1, date: 1 }, { unique: true });
AdInsightDailySchema.index({ adAccount: 1, date: 1 });

export const AdAccount = mongoose.models.AdAccount || mongoose.model("AdAccount", AdAccountSchema);
export const AdObject = mongoose.models.AdObject || mongoose.model("AdObject", AdObjectSchema);
export const AdInsightDaily = mongoose.models.AdInsightDaily || mongoose.model("AdInsightDaily", AdInsightDailySchema);
