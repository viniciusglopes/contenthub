import { json, route } from "@/lib/api";
import { testInstagram, publicAccount } from "@/lib/instagram/accounts";

export const POST = route("org", async ({ org, params }) => json(publicAccount(await testInstagram(org, params.id))));
