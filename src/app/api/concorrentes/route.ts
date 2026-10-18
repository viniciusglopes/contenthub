import { json, route } from "@/lib/api";
import { AD_LIBRARY_NOTE, IG_DISCOVERY_NOTE, createCompetitor, publicCompetitor } from "@/lib/competitors/competitors";
import { youtubeKey } from "@/lib/competitors/youtube";
import { notFound } from "@/lib/errors";
import { assertProject } from "@/lib/orgs";
import { toObjectId } from "@/lib/tenant";
import { AdAccount } from "@/models/Ads";
import { Competitor, CompetitorDaily } from "@/models/Competitor";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Concorrentes do projeto, com a última leitura pública e o crescimento desde a primeira foto.
export const GET = route("org", async ({ org, req }) => {
  const project = toObjectId(req.nextUrl.searchParams.get("project"));
  if (!project) throw notFound("Projeto");
  await assertProject(org, project);
  const list: any[] = await Competitor.find({ organization: org, project }).sort({ createdAt: 1 }).lean();
  const daily: any[] = list.length ? await CompetitorDaily.find({ organization: org, competitor: { $in: list.map((c) => c._id) } }).sort({ date: 1 }).lean() : [];
  const [ads, key] = await Promise.all([AdAccount.find({ organization: org, active: true, igUserId: { $ne: "" } }).select("project").lean(), youtubeKey(org)]);
  return json({
    competitors: list.map((c) => publicCompetitor(c, daily.filter((d) => String(d.competitor) === String(c._id)))),
    sources: { instagram: ads.length > 0, instagramNote: IG_DISCOVERY_NOTE, youtube: Boolean(key), youtubeHouse: Boolean(key?.house), adLibraryNote: AD_LIBRARY_NOTE },
  });
});

// Novo concorrente: { project, name, instagram?, youtube?, facebookPage?, notes? }
export const POST = route("org", async ({ org, body }) => {
  const c = await createCompetitor(org, await body());
  return json(publicCompetitor(c), 201);
});
