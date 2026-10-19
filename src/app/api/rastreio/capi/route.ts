import { json, route } from "@/lib/api";
import { capiLogs } from "@/lib/tracking/overview";

// Registro dos envios à API de Conversões (o que foi, o que a Meta respondeu; nunca os dados da pessoa).
export const GET = route("org", async ({ org }) => json({ logs: await capiLogs(org) }));
