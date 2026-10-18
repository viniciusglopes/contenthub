import type { Types } from "mongoose";
import { notFound } from "@/lib/errors";
import { publishSwitch } from "@/lib/workflow";
import { assertProject } from "@/lib/orgs";
import { AdAccount } from "@/models/Ads";
import ApiCredential from "@/models/ApiCredential";
import MediaAsset from "@/models/MediaAsset";
import Organization from "@/models/Organization";
import { HouseCredential } from "@/models/Platform";
import Post from "@/models/Post";
import SocialAccount from "@/models/SocialAccount";
import VideoTemplate from "@/models/VideoTemplate";
import { budgetOf, usd } from "@/lib/studio/cost";
import { resolveChain } from "@/lib/studio/chain";
import { loadKit } from "@/lib/studio/kit";
import { ARTICLES } from "./content.generated";
import type { Article } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Org = Types.ObjectId;

// AJUDA: artigos (iguais para todo cliente; os marcados "admin" só para o administrador da
// plataforma) e a lista "Primeiros passos" com o andamento REAL do projeto, lido do banco.

export const visibleArticles = (isAdmin: boolean): Article[] => ARTICLES.filter((a) => isAdmin || !a.admin);
export function getArticle(id: string, isAdmin: boolean): Article {
  const a = visibleArticles(isAdmin).find((x) => x.id === id);
  if (!a) throw notFound("Artigo");
  return a;
}

export type StepState = "feito" | "pendente" | "indisponivel" | "info";
export interface Step { id: string; title: string; state: StepState; detail: string; article: string }

/** O andamento de cada passo para um projeto da organização da sessão. */
export async function checklist(org: Org, project: Types.ObjectId): Promise<{ project: string; steps: Step[]; done: number; total: number }> {
  await assertProject(org, project);
  const now = Date.now();
  const [ig, ads, ytOwn, ytHouse, pexels, kitInfo, templates, scenes, approved, o, budget, textChain]: any[] = await Promise.all([
    SocialAccount.findOne({ organization: org, project, platform: "instagram" }).sort({ active: -1, updatedAt: -1 }).lean(),
    AdAccount.findOne({ organization: org, project }).lean(),
    ApiCredential.exists({ organization: org, service: "youtube", active: true }),
    HouseCredential.exists({ service: "youtube", active: true }),
    HouseCredential.exists({ service: "pexels", active: true }),
    loadKit(org, project),
    VideoTemplate.countDocuments({ organization: org, project }),
    MediaAsset.countDocuments({ organization: org, kind: "cena" }),
    Post.countDocuments({ organization: org, project, status: { $in: ["scheduled", "publishing", "posted"] } }),
    Organization.findById(org).select("publishEnabled").lean(),
    budgetOf(org),
    resolveChain(org, "texto"),
  ]);
  const igType = String(ig?.accountType || "").toUpperCase();
  const expired = ig?.tokenExpiresAt && new Date(ig.tokenExpiresAt).getTime() < now;
  const kit = kitInfo.kit;
  const blocking = kit.pending.filter((p: any) => p.block);
  const sw = publishSwitch(o);
  const linkedPage = (ads?.igAccounts || []).some((a: any) => a.pageId) || Boolean(ads?.igUserId);
  const steps: Step[] = [
    { id: "profissional", title: "Instagram como conta profissional", article: "conta-profissional",
      state: igType === "BUSINESS" || igType === "MEDIA_CREATOR" || igType === "CREATOR" ? "feito" : ig ? "pendente" : "pendente",
      detail: ig ? (igType ? `A conta @${ig.username || ig.accountName} é do tipo ${igType === "BUSINESS" ? "comercial" : igType === "PERSONAL" ? "pessoal (precisa virar profissional)" : "criador de conteúdo"}.` : `@${ig.username || ig.accountName} conectada, tipo ainda não lido: sincronize.`) : "Nenhuma conta do Instagram conectada neste projeto ainda." },
    { id: "pagina", title: "Instagram ligado a uma Página do Facebook", article: "conta-profissional",
      state: linkedPage ? "feito" : "info",
      detail: linkedPage ? "A conta de anúncio enxergou a Página ligada ao Instagram." : "Só dá para conferir daqui depois de conectar a conta de anúncio (Tráfego). Necessário para Tráfego e concorrentes; não é preciso para os números do Instagram." },
    { id: "token-instagram", title: "Token do Instagram colado no ContentHub", article: "token-instagram",
      state: ig && ig.active !== false && !expired ? "feito" : "pendente",
      detail: !ig ? "Cole o token em Configurações › Redes sociais." : expired ? "O token venceu: gere outro e cole de novo." : ig.tokenExpiresAt ? `Vale até ${new Date(ig.tokenExpiresAt).toLocaleDateString("pt-BR")} (estimado).` : "Conectado." },
    { id: "token-ads", title: "Conta de anúncio da Meta (Tráfego)", article: "token-meta-ads",
      state: ads ? "feito" : "pendente", detail: ads ? `Conta ${ads.adAccountId} conectada${ads.name ? ` (${ads.name})` : ""}.` : "Opcional: só para ver campanhas e anúncios em Tráfego." },
    { id: "youtube", title: "YouTube (concorrentes)", article: "youtube",
      state: ytOwn || ytHouse ? "feito" : "pendente", detail: ytOwn ? "Chave própria cadastrada." : ytHouse ? "Usando a chave da plataforma." : "Sem chave do YouTube: os canais de concorrentes não são lidos." },
    { id: "tiktok", title: "TikTok", article: "tiktok", state: "indisponivel", detail: "Ainda não disponível: dá para cadastrar a conta, mas o ContentHub não lê números nem publica no TikTok." },
    { id: "pexels", title: "Pexels (cenas gratuitas)", article: "pexels", state: pexels ? "feito" : "pendente", detail: pexels ? "Busca no Pexels ligada." : "A plataforma ainda não tem a chave do Pexels: a busca fica desligada (dá para enviar os seus clipes)." },
    { id: "ia", title: "Chaves de IA e teto de gasto", article: "chaves-e-integracoes", state: textChain.length ? "feito" : "pendente",
      detail: `${textChain.length ? `IA para texto: ${textChain.map((c: any) => c.service).join(", ")}.` : "Sem IA para texto: os roteiros são escritos à mão."} Teto do mês: ${usd(budget.capUsd)}, usado ${usd(budget.spentUsd)}.` },
    { id: "kit", title: "Kit de marca", article: "estudio", state: kit.saved && !blocking.length ? "feito" : "pendente", detail: !kit.saved ? "Ainda não salvo." : blocking.length ? blocking.map((b: any) => b.text).join(" ") : `${kit.name} ${kit.handle}`.trim() },
    { id: "padroes", title: "Padrão de vídeo e cenas", article: "padroes-de-video", state: templates > 0 && scenes > 0 ? "feito" : "pendente", detail: `${templates} padrão(ões) neste projeto; ${scenes} cena(s) na biblioteca da conta.` },
    { id: "aprovacao", title: "Aprovar e agendar um post", article: "calendario-e-aprovacao", state: approved > 0 ? "feito" : "pendente", detail: approved > 0 ? `${approved} post(s) já aprovados e agendados.` : "Nenhum post aprovado ainda neste projeto." },
    { id: "publicacao", title: "Publicação automática", article: "publicacao-desligada", state: sw.on ? "feito" : "info", detail: sw.on ? "Ligada: o que está agendado sai sozinho." : "Desligada. Você cria, aprova e agenda; quem liga é o administrador da plataforma." },
  ];
  const counted = steps.filter((s) => s.state === "feito" || s.state === "pendente");
  return { project: String(project), steps, done: counted.filter((s) => s.state === "feito").length, total: counted.length };
}
