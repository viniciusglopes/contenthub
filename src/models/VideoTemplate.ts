import mongoose, { Schema } from "mongoose";
import { tenantPlugin } from "@/lib/tenant";

// PADRÃO DE VÍDEO (Reel com cenas): um jeito salvo de fazer os vídeos de um projeto (voz, cores,
// fontes, legenda, cortes, categorias de cena, trilha, duração, chamada, estrutura e guia da IA).
// `settings` é sempre o resultado de validateSettings (src/lib/studio/cenas-spec.ts).
const VideoTemplateSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    name: { type: String, required: true },
    settings: { type: Schema.Types.Mixed, required: true },
    /** trabalho de onde o padrão foi salvo ("salvar como padrão") */
    fromJob: { type: Schema.Types.ObjectId, ref: "StudioJob", default: null },
    isDefault: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, minimize: false }
);
VideoTemplateSchema.plugin(tenantPlugin, { model: "VideoTemplate" });
VideoTemplateSchema.index({ organization: 1, project: 1, name: 1 }, { unique: true });
export default mongoose.models.VideoTemplate || mongoose.model("VideoTemplate", VideoTemplateSchema);
