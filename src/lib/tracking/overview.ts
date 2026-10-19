import type { Types } from "mongoose";
import { FriendlyError, notFound } from "@/lib/errors";
import type { Session } from "@/lib/session";
import { toObjectId } from "@/lib/tenant";
import Project from "@/models/Project";
import { CapiLog, Sale, SalesIntegration, TrackingSite } from "@/models/Tracking";
import { capiSwitch, sendCapi } from "./capi";
import { publicSite, trackingSwitch } from "./collect";
import { listSales, publicIntegration } from "./sales";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Org = Types.ObjectId;

export async function capiLogs(org: Org) {
  const rows: any[] = await CapiLog.find({ organization: org }).sort({ at: -1 }).limit(100).lean();
  return rows.map((r) => ({ _id: String(r._id), eventName: r.eventName, eventId: r.eventId, status: r.status, reason: r.reason, keys: r.keys, actionSource: r.actionSource, value: r.value, testEventCode: r.testEventCode, response: r.response, at: r.at, contact: r.contact ? String(r.contact) : null }));
}

export async function trackingOverview(org: Org, session: Session) {
  const [sites, projects, integrations, sales, logs, totals] = await Promise.all([
    TrackingSite.find({ organization: org }).sort({ createdAt: 1 }).lean(),
    Project.find({ organization: org }).select("name icon").sort({ name: 1 }).lean(),
    SalesIntegration.find({ organization: org }).sort({ createdAt: 1 }).lean(),
    listSales(org, new URLSearchParams("limite=30")),
    capiLogs(org),
    Sale.aggregate([{ $match: { organization: org, at: { $gte: new Date(Date.now() - 30 * 86_400_000) } } }, { $group: { _id: "$kind", n: { $sum: 1 }, value: { $sum: "$value" } } }]),
  ]);
  return {
    tracking: trackingSwitch(session.organization),
    capi: capiSwitch(session.organization),
    canManage: session.canManage,
    projects: (projects as any[]).map((p) => ({ _id: String(p._id), name: p.name, icon: p.icon || "" })),
    sites: (sites as any[]).map(publicSite),
    integrations: (integrations as any[]).map(publicIntegration),
    sales,
    logs: logs.slice(0, 30),
    last30: Object.fromEntries((totals as any[]).map((t) => [t._id, { n: t.n, value: Math.round(t.value * 100) / 100 }])),
  };
}

/** Evento de teste (Lead) com o código de teste do Gerenciador de Eventos. Nada vai sem as três chaves ligadas. */
export async function testCapi(org: Org, id: unknown, meta: { ip: string; ua: string }) {
  const oid = toObjectId(id);
  const site: any = oid ? await TrackingSite.findOne({ _id: oid, organization: org }).lean() : null;
  if (!site) throw notFound("Site");
  if (!site.capi?.testEventCode) throw new FriendlyError("Preencha o código de teste (Gerenciador de Eventos › Testar eventos) antes.", 400, "testEventCode");
  const r = await sendCapi(org, site, { eventName: "Lead", eventId: `teste.${Date.now()}`, at: new Date(), test: true, person: { externalId: `teste-contenthub-${String(org)}`, ip: meta.ip !== "local" ? meta.ip : "", ua: meta.ua }, url: (site.domains?.[0] ? `https://${site.domains[0]}/` : ""), actionSource: meta.ua ? "website" : "system_generated" });
  return r;
}
