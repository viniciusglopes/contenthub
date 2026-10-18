/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Types } from "mongoose";
import { FriendlyError, notFound } from "@/lib/errors";
import { adsToken } from "@/lib/ads/accounts";
import { MetaApiError, MetaGraphClient } from "@/lib/ads/client";
import { ensureAdsMock } from "@/lib/ads/mock";
import { dayKey } from "@/lib/instagram/dates";
import { assertProject } from "@/lib/orgs";
import { toObjectId } from "@/lib/tenant";
import { AdAccount } from "@/models/Ads";
import { Competitor, CompetitorDaily, CompetitorProduct } from "@/models/Competitor";
import { fetchYoutubeChannel, parseYoutubeRef, youtubeKey } from "./youtube";

type Org = Types.ObjectId;

// Por que o Instagram do concorrente pede um token do FACEBOOK (medido e lido em 18/10/2026):
// a doc do Business Discovery diz "Available for the Instagram API with Facebook Login" e só mostra
// graph.facebook.com; no host graph.instagram.com (o que usamos para as contas conectadas pelo login
// do Instagram) a Meta responde "Tried accessing nonexisting field (business_discovery)".
export const IG_DISCOVERY_NOTE =
  "Para ler o Instagram de concorrentes a Meta exige um token do login do FACEBOOK (o mesmo tipo do token de anúncios), com instagram_basic, instagram_manage_insights e pages_read_engagement, e uma conta do Instagram profissional ligada a uma página. A conexão feita pelo login do Instagram não tem esse recurso (testado em 18/10/2026). Conecte a conta de anúncio em Tráfego com esse token.";

// Biblioteca de Anúncios: a doc oficial (ads_archive) diz "Ads that did not reach any location in the
// EU will only return if they are about social issues, elections or politics". Anúncio comercial que
// rodou só no Brasil NÃO vem pela API; o caminho que funciona é a busca pública da Meta.
export const AD_LIBRARY_NOTE =
  "A API da Biblioteca de Anúncios só devolve anúncio comercial que tenha alcançado a União Europeia (ou anúncio político/social). Anúncio que rodou só no Brasil não vem pela API: use o botão que abre a Biblioteca pública da Meta, já filtrada no Brasil.";

const HANDLE_RE = /^[a-z0-9._]{1,30}$/;
export function cleanIgHandle(raw: unknown): string {
  const v = String(raw || "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "").toLowerCase();
  if (!v) return "";
  if (!HANDLE_RE.test(v)) throw new FriendlyError("Confira o @ do Instagram (só letras, números, ponto e _).", 400, "instagram");
  return v;
}

export function adLibraryUrl(c: { name?: string; instagram?: string; facebookPage?: string }): string {
  const base = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&media_type=all";
  if (/^\d{5,25}$/.test(String(c.facebookPage || ""))) return `${base}&search_type=page&view_all_page_id=${c.facebookPage}`;
  const q = String(c.facebookPage || c.name || c.instagram || "").trim();
  return `${base}&search_type=keyword_unordered&q=${encodeURIComponent(q)}`;
}

function igSummary(ig: any) {
  if (!ig || ig.error || !Array.isArray(ig.media)) return null;
  const media = ig.media as any[];
  if (!media.length) return { avgLikes: null, avgComments: null, engagement: null, perWeek: null, mix: {}, top: [] };
  const avg = (k: string) => Math.round(media.reduce((s, m) => s + (m[k] || 0), 0) / media.length);
  const avgLikes = avg("likes");
  const avgComments = avg("comments");
  const times = media.map((m) => Date.parse(m.timestamp)).filter(Number.isFinite).sort((a, b) => a - b);
  const spanDays = times.length > 1 ? (times[times.length - 1] - times[0]) / 86_400_000 : 0;
  const mix: Record<string, number> = {};
  for (const m of media) mix[m.kind] = (mix[m.kind] || 0) + 1;
  return {
    avgLikes,
    avgComments,
    engagement: ig.followers ? Math.round(((avgLikes + avgComments) / ig.followers) * 10000) / 100 : null,
    perWeek: spanDays >= 1 ? Math.round(((media.length - 1) / spanDays) * 7 * 10) / 10 : null,
    mix,
    top: [...media].sort((a, b) => b.likes + b.comments - (a.likes + a.comments)).slice(0, 3),
  };
}

export function publicCompetitor(c: any, daily: any[] = []) {
  const first = daily[0];
  const last = daily[daily.length - 1];
  const growth = (k: string) => (first && last && first !== last && first[k] != null && last[k] != null ? { from: first[k], to: last[k], since: first.date, delta: last[k] - first[k] } : null);
  return {
    _id: String(c._id),
    project: String(c.project),
    name: c.name,
    instagram: c.instagram || "",
    youtube: c.youtube || "",
    facebookPage: c.facebookPage || "",
    notes: c.notes || "",
    ig: c.ig || null,
    igSummary: igSummary(c.ig),
    yt: c.yt || null,
    adLibrary: c.adLibrary || null,
    adLibraryUrl: adLibraryUrl(c),
    growth: { igFollowers: growth("igFollowers"), ytSubscribers: growth("ytSubscribers") },
    updatedAt: c.updatedAt,
  };
}

function fieldsFrom(b: Record<string, any>) {
  const out: Record<string, string> = {};
  if (b.name !== undefined) {
    const name = String(b.name).trim().slice(0, 80);
    if (name.length < 2) throw new FriendlyError("Diga o nome do concorrente.", 400, "name");
    out.name = name;
  }
  if (b.instagram !== undefined) out.instagram = cleanIgHandle(b.instagram);
  if (b.youtube !== undefined) {
    const v = String(b.youtube).trim();
    if (v && !parseYoutubeRef(v)) throw new FriendlyError("Confira o canal do YouTube: use o @ do canal, o id (UC...) ou o link.", 400, "youtube");
    out.youtube = v.slice(0, 120);
  }
  if (b.facebookPage !== undefined) out.facebookPage = String(b.facebookPage).trim().slice(0, 120);
  if (b.notes !== undefined) out.notes = String(b.notes).slice(0, 2000);
  return out;
}

export async function createCompetitor(org: Org, b: Record<string, any>) {
  const project = toObjectId(b.project);
  if (!project) throw new FriendlyError("Escolha o projeto.", 400, "project");
  await assertProject(org, project);
  const f = fieldsFrom({ ...b, name: b.name ?? "" });
  if (!f.instagram && !f.youtube && !f.facebookPage) throw new FriendlyError("Informe pelo menos o @ do Instagram, o canal do YouTube ou a página do Facebook.", 400, "instagram");
  const count = await Competitor.countDocuments({ organization: org, project });
  if (count >= 30) throw new FriendlyError("Limite de 30 concorrentes por projeto.", 400);
  return Competitor.create({ organization: org, project, ...f });
}

export async function findCompetitor(org: Org, id: unknown) {
  const oid = toObjectId(id);
  if (!oid) throw notFound("Concorrente");
  const c = await Competitor.findOne({ _id: oid, organization: org });
  if (!c) throw notFound("Concorrente");
  return c;
}

export async function updateCompetitor(org: Org, id: unknown, b: Record<string, any>) {
  const c: any = await findCompetitor(org, id);
  const f = fieldsFrom(b);
  if (f.instagram !== undefined && f.instagram !== c.instagram) c.ig = null;
  if (f.youtube !== undefined && f.youtube !== c.youtube) c.yt = null;
  c.set(f);
  await c.save();
  return c;
}

export async function deleteCompetitor(org: Org, id: unknown) {
  const c: any = await findCompetitor(org, id);
  await CompetitorDaily.deleteMany({ organization: org, competitor: c._id });
  await CompetitorProduct.updateMany({ organization: org, competitor: c._id }, { $set: { competitor: null } });
  await Competitor.deleteOne({ _id: c._id, organization: org });
}

/** Token do Facebook que serve ao Business Discovery: conta de anúncio do projeto (ou da organização) com Instagram ligado. */
async function discoveryAccount(org: Org, project: Types.ObjectId): Promise<any | null> {
  const list: any[] = await AdAccount.find({ organization: org, active: true, igUserId: { $ne: "" } }).lean();
  return list.find((a) => String(a.project) === String(project)) || list[0] || null;
}

const kindOf = (m: any) => (m.media_product_type === "REELS" ? "reel" : m.media_type === "CAROUSEL_ALBUM" ? "carrossel" : m.media_type === "VIDEO" ? "video" : "imagem");

export interface RefreshResult {
  competitor: string;
  name: string;
  instagram: "ok" | "erro" | "sem_token" | "nao_informado";
  youtube: "ok" | "erro" | "sem_chave" | "nao_informado";
  messages: string[];
  ytUnits: number;
}

/** Atualiza o Instagram e o YouTube públicos de um concorrente. Só leitura, sem custo (cotas gratuitas). */
export async function refreshCompetitor(org: Org, c: any, now = Date.now()): Promise<RefreshResult> {
  ensureAdsMock();
  const res: RefreshResult = { competitor: String(c._id), name: c.name, instagram: "nao_informado", youtube: "nao_informado", messages: [], ytUnits: 0 };
  const today = dayKey(now);
  const daily: Record<string, number | null> = {};

  if (c.instagram) {
    const acc = await discoveryAccount(org, c.project);
    if (!acc) {
      res.instagram = "sem_token";
      c.ig = { ...(c.ig || {}), at: new Date(now), error: IG_DISCOVERY_NOTE };
    } else {
      try {
        const client = new MetaGraphClient(adsToken(acc));
        const r = await client.businessDiscovery(acc.igUserId, c.instagram);
        const bd = r.business_discovery || {};
        const media = (bd.media?.data || []).map((m: any) => ({ caption: String(m.caption || "").slice(0, 300), likes: m.like_count ?? 0, comments: m.comments_count ?? 0, timestamp: m.timestamp, kind: kindOf(m), permalink: m.permalink || "" }));
        c.ig = { at: new Date(now), username: bd.username || c.instagram, name: bd.name || "", followers: bd.followers_count ?? null, mediaCount: bd.media_count ?? null, media, error: "" };
        daily.igFollowers = c.ig.followers;
        daily.igMedia = c.ig.mediaCount;
        res.instagram = "ok";
      } catch (e) {
        const msg =
          e instanceof MetaApiError && (e.code === 110 || e.kind === "parametro")
            ? "A Meta não achou esse @ como conta profissional (Empresa ou Criador). Perfil pessoal ou com restrição de idade não aparece."
            : e instanceof FriendlyError ? e.message : "Erro inesperado ao ler o Instagram.";
        c.ig = { ...(c.ig || {}), at: new Date(now), error: msg };
        res.instagram = "erro";
      }
    }
    if (c.ig?.error) res.messages.push(`Instagram: ${c.ig.error}`);
  }

  if (c.youtube) {
    const key = await youtubeKey(org);
    if (!key) {
      res.youtube = "sem_chave";
      c.yt = { ...(c.yt || {}), at: new Date(now), error: "Nenhuma chave do YouTube cadastrada. Cadastre em Configurações › APIs (serviço youtube) ou peça ao administrador a chave da casa." };
    } else {
      try {
        const s = await fetchYoutubeChannel(c.youtube, key.key);
        res.ytUnits = s.units;
        c.yt = { at: new Date(now), ...s, house: key.house, error: "" };
        daily.ytSubscribers = s.subscribers;
        daily.ytVideos = s.videoCount;
        daily.ytViews = s.viewCount;
        res.youtube = "ok";
      } catch (e) {
        c.yt = { ...(c.yt || {}), at: new Date(now), error: e instanceof FriendlyError ? e.message : "Erro inesperado ao ler o YouTube." };
        res.youtube = "erro";
      }
    }
    if (c.yt?.error) res.messages.push(`YouTube: ${c.yt.error}`);
  }
  c.markModified("ig");
  c.markModified("yt");
  await c.save();
  if (Object.keys(daily).length)
    await CompetitorDaily.updateOne({ organization: org, competitor: c._id, date: today }, { $set: { ...daily }, $setOnInsert: { organization: org, competitor: c._id, date: today } }, { upsert: true });
  return res;
}

/** Tenta a API da Biblioteca de Anúncios (com o token de anúncios). Guarda o que veio e por quê. */
export async function tryAdLibrary(org: Org, c: any, now = Date.now()) {
  ensureAdsMock();
  const acc: any = await AdAccount.findOne({ organization: org, project: c.project, active: true }).lean() || (await AdAccount.findOne({ organization: org, active: true }).lean());
  if (!acc) {
    c.adLibrary = { at: new Date(now), count: 0, ads: [], note: AD_LIBRARY_NOTE, error: "Sem token da Meta: conecte uma conta de anúncio em Tráfego para tentar pela API." };
  } else {
    try {
      const pageId = /^\d{5,25}$/.test(c.facebookPage) ? c.facebookPage : undefined;
      const r = await new MetaGraphClient(adsToken(acc)).adLibrary({ pageId, terms: pageId ? undefined : c.facebookPage || c.name });
      const ads = (r.data || []).slice(0, 25).map((a: any) => ({ id: a.id, page: a.page_name || "", start: a.ad_delivery_start_time || "", snapshot: a.ad_snapshot_url ? "https://www.facebook.com/ads/library/?id=" + a.id : "", body: String(a.ad_creative_bodies?.[0] || "").slice(0, 300), platforms: a.publisher_platforms || [] }));
      c.adLibrary = { at: new Date(now), count: ads.length, ads, note: AD_LIBRARY_NOTE, error: "" };
    } catch (e) {
      const msg = e instanceof MetaApiError && e.kind === "permissao"
        ? "A Meta recusou: a API da Biblioteca de Anúncios exige confirmar a identidade da pessoa dona do token e liberar o acesso do app em facebook.com/ads/library/api."
        : e instanceof FriendlyError ? e.message : "Erro inesperado na Biblioteca de Anúncios.";
      c.adLibrary = { at: new Date(now), count: 0, ads: [], note: AD_LIBRARY_NOTE, error: msg };
    }
  }
  c.markModified("adLibrary");
  await c.save();
  return c.adLibrary;
}

// ---- produtos (tabela à mão)
export function publicProduct(p: any) {
  return { _id: String(p._id), project: String(p.project), competitor: p.competitor ? String(p.competitor) : "", name: p.name, platform: p.platform || "", price: p.price ?? null, promise: p.promise || "", link: p.link || "", notes: p.notes || "" };
}

export async function productFields(org: Org, b: Record<string, any>, partial: boolean) {
  const out: Record<string, any> = {};
  if (!partial || b.name !== undefined) {
    const name = String(b.name ?? "").trim().slice(0, 120);
    if (name.length < 2) throw new FriendlyError("Diga o nome do produto.", 400, "name");
    out.name = name;
  }
  if (b.platform !== undefined) out.platform = String(b.platform).trim().slice(0, 40);
  if (b.price !== undefined) {
    if (b.price === null || b.price === "") out.price = null;
    else {
      const n = Number(String(b.price).replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new FriendlyError("Confira o preço (só números, ex.: 197,00).", 400, "price");
      out.price = Math.round(n * 100) / 100;
    }
  }
  if (b.promise !== undefined) out.promise = String(b.promise).slice(0, 500);
  if (b.notes !== undefined) out.notes = String(b.notes).slice(0, 2000);
  if (b.link !== undefined) {
    const link = String(b.link).trim();
    if (link && !/^https?:\/\/[^\s]+$/i.test(link)) throw new FriendlyError("O link precisa começar com https://", 400, "link");
    out.link = link.slice(0, 500);
  }
  if (b.competitor !== undefined) {
    if (!b.competitor) out.competitor = null;
    else {
      const comp: any = await findCompetitor(org, b.competitor);
      out.competitor = comp._id;
      out._project = comp.project;
    }
  }
  return out;
}
