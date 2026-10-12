import { randomUUID } from "node:crypto";
import type { Types } from "mongoose";
import { nowMs } from "@/lib/clock";
import { audit } from "@/lib/orgs";
import { historyEntry, loadAssets, publishable } from "@/lib/workflow";
import Organization from "@/models/Organization";
import Post from "@/models/Post";
import SocialAccount from "@/models/SocialAccount";
import { accountToken } from "./accounts";
import { InstagramApiError, InstagramClient } from "./client";
import { formatDateTimeBR } from "./dates";
import { ensureMock } from "./mock";
import { type PublishPlan, planPublish, publishEnabled } from "./publish";

/* eslint-disable @typescript-eslint/no-explicit-any */

// AGENDADOR: publica os posts aprovados cujo horário chegou.
//
// Como NUNCA publica duas vezes:
//  1) trava atômica: só um processo consegue trocar o post de "scheduled" para "publishing"
//     (findOneAndUpdate com o estado de partida no filtro). Toda gravação seguinte exige a
//     mesma trava; se outro processo a tomou, este para.
//  2) cada passo é gravado antes do próximo: o id do container fica no post. Se o processo
//     morrer no meio, a rodada seguinte NÃO cria outro post: pergunta ao Instagram em que pé
//     está aquele container (PUBLISHED = já saiu, só falta guardar o id; FINISHED = falta publicar).
//  3) trava parada há mais de LOCK_TTL (processo morreu) é retomada pela próxima rodada.
// Conferido na documentação da Meta em 12/10/2026: container vence em 24h; o estado é lido em
// GET /<container>?fields=status_code; a Meta recomenda consultar 1 vez por minuto por até 5 minutos;
// limite de publicações por 24h lido em GET /<ig>/content_publishing_limit.

type Org = Types.ObjectId;

export type Client = Pick<InstagramClient, "createContainer" | "getContainerStatus" | "publishContainer" | "getPublishingLimit" | "getPermalink" | "listMedia">;

export interface SchedulerDeps {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  clientFor?: (account: any) => Client;
  /** passou disso do horário marcado: não publica sozinho, marca "perdeu o horário" */
  toleranceMin?: number;
  maxPerRun?: number;
  /** consultas ao container dentro da mesma rodada (imagem fica pronta em segundos) */
  pollMs?: number;
  maxPolls?: number;
  lockTtlMs?: number;
  /** só para teste: simular queda do processo num ponto exato */
  hook?: (step: "after_container" | "before_publish" | "after_publish", postId: string) => void | Promise<void>;
  /** só para teste: restringir a rodada a alguns posts */
  onlyPosts?: string[];
}

export const DEFAULT_TOLERANCE_MIN = 60;
const RETRY_DELAYS_MS = [2 * 60_000, 10 * 60_000]; // no máximo 2 novas tentativas
const LIMIT_WAIT_MS = 30 * 60_000;
const PROCESSING_WAIT_MS = 60_000;
const PROCESSING_MAX_MS = 30 * 60_000;
const MAX_RECOVERIES = 3;

export function toleranceMinutes(): number {
  const n = Number(process.env.IG_PUBLISH_TOLERANCE_MIN);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_TOLERANCE_MIN;
}

// Erros de publicação documentados pela Meta (subcódigo -> o que fazer e o que dizer).
// Fonte: developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/error-codes
type Verdict = { action: "retry" | "retry_new" | "fail" | "limit" | "wait"; message: string };
const SUBCODES: Record<number, Verdict> = {
  2207001: { action: "retry", message: "O Instagram teve um erro interno." },
  2207003: { action: "retry", message: "O Instagram demorou demais para baixar a mídia." },
  2207008: { action: "retry", message: "O Instagram ainda não achou a mídia preparada." },
  2207020: { action: "retry_new", message: "A mídia preparada venceu no Instagram." },
  2207032: { action: "retry_new", message: "O Instagram não conseguiu preparar a mídia." },
  2207053: { action: "retry_new", message: "O Instagram teve um erro ao receber a mídia." },
  2207027: { action: "wait", message: "O Instagram ainda está preparando a mídia." },
  2207042: { action: "limit", message: "A conta atingiu o limite de publicações do Instagram nas últimas 24 horas." },
  2207004: { action: "fail", message: "A imagem é grande demais para o Instagram (o limite é 8 MB)." },
  2207005: { action: "fail", message: "O Instagram não aceitou o formato da imagem." },
  2207006: { action: "fail", message: "O Instagram não achou a mídia: a conexão da conta pode ter vencido ou perdido a permissão. Conecte a conta de novo." },
  2207009: { action: "fail", message: "O Instagram recusou a proporção da imagem (aceita de 4:5 a 1,91:1). Ajuste a imagem e aprove de novo." },
  2207010: { action: "fail", message: "A legenda passa do limite do Instagram (2.200 caracteres, 30 hashtags, 20 marcações)." },
  2207023: { action: "fail", message: "O Instagram não reconheceu o tipo da mídia." },
  2207026: { action: "fail", message: "O Instagram não aceitou o formato do vídeo. Exporte em MP4 (H.264 com áudio AAC) e envie de novo." },
  2207028: { action: "fail", message: "Carrossel precisa de 2 a 10 mídias." },
  2207050: { action: "fail", message: "A conta do Instagram está restrita ou com alguma pendência. Abra o aplicativo do Instagram e resolva o aviso que aparecer." },
  2207051: { action: "fail", message: "O Instagram bloqueou a ação por segurança (suspeita de spam). Abra o aplicativo do Instagram e confira os avisos da conta." },
  2207052: { action: "fail", message: "O Instagram não conseguiu baixar a mídia do nosso servidor. Avise o suporte." },
  2207057: { action: "fail", message: "O Instagram recusou a capa do vídeo." },
};

function judge(e: InstagramApiError): Verdict {
  const known = e.subcode ? SUBCODES[e.subcode] : undefined;
  const code = e.code ? ` (código ${e.code}${e.subcode ? `/${e.subcode}` : ""})` : "";
  if (known) return { ...known, message: `${known.message}${code}` };
  if (e.kind === "limite" || e.kind === "temporario" || e.kind === "rede") return { action: "retry", message: e.friendly };
  return { action: "fail", message: e.friendly };
}

class LockLost extends Error {}

export interface PostOutcome { postId: string; title: string; result: "publicado" | "aguardando" | "falhou" | "perdeu" | "outra_rodada"; detail: string; mediaId?: string }
export interface RunReport {
  enabled: boolean;
  message: string;
  organizations: { organizationId: string; name: string; due: number; outcomes: PostOutcome[] }[];
  published: number;
  failed: number;
  missed: number;
  waiting: number;
  skippedOrganizations: number;
}

/** Uma rodada do agendador, em todas as organizações com a publicação ligada. */
export async function runDue(deps: SchedulerDeps = {}): Promise<RunReport> {
  const report: RunReport = { enabled: publishEnabled(), message: "", organizations: [], published: 0, failed: 0, missed: 0, waiting: 0, skippedOrganizations: 0 };
  if (!report.enabled) {
    report.message = "Publicação automática desligada (IG_PUBLISH_ENABLED). Nada foi publicado.";
    return report;
  }
  ensureMock();
  const orgs: any[] = await Organization.find({ active: true }).select("name publishEnabled").sort({ createdAt: 1 }).lean();
  for (const org of orgs) {
    if (org.publishEnabled !== true) {
      report.skippedOrganizations++;
      continue;
    }
    const outcomes = await runOrganization(org._id, deps);
    report.organizations.push({ organizationId: String(org._id), name: org.name, due: outcomes.length, outcomes });
    for (const o of outcomes) {
      if (o.result === "publicado") report.published++;
      else if (o.result === "falhou") report.failed++;
      else if (o.result === "perdeu") report.missed++;
      else report.waiting++;
    }
  }
  report.message = `${report.published} publicado(s), ${report.failed} com falha, ${report.missed} que perderam o horário, ${report.waiting} aguardando.`;
  return report;
}

export async function runOrganization(org: Org, deps: SchedulerDeps = {}): Promise<PostOutcome[]> {
  const now = (deps.now ?? nowMs)();
  const ttl = deps.lockTtlMs ?? 10 * 60_000;
  const max = deps.maxPerRun ?? 10;
  const only = deps.onlyPosts ? { _id: { $in: deps.onlyPosts } } : {};
  const due: any[] = await Post.find({
    organization: org, status: "scheduled", publishAt: { $lte: new Date(now) }, "approval.at": { $ne: null }, ...only,
    $or: [{ "publish.nextAttemptAt": null }, { "publish.nextAttemptAt": { $lte: new Date(now) } }],
  }).sort({ publishAt: 1 }).limit(max).select("_id").lean();
  const stale: any[] = await Post.find({ organization: org, status: "publishing", "publish.lockedAt": { $lt: new Date(now - ttl) }, ...only }).limit(max).select("_id").lean();

  const outcomes: PostOutcome[] = [];
  for (const { _id } of [...stale, ...due]) {
    const lock = randomUUID();
    const claimed: any =
      (await Post.findOneAndUpdate(
        { _id, organization: org, status: "scheduled", publishAt: { $lte: new Date(now) }, "approval.at": { $ne: null }, $or: [{ "publish.nextAttemptAt": null }, { "publish.nextAttemptAt": { $lte: new Date(now) } }] },
        { $set: { status: "publishing", "publish.lockId": lock, "publish.lockedAt": new Date(now) } },
        { returnDocument: "after" }
      )) ||
      (await Post.findOneAndUpdate(
        { _id, organization: org, status: "publishing", "publish.lockedAt": { $lt: new Date(now - ttl) } },
        { $set: { "publish.lockId": lock, "publish.lockedAt": new Date(now) }, $inc: { "publish.recoveries": 1 } },
        { returnDocument: "after" }
      ));
    if (!claimed) continue; // outro processo pegou primeiro
    outcomes.push(await advance(org, claimed, lock, deps));
  }
  return outcomes;
}

/** Leva UM post (já travado por este processo) até onde der nesta rodada. */
async function advance(org: Org, post: any, lock: string, deps: SchedulerDeps): Promise<PostOutcome> {
  const clock = deps.now ?? nowMs;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const tolerance = (deps.toleranceMin ?? toleranceMinutes()) * 60_000;
  const id = String(post._id);
  const out = (result: PostOutcome["result"], detail: string, mediaId?: string): PostOutcome => ({ postId: id, title: post.title, result, detail, mediaId });

  const save = async (set: Record<string, unknown>, history?: { type: string; note: string }) => {
    const update: Record<string, unknown> = { $set: set };
    if (history) update.$push = { history: { $each: [historyEntry(history.type, "ContentHub", history.note, new Date(clock()))], $slice: -60 } };
    const updated = await Post.findOneAndUpdate({ _id: post._id, organization: org, status: "publishing", "publish.lockId": lock }, update, { returnDocument: "after" });
    if (!updated) throw new LockLost();
    post = updated;
  };
  const release = { "publish.lockId": "", "publish.lockedAt": null };
  const dropContainer = { "publish.containerId": "", "publish.children": [], "publish.containerAt": null, "publish.publishCalledAt": null };

  const fail = async (message: string, kind: string, extra: Record<string, unknown> = {}) => {
    await save({ ...release, status: "failed", "publish.lastError": message, "publish.lastErrorKind": kind, "publish.lastErrorAt": new Date(clock()), "publish.nextAttemptAt": null, "publish.waitNote": "", ...extra }, { type: "falhou", note: message });
    await audit({ action: "post.falhou", organization: org, target: id, meta: { title: post.title, message, kind } });
    return out("falhou", message);
  };
  const missed = async (why: string) => {
    const message = `Não foi publicado: ${why}. Escolha publicar agora ou marcar outro horário.`;
    await save({ ...release, ...dropContainer, status: "missed", "publish.lastError": message, "publish.lastErrorKind": "atraso", "publish.lastErrorAt": new Date(clock()), "publish.nextAttemptAt": null, "publish.waitNote": "" }, { type: "perdeu", note: message });
    await audit({ action: "post.perdeu_horario", organization: org, target: id, meta: { title: post.title, why } });
    return out("perdeu", message);
  };
  const requeue = async (delayMs: number, note: string, extra: Record<string, unknown> = {}) => {
    await save({ ...release, status: "scheduled", "publish.nextAttemptAt": new Date(clock() + delayMs), "publish.waitNote": note, ...extra });
    return out("aguardando", note);
  };
  const dueAt = () => new Date(post.publish?.dueAt || post.publishAt).getTime();
  const late = () => clock() - dueAt() > tolerance;
  const lateWhy = () => `passou mais de ${Math.round(tolerance / 60_000)} minutos do horário marcado (${formatDateTimeBR(dueAt())})`;

  try {
    if ((post.publish?.recoveries || 0) > MAX_RECOVERIES)
      return await fail("O sistema não conseguiu concluir a publicação depois de várias retomadas. Confira no Instagram se o post saiu antes de tentar de novo.", "interno", { "publish.uncertain": Boolean(post.publish?.publishCalledAt) });

    const account: any = await SocialAccount.findOne({ organization: org, project: post.project, platform: "instagram", active: true, "credentials.accessToken": { $exists: true, $ne: "" } });
    if (!account) return await fail("O projeto não tem mais conta do Instagram conectada e ativa.", "conta");
    const assets = await loadAssets(org, post);
    const check = planPublish(publishable(post, assets));
    if (!check.ok) return await fail(check.errors.join(" "), "validacao");
    const plan: PublishPlan = check.plan;
    const client: Client = deps.clientFor ? deps.clientFor(account) : new InstagramClient(accountToken(account));
    const ig = account.accountId;

    const published = async (mediaId: string) => {
      let permalink = "";
      try {
        permalink = await client.getPermalink(mediaId);
      } catch { /* o link é um extra: a sincronização traz depois */ }
      const at = new Date(clock());
      await Post.findOneAndUpdate(
        { _id: post._id, organization: org, status: "publishing", "publish.lockId": lock },
        {
          $set: { ...release, status: "posted", "externalIds.instagram": mediaId, ...(permalink ? { "externalIds.instagramPermalink": permalink } : {}), "publish.publishedAt": at, "publish.lastError": "", "publish.lastErrorKind": "", "publish.nextAttemptAt": null, "publish.waitNote": "", "publish.uncertain": false },
          $push: { history: { $each: [historyEntry("publicado", "ContentHub", permalink, at)], $slice: -60 } },
        }
      );
      await audit({ action: "post.publicado", organization: org, target: id, meta: { title: post.title, mediaId, permalink } });
      return out("publicado", permalink || mediaId, mediaId);
    };

    // 1) Já existe container deste post? Perguntar ao Instagram em que pé está (retomada sem duplicar).
    let containerId: string = post.publish?.containerId || "";
    let status = "";
    if (containerId) {
      status = await client.getContainerStatus(containerId);
      if (status === "PUBLISHED") {
        const since = new Date(post.publish.publishCalledAt || post.publish.containerAt || dueAt()).getTime() - 5 * 60_000;
        const recent = await client.listMedia(ig, { max: 15 });
        const hit = recent.find((m) => m.timestamp && new Date(m.timestamp).getTime() >= since && (m.caption || "").trim() === plan.caption.trim());
        if (hit) return await published(hit.id);
        return await fail("O Instagram informou que o post saiu, mas não consegui confirmar o link. Confira no perfil: se saiu, marque como publicado; se não saiu, tente de novo.", "incerto", { "publish.uncertain": true });
      }
      if (status === "EXPIRED") {
        await save(dropContainer);
        containerId = "";
      } else if (status === "ERROR") return await fail("O Instagram recusou a mídia ao processar (formato, tamanho ou arquivo fora do padrão). Envie outra mídia e aprove de novo.", "midia", dropContainer);
    }

    // 2) Limite de publicações das últimas 24h, lido da própria API.
    const limit = await client.getPublishingLimit(ig);
    if (limit.used >= limit.total) {
      if (late()) return await missed(`a conta atingiu o limite de publicações do Instagram (${limit.used} de ${limit.total} em 24 horas) e ${lateWhy()}`);
      return await requeue(LIMIT_WAIT_MS, `Limite de publicações do Instagram atingido (${limit.used} de ${limit.total} em 24 horas). Tento de novo às ${formatDateTimeBR(clock() + LIMIT_WAIT_MS).split(" às ")[1]}.`);
    }

    // 3) Criar o container (uma vez). Carrossel: um por item, depois o do conjunto.
    if (!containerId) {
      if (late()) return await missed(lateWhy());
      if (!post.publish?.startedAt) await save({ "publish.startedAt": new Date(clock()) });
      if (plan.kind === "IMAGE") containerId = await client.createContainer(ig, { image_url: plan.imageUrl, caption: plan.caption });
      else if (plan.kind === "REELS") containerId = await client.createContainer(ig, { media_type: "REELS", video_url: plan.videoUrl, caption: plan.caption });
      else {
        const children: string[] = [...(post.publish?.children || [])];
        for (let i = children.length; i < plan.items.length; i++) {
          const item = plan.items[i];
          const child = await client.createContainer(ig, item.video ? { media_type: "VIDEO", video_url: item.url, is_carousel_item: true } : { image_url: item.url, is_carousel_item: true });
          children.push(child);
          await save({ "publish.children": children });
        }
        for (const [i, item] of plan.items.entries()) {
          if (!item.video) continue;
          const st = await client.getContainerStatus(children[i]);
          if (st === "ERROR") return await fail(`O Instagram recusou o vídeo ${i + 1} do carrossel. Exporte em MP4 (H.264) e envie de novo.`, "midia", dropContainer);
          if (st === "EXPIRED") return await requeue(0, "Preparando a mídia de novo.", dropContainer);
          if (st !== "FINISHED") return await requeue(PROCESSING_WAIT_MS, "O Instagram está processando um vídeo do carrossel.");
        }
        containerId = await client.createContainer(ig, { media_type: "CAROUSEL", children: children.join(","), caption: plan.caption });
      }
      await save({ "publish.containerId": containerId, "publish.containerAt": new Date(clock()) });
      await deps.hook?.("after_container", id);
      status = "";
    }

    // 4) Esperar o container ficar pronto (reel processa: pode levar minutos; a rodada seguinte continua).
    const polls = deps.maxPolls ?? 4;
    for (let i = 0; status !== "FINISHED"; i++) {
      status = await client.getContainerStatus(containerId);
      if (status === "FINISHED") break;
      if (status === "ERROR") return await fail("O Instagram recusou a mídia ao processar (formato, tamanho ou arquivo fora do padrão). Envie outra mídia e aprove de novo.", "midia", dropContainer);
      if (status === "EXPIRED") return await requeue(0, "Preparando a mídia de novo.", dropContainer);
      if (status === "PUBLISHED") return await requeue(0, "Conferindo a publicação.");
      if (i + 1 >= polls) {
        if (clock() - new Date(post.publish.containerAt).getTime() > PROCESSING_MAX_MS)
          return await fail("O Instagram demorou mais de 30 minutos para processar a mídia. Confira o arquivo e tente de novo.", "midia", dropContainer);
        return await requeue(PROCESSING_WAIT_MS, "O Instagram está processando a mídia. Publico assim que ficar pronta.");
      }
      await sleep(deps.pollMs ?? 4000);
    }

    // 5) Publicar. O horário de chamada fica gravado ANTES: se cair aqui, a retomada confere o container.
    if (late()) return await missed(lateWhy());
    await save({ "publish.publishCalledAt": new Date(clock()), "publish.lockedAt": new Date(clock()) });
    await deps.hook?.("before_publish", id);
    const mediaId = await client.publishContainer(ig, containerId);
    await deps.hook?.("after_publish", id);
    return await published(mediaId);
  } catch (e) {
    if (e instanceof LockLost) return out("outra_rodada", "Outro processo assumiu este post.");
    if (!(e instanceof InstagramApiError)) throw e; // queda/defeito: a trava fica e a próxima rodada retoma
    try {
      const v = judge(e);
      const called = Boolean(post.publish?.publishCalledAt);
      if (v.action === "fail") return await fail(v.message, e.kind, called ? {} : dropContainer);
      if (v.action === "wait") return await requeue(PROCESSING_WAIT_MS, v.message);
      if (v.action === "limit") {
        if (late()) return await missed(`${v.message.replace(/\.$/, "")} e ${lateWhy()}`);
        return await requeue(LIMIT_WAIT_MS, v.message);
      }
      const attempts = (post.publish?.attempts || 0) + 1;
      if (attempts > RETRY_DELAYS_MS.length)
        return await fail(`${v.message} Tentei ${attempts} vezes e parei.${called ? " Confira no Instagram se o post saiu antes de tentar de novo." : ""}`, e.kind, { "publish.attempts": attempts, "publish.uncertain": called });
      const delay = RETRY_DELAYS_MS[attempts - 1];
      return await requeue(delay, `${v.message} Nova tentativa às ${formatDateTimeBR(clock() + delay).split(" às ")[1]} (${attempts} de ${RETRY_DELAYS_MS.length}).`, {
        "publish.attempts": attempts, "publish.lastError": v.message, "publish.lastErrorKind": e.kind, "publish.lastErrorAt": new Date(clock()),
        ...(v.action === "retry_new" && !called ? dropContainer : {}),
      });
    } catch (inner) {
      if (inner instanceof LockLost) return out("outra_rodada", "Outro processo assumiu este post.");
      throw inner;
    }
  }
}
