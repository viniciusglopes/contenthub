import "@/models/Post";
import "@/models/Project";
import SocialAccount from "@/models/SocialAccount";
import { InstagramAccountDaily, InstagramMedia } from "@/models/InstagramMedia";
import { NextResponse } from "next/server";
import { toFriendly } from "./accounts";
import { addDays, dayKey } from "./dates";
import type { DailyPoint, MediaItem } from "./stats";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Embrulha uma rota: erro vira JSON com mensagem em português. */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    const f = toFriendly(e);
    if (f.status >= 500) console.error("[instagram]", e instanceof Error ? e.name : "erro", f.message);
    return NextResponse.json({ error: f.message, field: f.field }, { status: f.status });
  }
}

export async function connectedAccounts(filter: { project?: string | null; account?: string | null } = {}) {
  const q: Record<string, unknown> = { platform: "instagram", "credentials.accessToken": { $exists: true, $ne: "" } };
  if (filter.project) q.project = filter.project;
  if (filter.account) q._id = filter.account;
  return SocialAccount.find(q).populate("project", "name slug color icon").sort({ active: -1, createdAt: 1 });
}

export async function loadInsightData(
  accountId: unknown,
  now: number = Date.now()
): Promise<{ daily: DailyPoint[]; media: MediaItem[] }> {
  const today = dayKey(now);
  const [dailyDocs, mediaDocs] = await Promise.all([
    InstagramAccountDaily.find({ account: accountId, date: { $gte: addDays(today, -75) } }).sort({ date: 1 }).lean(),
    InstagramMedia.find({ account: accountId, timestamp: { $gte: new Date(now - 90 * 86_400_000) } })
      .populate("post", "title")
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
