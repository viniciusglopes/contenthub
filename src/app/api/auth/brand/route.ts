import { json, route } from "@/lib/api";
import { brandVars, publicBrand } from "@/lib/brand";
import Organization from "@/models/Organization";

// Marca da tela de entrada (/login?c=<slug>). Público: devolve só nome exibido, logo e cor
// de cliente ATIVO. Slug desconhecido devolve a marca padrão (não revela quem é cliente).
export const GET = route("public", async ({ req }) => {
  const slug = String(req.nextUrl.searchParams.get("slug") || "").toLowerCase().slice(0, 80);
  const org = /^[a-z0-9-]+$/.test(slug) ? await Organization.findOne({ slug, active: true }).select("brand").lean() : null;
  const brand = publicBrand(org as never);
  return json({ brand, vars: brandVars(brand.color) });
});
