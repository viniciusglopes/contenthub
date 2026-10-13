import mongoose, { Schema } from "mongoose";
import { tenantPlugin } from "@/lib/tenant";

// USO DE IA: uma linha por chamada a provedor (inclusive as que falharam, com custo zero).
// O custo é ESTIMADO pela tabela de preços do catálogo; a cotação do dia fica gravada na linha.
const AiUsageSchema = new Schema(
  {
    at: { type: Date, required: true, index: true },
    purpose: { type: String, required: true }, // texto | voz | imagem | video | musica
    service: { type: String, required: true },
    model: { type: String, default: "" },
    what: { type: String, default: "" }, // roteiro do carrossel, narração, cena de vídeo...
    units: { type: Number, default: 0 },
    unit: { type: String, default: "" }, // tokens | caracteres | imagens | segundos
    costUsd: { type: Number, default: 0 },
    costBrl: { type: Number, default: 0 },
    fxRate: { type: Number, default: 0 },
    fxDate: { type: String, default: "" },
    fxSource: { type: String, default: "" },
    ok: { type: Boolean, default: true },
    error: { type: String, default: "" },
    ms: { type: Number, default: 0 },
    /** chave da casa (da plataforma) usada porque o cliente não tem a própria */
    house: { type: Boolean, default: false },
    job: { type: Schema.Types.ObjectId, ref: "StudioJob", default: null },
    project: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    by: { type: String, default: "" },
  },
  { timestamps: false }
);
AiUsageSchema.plugin(tenantPlugin, { model: "AiUsage" });
AiUsageSchema.index({ organization: 1, at: -1 });
export default mongoose.models.AiUsage || mongoose.model("AiUsage", AiUsageSchema);
