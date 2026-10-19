import { json, route } from "@/lib/api";
import { findOrgOffer, history } from "@/lib/offers/offers";

// Histórico de 90 dias: contagem por dia, de onde veio (API ou manual), quem registrou e a observação.
export const GET = route("org", async ({ org, params }) => json(await history("org", await findOrgOffer(org, params.id), org)));
