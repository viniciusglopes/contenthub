import mongoose, { Schema } from "mongoose";
import { tenantPlugin } from "@/lib/tenant";

// CONCORRENTES por projeto: perfis públicos (Instagram e YouTube), anúncios e produtos.
const CompetitorSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    name: { type: String, required: true, trim: true },
    /** @ do Instagram, sem o @ */
    instagram: { type: String, default: "" },
    /** @handle do YouTube (sem @) ou id do canal (UC...) */
    youtube: { type: String, default: "" },
    /** página do Facebook (id numérico ou nome) para a Biblioteca de Anúncios */
    facebookPage: { type: String, default: "" },
    notes: { type: String, default: "" },
    /** última leitura do Instagram: { at, followers, mediaCount, name, media[], error } */
    ig: { type: Schema.Types.Mixed, default: null },
    /** última leitura do YouTube: { at, channelId, title, subscribers, videoCount, viewCount, videos[], error } */
    yt: { type: Schema.Types.Mixed, default: null },
    /** última tentativa pela API da Biblioteca de Anúncios: { at, count, ads[], note, error } */
    adLibrary: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);
CompetitorSchema.plugin(tenantPlugin, { model: "Competitor" });

// Foto do dia (seguidores, inscritos) para ver o crescimento do concorrente com o tempo.
const CompetitorDailySchema = new Schema(
  {
    competitor: { type: Schema.Types.ObjectId, ref: "Competitor", required: true },
    date: { type: String, required: true },
    igFollowers: { type: Number, default: null },
    igMedia: { type: Number, default: null },
    ytSubscribers: { type: Number, default: null },
    ytVideos: { type: Number, default: null },
    ytViews: { type: Number, default: null },
  },
  { timestamps: true }
);
CompetitorDailySchema.plugin(tenantPlugin, { model: "CompetitorDaily" });
CompetitorDailySchema.index({ competitor: 1, date: 1 }, { unique: true });

// Produto do concorrente: tabela à mão (nada de raspar Hotmart).
const CompetitorProductSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    competitor: { type: Schema.Types.ObjectId, ref: "Competitor", default: null },
    name: { type: String, required: true, trim: true },
    platform: { type: String, default: "" },
    price: { type: Number, default: null },
    promise: { type: String, default: "" },
    link: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);
CompetitorProductSchema.plugin(tenantPlugin, { model: "CompetitorProduct" });

export const Competitor = mongoose.models.Competitor || mongoose.model("Competitor", CompetitorSchema);
export const CompetitorDaily = mongoose.models.CompetitorDaily || mongoose.model("CompetitorDaily", CompetitorDailySchema);
export const CompetitorProduct = mongoose.models.CompetitorProduct || mongoose.model("CompetitorProduct", CompetitorProductSchema);
