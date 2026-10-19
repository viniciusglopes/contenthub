import { json, route } from "@/lib/api";
import { leadDetail, mergeLeads } from "@/lib/crm/leads";

// Juntar dois cadastros da mesma pessoa ({ other }). Fica o do Instagram, senão este.
export const POST = route("org", async ({ org, params, body, session }) => {
  const kept: any = await mergeLeads(org, params.id, (await body()).other, session!.user); // eslint-disable-line @typescript-eslint/no-explicit-any
  return json(await leadDetail(org, kept._id));
});
