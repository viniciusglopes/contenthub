import mongoose from "mongoose";
import { tenantPlugin } from "@/lib/tenant";

const ApiCredentialSchema = new mongoose.Schema(
  {
    service: { type: String, required: true },
    label: { type: String, required: true },
    credentials: { type: Map, of: String, default: {} },
    active: { type: Boolean, default: true },
    // Estúdio: para que a chave serve (texto, voz, imagem, video, musica), modelo por finalidade
    // (vazio = o padrão do catálogo) e o resultado do último "Testar chave".
    purposes: { type: [String], default: [] },
    models: { type: Map, of: String, default: {} },
    lastTest: { at: { type: Date, default: null }, ok: { type: Boolean, default: false }, message: { type: String, default: "" } },
  },
  { timestamps: true }
);

ApiCredentialSchema.plugin(tenantPlugin, { model: "ApiCredential" });
// Cada cliente tem as próprias chaves: um registro por serviço POR organização.
ApiCredentialSchema.index({ organization: 1, service: 1 }, { unique: true });

export default mongoose.models.ApiCredential ||
  mongoose.model("ApiCredential", ApiCredentialSchema);
