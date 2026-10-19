import type { Types } from "mongoose";
import type { Session } from "@/lib/session";
import { AdObject } from "@/models/Ads";
import { Contact } from "@/models/Automation";
import { LeadTask } from "@/models/Crm";
import { leadAdsSwitch } from "./leadads";
import { teamOf } from "./leads";
import { listPipelines, publicPipeline } from "./pipelines";
import { SOURCE_PT } from "./pure";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** O que os filtros e formulários do CRM precisam, numa chamada só (tudo da organização). */
export async function crmOptions(org: Types.ObjectId, session: Session) {
  const [pipelines, team, tags, sources, campaignIds, campaigns, overdue] = await Promise.all([
    listPipelines(org),
    teamOf(org),
    Contact.distinct("tags", { organization: org, lead: true }),
    Contact.distinct("origin.kind", { organization: org, lead: true }),
    Contact.distinct("firstTouch.campaignId", { organization: org, lead: true }),
    AdObject.find({ organization: org, level: "campaign" }).select("metaId name").lean(),
    LeadTask.countDocuments({ organization: org, done: false, dueAt: { $lt: new Date() }, assignee: session.user?._id }),
  ]);
  const names = new Map((campaigns as any[]).map((c) => [c.metaId, c.name]));
  const ids = new Set([...(campaignIds as string[]).filter(Boolean), ...(campaigns as any[]).map((c) => c.metaId)]);
  return {
    pipelines: pipelines.map(publicPipeline),
    team,
    me: session.userId,
    canManage: session.canManage,
    tags: (tags as string[]).filter(Boolean).sort(),
    sources: (sources as string[]).filter(Boolean).map((k) => ({ key: k, label: SOURCE_PT[k] || k })),
    allSources: Object.entries(SOURCE_PT).map(([key, label]) => ({ key, label })),
    campaigns: [...ids].map((id) => ({ id, name: names.get(id) || id })).sort((a, b) => a.name.localeCompare(b.name)),
    overdueMine: overdue,
    leadAds: leadAdsSwitch(session.organization),
  };
}
