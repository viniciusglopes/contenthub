import mongoose, { Schema, Document, Types } from "mongoose";

export interface ISocialAccount extends Document {
  project: Types.ObjectId;
  platform: "instagram" | "tiktok" | "youtube" | "facebook" | "twitter";
  accountName: string;
  accountId: string;
  credentials: {
    accessToken?: string;
    refreshToken?: string;
    appId?: string;
    appSecret?: string;
    apiKey?: string;
    apiSecret?: string;
    bearerToken?: string;
    pageId?: string;
    channelId?: string;
    clientKey?: string;
    clientSecret?: string;
  };
  active: boolean;
  lastSync: Date | null;
  tokenExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SocialAccountSchema = new Schema<ISocialAccount>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    platform: {
      type: String,
      enum: ["instagram", "tiktok", "youtube", "facebook", "twitter"],
      required: true,
    },
    accountName: { type: String, required: true },
    accountId: { type: String, default: "" },
    credentials: {
      accessToken: String,
      refreshToken: String,
      appId: String,
      appSecret: String,
      apiKey: String,
      apiSecret: String,
      bearerToken: String,
      pageId: String,
      channelId: String,
      clientKey: String,
      clientSecret: String,
    },
    active: { type: Boolean, default: true },
    lastSync: { type: Date, default: null },
    tokenExpiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

SocialAccountSchema.index({ project: 1, platform: 1 });

export default mongoose.models.SocialAccount ||
  mongoose.model<ISocialAccount>("SocialAccount", SocialAccountSchema);
