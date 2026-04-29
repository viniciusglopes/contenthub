import mongoose, { Schema, Document } from "mongoose";

export interface IProject extends Document {
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
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    color: { type: String, default: "#f5c518" },
    icon: { type: String, default: "📱" },
    platforms: [{ type: String, enum: ["instagram", "tiktok", "youtube", "facebook", "twitter"] }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.Project || mongoose.model<IProject>("Project", ProjectSchema);
