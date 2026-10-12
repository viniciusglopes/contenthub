import mongoose, { Schema, Document, Types } from "mongoose";
import { tenantPlugin } from "@/lib/tenant";

export interface IPost extends Document {
  organization: Types.ObjectId;
  project: Types.ObjectId;
  title: string;
  content: string;
  caption: string;
  format: "reel" | "story" | "post" | "carrossel" | "shorts";
  platforms: string[];
  scheduledDate: Date;
  scheduledTime: string;
  status: PostStatus;
  tags: string[];
  hashtags: string[];
  cta: string;
  productionNotes: string;
  mediaUrls: string[];
  media: Types.ObjectId[];
  publishAt: Date | null;
  approval: { by: Types.ObjectId | null; byName: string; at: Date | null };
  review: { requestedByName: string; requestedAt: Date | null; note: string; noteByName: string; noteAt: Date | null };
  publish: PublishState;
  history: { at: Date; type: string; by: string; note: string }[];
  externalIds: Record<string, string>;
  metrics: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

// rascunho -> aguardando aprovação -> aprovado/agendado -> publicando -> publicado | falhou | perdeu o horário
// ("approved" é do fluxo antigo, sem registro de quem aprovou: vale como aguardando aprovação)
export const POST_STATUSES = ["draft", "pending", "approved", "scheduled", "publishing", "posted", "failed", "missed"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** Estado do agendador para este post. Só o agendador escreve aqui. */
export interface PublishState {
  lockId: string;
  lockedAt: Date | null;
  /** horário de referência para a tolerância de atraso (o agendado, ou o do "tentar de novo") */
  dueAt: Date | null;
  startedAt: Date | null;
  attempts: number;
  recoveries: number;
  nextAttemptAt: Date | null;
  containerId: string;
  children: string[];
  containerAt: Date | null;
  publishCalledAt: Date | null;
  publishedAt: Date | null;
  lastError: string;
  lastErrorKind: string;
  lastErrorAt: Date | null;
  /** o Instagram disse que publicou mas não conseguimos confirmar o id: conferir antes de tentar de novo */
  uncertain: boolean;
  waitNote: string;
}

const PostSchema = new Schema<IPost>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    title: { type: String, required: true },
    content: { type: String, default: "" },
    caption: { type: String, default: "" },
    format: {
      type: String,
      enum: ["reel", "story", "post", "carrossel", "shorts"],
      required: true,
    },
    platforms: [{ type: String, enum: ["instagram", "tiktok", "youtube", "facebook", "twitter"] }],
    scheduledDate: { type: Date, required: true, index: true },
    scheduledTime: { type: String, required: true },
    status: {
      type: String,
      enum: POST_STATUSES,
      default: "draft",
      index: true,
    },
    tags: [String],
    hashtags: [String],
    cta: { type: String, default: "" },
    productionNotes: { type: String, default: "" },
    mediaUrls: [String],
    media: [{ type: Schema.Types.ObjectId, ref: "MediaAsset" }],
    publishAt: { type: Date, default: null },
    approval: {
      by: { type: Schema.Types.ObjectId, ref: "User", default: null },
      byName: { type: String, default: "" },
      at: { type: Date, default: null },
    },
    review: {
      requestedByName: { type: String, default: "" },
      requestedAt: { type: Date, default: null },
      note: { type: String, default: "" },
      noteByName: { type: String, default: "" },
      noteAt: { type: Date, default: null },
    },
    publish: {
      lockId: { type: String, default: "" },
      lockedAt: { type: Date, default: null },
      dueAt: { type: Date, default: null },
      startedAt: { type: Date, default: null },
      attempts: { type: Number, default: 0 },
      recoveries: { type: Number, default: 0 },
      nextAttemptAt: { type: Date, default: null },
      containerId: { type: String, default: "" },
      children: { type: [String], default: [] },
      containerAt: { type: Date, default: null },
      publishCalledAt: { type: Date, default: null },
      publishedAt: { type: Date, default: null },
      lastError: { type: String, default: "" },
      lastErrorKind: { type: String, default: "" },
      lastErrorAt: { type: Date, default: null },
      uncertain: { type: Boolean, default: false },
      waitNote: { type: String, default: "" },
    },
    history: { type: [{ _id: false, at: Date, type: { type: String }, by: String, note: String }], default: [] },
    externalIds: { type: Map, of: String, default: {} },
    metrics: {
      views: Number,
      likes: Number,
      comments: Number,
      shares: Number,
      saves: Number,
    },
  },
  { timestamps: true }
);

PostSchema.plugin(tenantPlugin, { model: "Post" });
PostSchema.index({ organization: 1, scheduledDate: 1 });
PostSchema.index({ project: 1, scheduledDate: 1 });
PostSchema.index({ status: 1, scheduledDate: 1 });
PostSchema.index({ organization: 1, status: 1, publishAt: 1 });

export default mongoose.models.Post || mongoose.model<IPost>("Post", PostSchema);
