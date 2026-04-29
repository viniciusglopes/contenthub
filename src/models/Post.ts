import mongoose, { Schema, Document, Types } from "mongoose";

export interface IPost extends Document {
  project: Types.ObjectId;
  title: string;
  content: string;
  caption: string;
  format: "reel" | "story" | "post" | "carrossel" | "shorts";
  platforms: string[];
  scheduledDate: Date;
  scheduledTime: string;
  status: "draft" | "approved" | "scheduled" | "posted" | "failed";
  tags: string[];
  hashtags: string[];
  cta: string;
  productionNotes: string;
  mediaUrls: string[];
  externalIds: Record<string, string>;
  metrics: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const PostSchema = new Schema<IPost>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    title: { type: String, required: true },
    content: { type: String, default: "" },
    caption: { type: String, default: "" },
    format: {
      type: String,
      enum: ["reel", "story", "post", "carrossel", "shorts"],
      required: true,
    },
    platforms: [{ type: String, enum: ["instagram", "tiktok", "youtube", "facebook", "twitter"] }],
    scheduledDate: { type: Date, required: true, index: true },
    scheduledTime: { type: String, required: true },
    status: {
      type: String,
      enum: ["draft", "approved", "scheduled", "posted", "failed"],
      default: "draft",
      index: true,
    },
    tags: [String],
    hashtags: [String],
    cta: { type: String, default: "" },
    productionNotes: { type: String, default: "" },
    mediaUrls: [String],
    externalIds: { type: Map, of: String, default: {} },
    metrics: {
      views: Number,
      likes: Number,
      comments: Number,
      shares: Number,
      saves: Number,
    },
  },
  { timestamps: true }
);

PostSchema.index({ project: 1, scheduledDate: 1 });
PostSchema.index({ status: 1, scheduledDate: 1 });

export default mongoose.models.Post || mongoose.model<IPost>("Post", PostSchema);
