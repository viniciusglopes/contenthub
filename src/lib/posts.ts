import type { Types } from "mongoose";
import { FriendlyError } from "@/lib/errors";
import { assertProject } from "@/lib/orgs";
import { toObjectId } from "@/lib/tenant";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Só estes campos de um post podem vir do navegador. `organization` nunca.
const FIELDS = [
  "title", "content", "caption", "format", "platforms", "scheduledDate", "scheduledTime",
  "status", "tags", "hashtags", "cta", "productionNotes", "mediaUrls",
] as const;

/** Limpa o corpo de um post e confere que o projeto é da organização. */
export async function postInput(org: Types.ObjectId, body: Record<string, any>, opts: { partial?: boolean } = {}) {
  const out: Record<string, any> = {};
  for (const k of FIELDS) if (body[k] !== undefined) out[k] = body[k];
  // A situação do post só muda pelo fluxo de aprovação (src/lib/workflow.ts). Daqui só entra
  // "rascunho" ou "publicado por fora" na criação/importação; na edição, nunca.
  if (opts.partial) delete out.status;
  else if (out.status !== "posted") out.status = "draft";
  if (out.scheduledTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(out.scheduledTime)))
    throw new FriendlyError("Informe o horário no formato 09:00.", 400, "scheduledTime");
  if (body.project !== undefined || !opts.partial) {
    const raw = typeof body.project === "object" && body.project ? body.project._id : body.project;
    const projectId = toObjectId(String(raw || ""));
    if (!projectId) throw new FriendlyError("Escolha o projeto do post.", 400, "project");
    await assertProject(org, projectId);
    out.project = projectId;
  }
  if (!opts.partial) out.organization = org;
  return out;
}
