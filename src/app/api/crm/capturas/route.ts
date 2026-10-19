import { json, route } from "@/lib/api";
import { createCapture, publicCapture } from "@/lib/crm/capture";
import { LeadCapture } from "@/models/Crm";

/* eslint-disable @typescript-eslint/no-explicit-any */
const orgName = (o: any) => o?.brand?.displayName || o?.name || "empresa";

// Formulários de captura (página própria / link de post) com o HTML pronto para colar.
export const GET = route("org", async ({ org, session }) => {
  const rows: any[] = await LeadCapture.find({ organization: org }).sort({ createdAt: -1 }).lean();
  return json({ captures: await Promise.all(rows.map((c) => publicCapture(org, c, orgName(session!.organization)))) });
});
export const POST = route("org", async ({ org, body, session }) => json(await publicCapture(org, (await createCapture(org, await body())).toObject(), orgName(session!.organization)), 201));
