import mongoose, { Schema } from "mongoose";
import { tenantPlugin } from "@/lib/tenant";

// KIT DE MARCA: um por projeto. É o que o Estúdio usa para escrever (tom, público, regras do
// setor) e para desenhar (paleta, fontes, logo, assinatura com o registro profissional).
const BrandKitSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    name: { type: String, default: "" }, // nome que assina as peças
    handle: { type: String, default: "" }, // @ do Instagram
    profession: { type: String, default: "" },
    registration: { type: String, default: "" }, // CRO-SP 12345, CRM, OAB...
    segment: { type: String, default: "" },
    offer: { type: String, default: "" }, // o que oferece
    audience: { type: String, default: "" },
    city: { type: String, default: "" },
    tone: { adjectives: { type: [String], default: [] }, avoid: { type: [String], default: [] } },
    palette: {
      background: { type: String, default: "#F6F2EA" },
      text: { type: String, default: "#14323B" },
      accent: { type: String, default: "#A47C48" },
      support: { type: String, default: "#DCE5E2" },
    },
    fontPair: { type: String, default: "serifa" },
    sector: { type: String, default: "geral" },
    logo: { type: Schema.Types.ObjectId, ref: "MediaAsset", default: null },
  },
  { timestamps: true }
);
BrandKitSchema.plugin(tenantPlugin, { model: "BrandKit" });
BrandKitSchema.index({ organization: 1, project: 1 }, { unique: true });
export default mongoose.models.BrandKit || mongoose.model("BrandKit", BrandKitSchema);
