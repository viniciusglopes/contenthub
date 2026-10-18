import { json, route } from "@/lib/api";
import { FriendlyError } from "@/lib/errors";
import { toObjectId } from "@/lib/tenant";
import { brl, checkBudget, usd } from "@/lib/studio/cost";
import { kick, publicJob } from "@/lib/studio/jobs";
import { planReel } from "@/lib/studio/studio";
import { planCenas } from "@/lib/studio/cenas";
import { fmtEta } from "@/lib/studio/cenas-spec";
import StudioJob from "@/models/StudioJob";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Trabalhos do Estúdio da organização da sessão (os 30 mais recentes; ?project= filtra).
export const GET = route("org", async ({ org, req }) => {
  const filter: Record<string, unknown> = { organization: org };
  const p = req.nextUrl.searchParams.get("project");
  if (p) filter.project = toObjectId(p) ?? null;
  const jobs = await StudioJob.find(filter).sort({ createdAt: -1 }).limit(30).lean();
  return json(jobs.map(publicJob));
});

// Cria um trabalho de Reel: { project, kind: "reel_montado" | "reel_ia", script, voz, imagensIA, trilha, confirm }
// ou { project, kind: "reel_cenas", template, settings (ajustes por cima do padrão), script, simular }.
// O custo estimado é calculado ANTES; vídeo de IA sempre pede confirmação explícita; o teto mensal barra.
export const POST = route("org", async ({ org, body, id, session }) => {
  const b = await body();
  if (b.kind === "reel_cenas") {
    // Reel com cenas: sem IA paga (voz gratuita da Microsoft); mostra duração e tempo previstos
    const project = id(b.project, "Projeto");
    const plan = await planCenas(org, project, b);
    const info = { seconds: plan.seconds, etaSeconds: plan.eta, eta: fmtEta(plan.eta), scenesAvailable: plan.scenesAvailable, blockers: plan.blockers, templateName: plan.templateName };
    if (b.simular === true) return json({ needsConfirm: false, simulated: true, message: "Este Reel não usa IA paga: custo zero.", estimateUsd: 0, estimateBrl: 0, lines: [], leftUsd: null, ...info });
    const job: any = await StudioJob.create({
      organization: org, project, kind: "reel_cenas", title: plan.input.script.cenas[0].titulo.replace(/\*/g, "").slice(0, 120), input: plan.input, estimateUsd: 0, maxAttempts: 2,
      createdBy: session!.user._id, createdByName: session!.user?.name || "",
    });
    kick();
    return json({ ...publicJob(job), ...info }, 201);
  }
  const kind = b.kind === "reel_ia" ? "reel_ia" : b.kind === "reel_montado" ? "reel_montado" : null;
  if (!kind) throw new FriendlyError("Diga o tipo de Reel.", 400);
  const project = id(b.project, "Projeto");
  const plan = await planReel(org, project, kind, b);
  const check = await checkBudget(org, plan.estimateUsd, b.confirm === true);
  const mustConfirm = check.needsConfirm || (kind === "reel_ia" && b.confirm !== true);
  if (mustConfirm || b.simular === true)
    return json({ needsConfirm: mustConfirm, simulated: b.simular === true, message: plan.estimateUsd ? `Este Reel deve custar cerca de ${usd(plan.estimateUsd)} (${brl(check.estimateBrl)}). O valor é estimado: o que vale é o extrato do provedor.` : "Este Reel não usa IA paga: custo zero.", estimateUsd: plan.estimateUsd, estimateBrl: check.estimateBrl, lines: plan.lines, seconds: plan.seconds, blockers: plan.blockers, leftUsd: check.budget.leftUsd }, mustConfirm && b.simular !== true ? 409 : 200);
  const job: any = await StudioJob.create({
    organization: org, project, kind, title: plan.input.script.cenas[0].titulo.replace(/\*/g, "").slice(0, 120), input: plan.input, estimateUsd: plan.estimateUsd,
    createdBy: session!.user._id, createdByName: session!.user?.name || "",
  });
  kick();
  return json(publicJob(job), 201);
});
