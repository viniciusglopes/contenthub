import { json, route } from "@/lib/api";
import { brandVars, publicBrand } from "@/lib/brand";
import { applyBrand, audit } from "@/lib/orgs";
import { clientIp } from "@/lib/session";

// Marca do MEU cliente (nome exibido, logo, cor).
export const GET = route("owner", async ({ session }) => {
  const o = session!.organization;
  return json({ _id: String(o._id), name: o.name, slug: o.slug, brand: publicBrand(o), rawBrand: o.brand });
});

export const PUT = route("owner", async ({ session, body, req }) => {
  const s = session!;
  applyBrand(s.organization, await body());
  await s.organization.save();
  await audit({ action: "marca.alterada", actor: s.user, organization: s.orgId, ip: clientIp(req) });
  const brand = publicBrand(s.organization);
  return json({ brand, vars: brandVars(brand.color) });
});
