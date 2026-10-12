import { json, route } from "@/lib/api";
import { renewInstagram, publicAccount } from "@/lib/instagram/accounts";

export const POST = route("org", async ({ org, params }) => json(publicAccount(await renewInstagram(org, params.id))));
