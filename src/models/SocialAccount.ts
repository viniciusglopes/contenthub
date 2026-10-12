import mongoose, { Schema, Document, Types } from "mongoose";
import { tenantPlugin } from "@/lib/tenant";

export interface ISocialAccount extends Document {
  organization: Types.ObjectId;
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
  tokenObtainedAt: Date | null;
  tokenExpiryEstimated: boolean;
  username: string;
  accountType: string;
  followersCount: number | null;
  mediaCount: number | null;
  profilePictureUrl: string;
  lastSyncError: string;
  lastSyncStats: { media?: number; matchedPosts?: number; days?: number } | null;
  /** até que dia os posts já foram buscados na Meta (histórico) */
  mediaHistorySince: Date | null;
  /** última busca de histórico (12 meses) e o que ela trouxe */
  historyFetchedAt: Date | null;
  historyNote: string;
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
    // Instagram (API oficial): dados da conexão. O token fica em credentials.accessToken, criptografado.
    tokenObtainedAt: { type: Date, default: null },
    tokenExpiryEstimated: { type: Boolean, default: false },
    username: { type: String, default: "" },
    accountType: { type: String, default: "" },
    followersCount: { type: Number, default: null },
    mediaCount: { type: Number, default: null },
    profilePictureUrl: { type: String, default: "" },
    lastSyncError: { type: String, default: "" },
    lastSyncStats: { type: Schema.Types.Mixed, default: null },
    mediaHistorySince: { type: Date, default: null },
    historyFetchedAt: { type: Date, default: null },
    historyNote: { type: String, default: "" },
  },
  { timestamps: true }
);

SocialAccountSchema.plugin(tenantPlugin, { model: "SocialAccount" });
SocialAccountSchema.index({ project: 1, platform: 1 });

export default mongoose.models.SocialAccount ||
  mongoose.model<ISocialAccount>("SocialAccount", SocialAccountSchema);
