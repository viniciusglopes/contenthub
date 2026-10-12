import mongoose, { Schema } from "mongoose";
import { tenantPlugin } from "@/lib/tenant";

const metrics = {
  reach: Number,
  views: Number,
  likes: Number,
  comments: Number,
  saved: Number,
  shares: Number,
  totalInteractions: Number,
  avgWatchTimeMs: Number,
  totalWatchTimeMs: Number,
};

// Uma linha por mídia do Instagram, com o último valor conhecido de cada métrica.
// `post` aponta para o Post do calendário quando casou por externalIds.instagram;
// sem isso, é uma mídia importada (publicada fora do ContentHub).
const InstagramMediaSchema = new Schema(
  {
    account: { type: Schema.Types.ObjectId, ref: "SocialAccount", required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    igId: { type: String, required: true },
    mediaType: String,
    productType: String,
    kind: { type: String, default: "imagem" },
    caption: { type: String, default: "" },
    permalink: String,
    timestamp: { type: Date, required: true, index: true },
    thumbnailUrl: String,
    post: { type: Schema.Types.ObjectId, ref: "Post", default: null },
    metrics,
    metricsUpdatedAt: Date,
    insightsError: { type: String, default: "" },
  },
  { timestamps: true }
);
InstagramMediaSchema.plugin(tenantPlugin, { model: "InstagramMedia" });
InstagramMediaSchema.index({ project: 1, timestamp: -1 });
// A mesma conta do Instagram pode estar conectada em dois clientes (agência e marca):
// a mídia é única POR conta conectada, não no banco inteiro.
InstagramMediaSchema.index({ account: 1, igId: 1 }, { unique: true });

// Histórico diário por mídia: permite comparar a evolução de um post entre semanas.
const InstagramMediaDailySchema = new Schema(
  {
    account: { type: Schema.Types.ObjectId, ref: "SocialAccount", required: true },
    igId: { type: String, required: true },
    date: { type: String, required: true }, // AAAA-MM-DD (Brasília)
    metrics,
  },
  { timestamps: true }
);
InstagramMediaDailySchema.plugin(tenantPlugin, { model: "InstagramMediaDaily" });
InstagramMediaDailySchema.index({ account: 1, igId: 1, date: 1 }, { unique: true });
InstagramMediaDailySchema.index({ account: 1, date: 1 });

// Histórico diário da conta: seguidores (foto do dia) e alcance/views do dia.
const InstagramAccountDailySchema = new Schema(
  {
    account: { type: Schema.Types.ObjectId, ref: "SocialAccount", required: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    date: { type: String, required: true },
    followers: Number,
    reach: Number,
    views: Number,
  },
  { timestamps: true }
);
InstagramAccountDailySchema.plugin(tenantPlugin, { model: "InstagramAccountDaily" });
InstagramAccountDailySchema.index({ account: 1, date: 1 }, { unique: true });

export const InstagramMedia =
  mongoose.models.InstagramMedia || mongoose.model("InstagramMedia", InstagramMediaSchema);
export const InstagramMediaDaily =
  mongoose.models.InstagramMediaDaily || mongoose.model("InstagramMediaDaily", InstagramMediaDailySchema);
export const InstagramAccountDaily =
  mongoose.models.InstagramAccountDaily ||
  mongoose.model("InstagramAccountDaily", InstagramAccountDailySchema);
