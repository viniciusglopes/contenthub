import { json, route } from "@/lib/api";
import { slugify } from "@/lib/brand";
import { FriendlyError } from "@/lib/errors";
import Project from "@/models/Project";

const PLATFORMS = ["instagram", "tiktok", "youtube", "facebook", "twitter"];

export const GET = route("org", async ({ org }) => {
  return json(await Project.find({ organization: org, active: true }).sort({ name: 1 }));
});

export const POST = route("org", async ({ org, body }) => {
  const b = await body();
  const name = String(b.name || "").trim().slice(0, 80);
  if (name.length < 2) throw new FriendlyError("Dê um nome ao projeto.", 400, "name");
  const base = slugify(name) || "projeto";
  let slug = base;
  for (let i = 2; await Project.exists({ organization: org, slug }); i++) slug = `${base}-${i}`;
  const project = await Project.create({
    organization: org,
    name,
    slug,
    description: String(b.description || "").slice(0, 300),
    color: /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : undefined,
    icon: String(b.icon || "📱").slice(0, 8),
    platforms: Array.isArray(b.platforms) ? b.platforms.filter((p: unknown) => PLATFORMS.includes(String(p))) : [],
  });
  return json(project, 201);
});
