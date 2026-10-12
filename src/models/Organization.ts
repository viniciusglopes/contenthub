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
  },
  { timestamps: true }
);

export default mongoose.models.Organization || mongoose.model("Organization", OrganizationSchema);
