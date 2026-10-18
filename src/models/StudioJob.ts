import mongoose, { Schema } from "mongoose";
import { tenantPlugin } from "@/lib/tenant";

// FILA DO ESTÚDIO: um trabalho de geração de Reel. O estado inteiro mora aqui, para o trabalho
// sobreviver a um reinício do servidor (ver src/lib/studio/jobs.ts).
export const JOB_STATUSES = ["queued", "running", "waiting", "done", "failed", "canceled"] as const;
const StudioJobSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    kind: { type: String, enum: ["reel_montado", "reel_ia", "reel_cenas"], required: true },
    status: { type: String, enum: JOB_STATUSES, default: "queued", index: true },
    title: { type: String, default: "" },
    progress: { type: Number, default: 0 },
    step: { type: String, default: "Na fila" },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    /** quando pode ser pego de novo (espera do provedor de vídeo, nova tentativa) */
    runAfter: { type: Date, default: null },
    lockId: { type: String, default: "" },
    lockedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    deadlineAt: { type: Date, default: null },
    error: { type: String, default: "" },
    input: { type: Schema.Types.Mixed, default: {} },
    /** o que já foi feito (ids dos pedidos no provedor de vídeo, arquivos prontos): é o que permite retomar */
    state: { type: Schema.Types.Mixed, default: {} },
    estimateUsd: { type: Number, default: 0 },
    spentUsd: { type: Number, default: 0 },
    providers: { type: [String], default: [] },
    post: { type: Schema.Types.ObjectId, ref: "Post", default: null },
    asset: { type: Schema.Types.ObjectId, ref: "MediaAsset", default: null },
    seen: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true, minimize: false }
);
StudioJobSchema.plugin(tenantPlugin, { model: "StudioJob" });
StudioJobSchema.index({ status: 1, runAfter: 1, createdAt: 1 });
export default mongoose.models.StudioJob || mongoose.model("StudioJob", StudioJobSchema);
