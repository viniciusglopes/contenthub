import mongoose, { Schema } from "mongoose";

// Cliente do ContentHub (white label). Tudo que é dado de cliente aponta para uma organização.
const OrganizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    brand: {
      displayName: { type: String, default: "" }, // vazio = "ContentHub"
      logo: { type: String, default: "" }, // https://... ou data:image/...;base64
      color: { type: String, default: "" }, // #rrggbb; vazio = cor padrão
    },
    active: { type: Boolean, default: true },
    // Publicação automática no Instagram: desligada por padrão; só o administrador da plataforma liga.
    publishEnabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.Organization || mongoose.model("Organization", OrganizationSchema);
