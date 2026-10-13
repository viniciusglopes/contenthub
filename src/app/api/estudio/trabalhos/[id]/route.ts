import { json, route } from "@/lib/api";
import { FriendlyError, notFound } from "@/lib/errors";
import { publicJob } from "@/lib/studio/jobs";
import StudioJob from "@/models/StudioJob";

// Andamento de um trabalho (a tela consulta enquanto ele roda).
export const GET = route("org", async ({ org, params, id }) => {
  const job = await StudioJob.findOne({ _id: id(params.id, "Trabalho"), organization: org }).lean();
  if (!job) throw notFound("Trabalho");
  return json(publicJob(job));
});

// { seen: true } marca o aviso de "terminou" como visto.
export const PUT = route("org", async ({ org, params, id }) => {
  const job = await StudioJob.findOneAndUpdate({ _id: id(params.id, "Trabalho"), organization: org }, { $set: { seen: true } }, { returnDocument: "after" }).lean();
  if (!job) throw notFound("Trabalho");
  return json(publicJob(job));
});

// Cancela um trabalho que ainda não terminou (o que já foi gasto com IA não volta).
export const DELETE = route("org", async ({ org, params, id }) => {
  const _id = id(params.id, "Trabalho");
  const job = await StudioJob.findOneAndUpdate({ _id, organization: org, status: { $in: ["queued", "running", "waiting"] } }, { $set: { status: "canceled", step: "Cancelado", lockId: "", lockedAt: null, runAfter: null, finishedAt: new Date() } }, { returnDocument: "after" }).lean();
  if (!job) {
    if (!(await StudioJob.exists({ _id, organization: org }))) throw notFound("Trabalho");
    throw new FriendlyError("Esse trabalho já terminou.", 409);
  }
  return json(publicJob(job));
});
