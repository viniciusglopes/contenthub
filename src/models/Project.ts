import mongoose, { Schema, Document, Types } from "mongoose";
import { tenantPlugin } from "@/lib/tenant";

export interface IProject extends Document {
  organization: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  color: string;
  icon: string;
  platforms: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true },
    description: { type: String, default: "" },
    color: { type: String, default: "#f5c518" },
    icon: { type: String, default: "📱" },
    platforms: [{ type: String, enum: ["instagram", "tiktok", "youtube", "facebook", "twitter"] }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ProjectSchema.plugin(tenantPlugin, { model: "Project" });
// O endereço curto do projeto só precisa ser único dentro do cliente.
ProjectSchema.index({ organization: 1, slug: 1 }, { unique: true });

export default mongoose.models.Project || mongoose.model<IProject>("Project", ProjectSchema);
