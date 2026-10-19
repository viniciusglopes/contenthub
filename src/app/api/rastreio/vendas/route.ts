import { json, route } from "@/lib/api";
import { listSales } from "@/lib/tracking/sales";

export const GET = route("org", async ({ org, req }) => json({ sales: await listSales(org, req.nextUrl.searchParams) }));
