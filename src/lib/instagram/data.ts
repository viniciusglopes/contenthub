import "@/models/Post";
import "@/models/Project";
import SocialAccount from "@/models/SocialAccount";
import { InstagramAccountDaily, InstagramMedia } from "@/models/InstagramMedia";
import type { Types } from "mongoose";
import { toObjectId } from "@/lib/tenant";
import { addDays, dayKey } from "./dates";
import type { DailyPoint, MediaItem } from "./stats";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Projeto populado SEMPRE com a organização no filtro: referência cruzada não vaza. */
export const projectOf = (org: Types.ObjectId) => ({ path: "project", select: "name slug color icon", match: { organization: org } });

/** Contas conectadas DA organização. Filtro com id malformado não acha nada. */
export async function connectedAccounts(
  org: Types.ObjectId,
  filter: { project?: string | null; account?: string | null } = {}
) {
  const q: Record<string, unknown> = {
    organization: org,
    platform: "instagram",
    "credentials.accessToken": { $exists: true, $ne: "" },
  };
  if (filter.project) q.project = toObjectId(filter.project) ?? null;
  if (filter.account) q._id = toObjectId(filter.account) ?? null;
  return SocialAccount.find(q).populate(projectOf(org)).sort({ active: -1, createdAt: 1 });
}

export async function loadInsightData(
  org: Types.ObjectId,
  accountId: unknown,
  now: number = Date.now()
): Promise<{ daily: DailyPoint[]; media: MediaItem[] }> {
  const today = dayKey(now);
  const [dailyDocs, mediaDocs] = await Promise.all([
    InstagramAccountDaily.find({ organization: org, account: accountId, date: { $gte: addDays(today, -75) } }).sort({ date: 1 }).lean(),
    InstagramMedia.find({ organization: org, account: accountId, timestamp: { $gte: new Date(now - 90 * 86_400_000) } })
      .populate({ path: "post", select: "title", match: { organization: org } })
      .sort({ timestamp: -1 })
      .lean(),
  ]);
  return {
    daily: (dailyDocs as any[]).map((d) => ({ date: d.date, followers: d.followers, reach: d.reach, views: d.views })),
    media: (mediaDocs as any[]).map((m) => ({
      igId: m.igId,
      kind: m.kind,
      caption: m.caption,
      permalink: m.permalink,
      timestamp: m.timestamp,
      thumbnailUrl: m.thumbnailUrl,
      metrics: m.metrics || {},
      postTitle: m.post?.title,
    })),
  };
}
