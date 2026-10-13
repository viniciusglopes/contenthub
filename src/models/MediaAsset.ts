import mongoose, { Schema } from "mongoose";
import { tenantPlugin } from "@/lib/tenant";

// Um arquivo de mídia (imagem já convertida para JPEG, ou vídeo) guardado no disco do app.
// O arquivo fica em <MEDIA_DIR>/<organização>/<file>; `file` é um nome sorteado (192 bits).
// `post` = null enquanto a mídia foi enviada mas o post ainda não foi salvo.
const MediaAssetSchema = new Schema(
  {
    post: { type: Schema.Types.ObjectId, ref: "Post", default: null, index: true },
    kind: { type: String, enum: ["image", "video", "audio"], required: true },
    /** guardada de propósito fora de post (logo do kit, trilha): a limpeza de órfãs não apaga */
    keep: { type: Boolean, default: false },
    file: { type: String, required: true },
    mime: { type: String, required: true },
    bytes: { type: Number, required: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    durationMs: { type: Number, default: null },
    fps: { type: Number, default: null },
    videoCodec: { type: String, default: "" },
    audioCodec: { type: String, default: "" },
    originalName: { type: String, default: "" },
    originalFormat: { type: String, default: "" },
    /** como a imagem foi ajustada: "" (original), "crop" (recortada) ou "pad" (com fundo) */
    fit: { type: String, default: "" },
    /** o que impede (level "erro") ou pode atrapalhar (level "aviso") a publicação */
    problems: { type: [{ _id: false, code: String, level: String, message: String }], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

MediaAssetSchema.plugin(tenantPlugin, { model: "MediaAsset" });
MediaAssetSchema.index({ organization: 1, file: 1 }, { unique: true });

export default mongoose.models.MediaAsset || mongoose.model("MediaAsset", MediaAssetSchema);
