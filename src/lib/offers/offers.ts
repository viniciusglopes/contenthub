/* eslint-disable @typescript-eslint/no-explicit-any */
// OFERTAS: cadastro, contagem diária (API oficial ou manual), favoritos, lista da casa e relatório.
import type { Types } from "mongoose";
import { FriendlyError, notFound } from "@/lib/errors";
import { decrypt, encrypt } from "@/lib/crypto";
import { adsToken } from "@/lib/ads/accounts";
import { MetaGraphClient } from "@/lib/ads/client";
import { ensureAdsMock } from "@/lib/ads/mock";
import { addDays, dayKey } from "@/lib/instagram/dates";
import { toObjectId } from "@/lib/tenant";
import { AdAccount } from "@/models/Ads";
import { HouseOffer, HouseOfferDaily, OfferDaily, OfferFavorite, OfferPage } from "@/models/Offer";
import Organization from "@/models/Organization";
import { HouseCredential, PlatformSettings } from "@/models/Platform";
import { apiCountries, cleanCountries, countActiveAds, libraryError, publicLibraryUrl } from "./adlibrary";
import { DEFAULT_HEAT_RULES, type DailyPoint, type HeatRule, computeStats, describeRule, heatOf, monthlyText, monthlyTop } from "./heat";

type Org = Types.ObjectId;
export const META_LIBRARY_SERVICE = "meta_ad_library";
export const MAX_OFFERS_PER_ORG = 500;
export const HISTORY_DAYS = 90;

export const STRUCTURES: Record<string, string> = { vsl: "VSL", pagina_vendas: "Página de vendas", quiz: "Quiz", outro: "Outro" };
export const NICHES: Record<string, string> = { info: "Infoproduto", nutra: "Nutra", ecommerce: "E-commerce", servico: "Serviço", outro: "Outro" };
export const LANGUAGES: Record<string, string> = { pt: "Português", es: "Espanhol", en: "Inglês", outro: "Outra" };

export const MODULE_OFF = "A lista da casa faz parte do módulo Ofertas, que não está ligado para esta conta. Fale com o administrador.";
export const COVERAGE_NOTE =
  "Contagem pela API oficial da Biblioteca de Anúncios da Meta: ela só devolve anúncio comercial que alcançou a União Europeia. Oferta que roda só no Brasil aparece com zero pela API: para essas, use a contagem manual.";

// ---- configuração (administrador)
export async function offerSettings(): Promise<{ heatRules: HeatRule[]; countries: string[]; custom: boolean }> {
  const s: any = await PlatformSettings.findOne({ key: "main" }).lean();
  const o = s?.offers || {};
  const heatRules = Array.isArray(o.heatRules) && o.heatRules.length ? o.heatRules : DEFAULT_HEAT_RULES;
  return { heatRules, countries: apiCountries(o.countries), custom: Boolean(o.heatRules?.length) };
}

export async function saveOfferSettings(patch: { heatRules?: HeatRule[] | null; countries?: string[] | null }) {
  const s: any = (await PlatformSettings.findOne({ key: "main" })) || new PlatformSettings({ key: "main" });
  const cur = { ...(s.offers || {}) };
  if (patch.heatRules !== undefined) cur.heatRules = patch.heatRules || [];
  if (patch.countries !== undefined) cur.countries = patch.countries || [];
  s.offers = cur;
  s.markModified("offers");
  await s.save();
}

// ---- token
export async function houseLibraryToken(): Promise<string | null> {
  const doc: any = await HouseCredential.findOne({ service: META_LIBRARY_SERVICE, active: true }).lean();
  const creds = doc?.credentials instanceof Map ? Object.fromEntries(doc.credentials) : doc?.credentials || {};
  return creds.token ? decrypt(String(creds.token)) : null;
}

export async function saveHouseLibraryToken(token: string) {
  const t = String(token || "").trim();
  if (!/^[A-Za-z0-9_|-]{40,600}$/.test(t)) throw new FriendlyError("O token parece incompleto. Copie de novo, inteiro e sem espaços.", 400, "token");
  await HouseCredential.updateOne(
    { service: META_LIBRARY_SERVICE },
    { $set: { "credentials.token": encrypt(t), active: true, purposes: [], lastTest: { at: null, ok: false, message: "" } }, $setOnInsert: { service: META_LIBRARY_SERVICE } },
    { upsert: true }
  );
}

/** Token que a organização usa: o da conta de anúncio dela; se não tiver e o módulo estiver ligado, o da casa. */
export async function orgLibraryToken(org: Org): Promise<{ token: string; kind: "conta" | "casa" } | null> {
  const acc: any = await AdAccount.findOne({ organization: org, active: true }).lean();
  if (acc) return { token: adsToken(acc), kind: "conta" };
  const o: any = await Organization.findById(org).select("offersEnabled").lean();
  if (o?.offersEnabled) {
    const t = await houseLibraryToken();
    if (t) return { token: t, kind: "casa" };
  }
  return null;
}

// ---- campos
const URL_RE = /^https?:\/\/[^\s]+$/i;
export function cleanPageId(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  const m = v.match(/(?:view_all_page_id=|[?&]id=|^)(\d{5,25})(?:\D|$)/);
  if (!m) throw new FriendlyError("Use o id numérico da página do Facebook (ex.: 102938475610293). Ele aparece no link da página na Biblioteca de Anúncios.", 400, "pageId");
  return m[1];
}

export function offerFields(b: Record<string, any>, partial: boolean) {
  const out: Record<string, any> = {};
  if (!partial || b.name !== undefined) {
    const name = String(b.name ?? "").trim().slice(0, 100);
    if (name.length < 2) throw new FriendlyError("Diga o nome da página ou da oferta.", 400, "name");
    out.name = name;
  }
  if (b.pageId !== undefined) out.pageId = cleanPageId(b.pageId);
  if (b.offerUrl !== undefined) {
    const u = String(b.offerUrl).trim();
    if (u && !URL_RE.test(u)) throw new FriendlyError("O link da oferta precisa começar com https://", 400, "offerUrl");
    out.offerUrl = u.slice(0, 500);
  }
  if (b.notes !== undefined) out.notes = String(b.notes).slice(0, 2000);
  if (b.counting !== undefined) {
    if (!["api", "manual"].includes(b.counting)) throw new FriendlyError("Escolha como contar: pela API ou manual.", 400, "counting");
    out.counting = b.counting;
  }
  const t = b.tags;
  if (t && typeof t === "object") {
    const pick = (k: string, allowed: Record<string, string>) => {
      if (t[k] === undefined) return;
      const v = String(t[k] || "");
      if (v && !allowed[v]) throw new FriendlyError("Etiqueta inválida.", 400, k);
      out[`tags.${k}`] = v;
    };
    pick("structure", STRUCTURES);
    pick("niche", NICHES);
    pick("language", LANGUAGES);
    if (t.product !== undefined) out["tags.product"] = String(t.product).trim().slice(0, 60);
    if (t.countries !== undefined) out["tags.countries"] = cleanCountries(t.countries).slice(0, 10);
  }
  return out;
}

function needsPageId(f: Record<string, any>, current?: any) {
  const counting = f.counting ?? current?.counting ?? "api";
  const pageId = f.pageId ?? current?.pageId ?? "";
  if (counting === "api" && !pageId) throw new FriendlyError("Para contar pela API, informe o id numérico da página. Sem ele, escolha contagem manual.", 400, "pageId");
}

const unflat = (f: Record<string, any>) => {
  const o: Record<string, any> = {};
  for (const [k, v] of Object.entries(f)) {
    if (k.startsWith("tags.")) (o.tags ||= {})[k.slice(5)] = v;
    else o[k] = v;
  }
  return o;
};

// ---- saída
export function publicOffer(p: any, points: DailyPoint[], rules: HeatRule[], kind: "org" | "casa", favs: Set<string>, today: string) {
  const stats = computeStats(points);
  return {
    _id: String(p._id),
    kind,
    name: p.name,
    pageId: p.pageId || "",
    offerUrl: p.offerUrl || "",
    tags: { structure: p.tags?.structure || "", niche: p.tags?.niche || "", product: p.tags?.product || "", language: p.tags?.language || "", countries: p.tags?.countries || [] },
    counting: p.counting || "api",
    notes: p.notes || "",
    active: p.active !== false,
    libraryUrl: publicLibraryUrl(p),
    stats,
    heat: heatOf(stats, rules),
    lastError: p.last?.error || "",
    lastAt: p.last?.at || null,
    lastErrorAt: p.last?.errorAt || null,
    lastCountries: p.last?.countries || [],
    favorite: favs.has(`${kind}:${p._id}`),
    isNew: kind === "casa" && dayKey(p.createdAt || Date.now()) === today,
    createdAt: p.createdAt,
  };
}

async function pointsFor(Daily: any, scope: Record<string, any>, ids: any[], days: number, today: string): Promise<Map<string, DailyPoint[]>> {
  const rows: any[] = ids.length ? await Daily.find({ ...scope, page: { $in: ids }, date: { $gte: addDays(today, -days) } }).select("page date count source complete").sort({ date: 1 }).lean() : [];
  const map = new Map<string, DailyPoint[]>();
  for (const r of rows) {
    const k = String(r.page);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push({ date: r.date, count: r.count, source: r.source, complete: r.complete });
  }
  return map;
}

async function favSet(org: Org, user: string): Promise<Set<string>> {
  const u = toObjectId(user);
  if (!u) return new Set();
  const list: any[] = await OfferFavorite.find({ organization: org, user: u }).select("kind ref").lean();
  return new Set(list.map((f) => `${f.kind}:${f.ref}`));
}

export async function moduleEnabled(session: { organization: any; isAdmin: boolean; impersonating: boolean }): Promise<boolean> {
  return session.organization?.offersEnabled === true || (session.isAdmin && !session.impersonating);
}

export async function listOrgOffers(org: Org, user: string, now = Date.now()) {
  const today = dayKey(now);
  const [pages, settings, favs] = await Promise.all([OfferPage.find({ organization: org }).sort({ createdAt: -1 }).lean(), offerSettings(), favSet(org, user)]);
  const pts = await pointsFor(OfferDaily, { organization: org }, (pages as any[]).map((p) => p._id), 45, today);
  return { offers: (pages as any[]).map((p) => publicOffer(p, pts.get(String(p._id)) || [], settings.heatRules, "org", favs, today)), settings };
}

export async function listHouseOffers(org: Org, user: string, opts: { includeArchived?: boolean } = {}, now = Date.now()) {
  const today = dayKey(now);
  const [pages, settings, favs] = await Promise.all([HouseOffer.find(opts.includeArchived ? {} : { active: true }).sort({ createdAt: -1 }).limit(2000).lean(), offerSettings(), favSet(org, user)]);
  const pts = await pointsFor(HouseOfferDaily, {}, (pages as any[]).map((p) => p._id), 45, today);
  const offers = (pages as any[]).map((p) => publicOffer(p, pts.get(String(p._id)) || [], settings.heatRules, "casa", favs, today));
  return { offers, newToday: offers.filter((o) => o.isNew && o.active).length, settings };
}

export function rulesForScreen(rules: HeatRule[]) {
  return rules.map((r) => ({ ...r, text: describeRule(r) }));
}

// ---- CRUD da organização
export async function findOrgOffer(org: Org, id: unknown) {
  const oid = toObjectId(id);
  if (!oid) throw notFound("Oferta");
  const p = await OfferPage.findOne({ _id: oid, organization: org });
  if (!p) throw notFound("Oferta");
  return p;
}

export async function createOrgOffer(org: Org, b: Record<string, any>, userId?: string) {
  const f = offerFields(b, false);
  needsPageId(f);
  if ((await OfferPage.countDocuments({ organization: org })) >= MAX_OFFERS_PER_ORG) throw new FriendlyError(`Limite de ${MAX_OFFERS_PER_ORG} ofertas por conta.`, 400);
  if (f.pageId && (await OfferPage.countDocuments({ organization: org, pageId: f.pageId }))) throw new FriendlyError("Essa página já está na sua lista.", 409, "pageId");
  return OfferPage.create({ organization: org, ...unflat(f), createdBy: toObjectId(userId) });
}

export async function updateOrgOffer(org: Org, id: unknown, b: Record<string, any>) {
  const p: any = await findOrgOffer(org, id);
  const f = offerFields(b, true);
  needsPageId(f, p);
  await OfferPage.updateOne({ _id: p._id, organization: org }, { $set: f });
  return OfferPage.findOne({ _id: p._id, organization: org }).lean();
}

export async function deleteOrgOffer(org: Org, id: unknown) {
  const p: any = await findOrgOffer(org, id);
  await OfferDaily.deleteMany({ organization: org, page: p._id });
  await OfferFavorite.deleteMany({ organization: org, kind: "org", ref: p._id });
  await OfferPage.deleteOne({ _id: p._id, organization: org });
}

// ---- lista da casa (administrador)
export async function findHouseOffer(id: unknown, opts: { activeOnly?: boolean } = {}) {
  const oid = toObjectId(id);
  if (!oid) throw notFound("Oferta");
  const p: any = await HouseOffer.findById(oid);
  if (!p || (opts.activeOnly && p.active === false)) throw notFound("Oferta");
  return p;
}

export async function createHouseOffer(b: Record<string, any>, adminEmail: string) {
  const f = offerFields(b, false);
  needsPageId(f);
  if (f.pageId && (await HouseOffer.countDocuments({ pageId: f.pageId }))) throw new FriendlyError("Essa página já está na lista da casa.", 409, "pageId");
  return HouseOffer.create({ ...unflat(f), addedBy: adminEmail });
}

export async function updateHouseOffer(id: unknown, b: Record<string, any>) {
  const p: any = await findHouseOffer(id);
  const f = offerFields(b, true);
  needsPageId(f, p);
  if (b.active !== undefined) f.active = Boolean(b.active);
  await HouseOffer.updateOne({ _id: p._id }, { $set: f });
  return HouseOffer.findById(p._id).lean();
}

// ---- contagem manual
export async function recordManual(target: { kind: "org"; org: Org; page: any } | { kind: "casa"; page: any }, b: Record<string, any>, who: { id: string; name: string }, now = Date.now()) {
  const n = Number(String(b.count ?? "").replace(/\./g, ""));
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000) throw new FriendlyError("Informe a quantidade de anúncios ativos (número inteiro).", 400, "count");
  const today = dayKey(now);
  const date = b.date ? String(b.date) : today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || date < addDays(today, -7)) throw new FriendlyError("A data precisa ser de hoje ou de até 7 dias atrás.", 400, "date");
  const note = String(b.note || "").trim().slice(0, 300);
  if (note.length < 3) throw new FriendlyError("Diga de onde veio o número (ex.: \"Biblioteca, país Brasil, 10h\").", 400, "note");
  const row = { count: n, source: "manual", complete: true, countries: [], calls: 0, at: new Date(now), byUser: toObjectId(who.id), byName: who.name.slice(0, 80), note };
  if (target.kind === "org") {
    await OfferDaily.updateOne({ organization: target.org, page: target.page._id, date }, { $set: row, $setOnInsert: { organization: target.org, page: target.page._id, date } }, { upsert: true });
    await refreshLast(OfferDaily, OfferPage, { organization: target.org }, target.page._id);
  } else {
    await HouseOfferDaily.updateOne({ page: target.page._id, date }, { $set: row, $setOnInsert: { page: target.page._id, date } }, { upsert: true });
    await refreshLast(HouseOfferDaily, HouseOffer, {}, target.page._id);
  }
  return { date, count: n };
}

async function refreshLast(Daily: any, Page: any, scope: Record<string, any>, pageId: any, error = "") {
  const last: any = await Daily.findOne({ ...scope, page: pageId }).sort({ date: -1 }).lean();
  const value = last ? { date: last.date, count: last.count, source: last.source, complete: last.complete, countries: last.countries || [], at: last.at, error } : { error, at: new Date() };
  await Page.updateOne({ ...scope, _id: pageId }, { $set: { last: value } });
}

async function setLastError(Page: any, scope: Record<string, any>, page: any, msg: string, now: number) {
  await Page.updateOne({ ...scope, _id: page._id }, { $set: { last: { ...(page.last || {}), error: msg, errorAt: new Date(now) } } });
}

// ---- contagem pela API (botão e rotina)
export interface CountRun {
  page: string;
  name: string;
  kind: "org" | "casa";
  organizationId?: string;
  status: "ok" | "erro" | "sem_token" | "manual_hoje" | "sem_pagina";
  count?: number;
  complete?: boolean;
  calls?: number;
  message?: string;
}

async function countPage(kind: "org" | "casa", page: any, client: MetaGraphClient | null, countries: string[], org: Org | null, now: number): Promise<CountRun> {
  const base: CountRun = { page: String(page._id), name: page.name, kind, organizationId: org ? String(org) : undefined, status: "ok" };
  const Daily: any = kind === "org" ? OfferDaily : HouseOfferDaily;
  const Page: any = kind === "org" ? OfferPage : HouseOffer;
  const scope = org ? { organization: org } : {};
  const today = dayKey(now);
  if (!page.pageId) return { ...base, status: "sem_pagina", message: "Sem id da página." };
  if (!client) {
    const msg = "Sem token da Biblioteca de Anúncios: conecte uma conta de anúncio em Tráfego (ou peça ao administrador o módulo Ofertas).";
    await setLastError(Page, scope, page, msg, now);
    return { ...base, status: "sem_token", message: msg };
  }
  // contagem manual do dia vale mais que a da API (alguém conferiu à mão)
  const manual = await Daily.findOne({ ...scope, page: page._id, date: today, source: "manual" }).select("_id").lean();
  if (manual) return { ...base, status: "manual_hoje", message: "Já tem contagem manual hoje." };
  try {
    const r = await countActiveAds(client, page.pageId, countries);
    await Daily.updateOne(
      { ...scope, page: page._id, date: today },
      { $set: { count: r.count, source: "api", complete: r.complete, countries: r.countries, calls: r.calls, at: new Date(now), byUser: null, byName: "", note: "" }, $setOnInsert: { ...scope, page: page._id, date: today } },
      { upsert: true }
    );
    await refreshLast(Daily, Page, scope, page._id);
    return { ...base, count: r.count, complete: r.complete, calls: r.calls };
  } catch (e) {
    const msg = libraryError(e);
    await setLastError(Page, scope, page, msg, now);
    return { ...base, status: "erro", message: msg };
  }
}

/** Teto de chamadas à Meta numa rodada inteira (todas as organizações + casa). */
export const RUN_MAX_CALLS = Number(process.env.OFFERS_RUN_MAX_CALLS || 3000);

export async function runOrgCount(org: Org, opts: { page?: unknown; now?: number } = {}): Promise<CountRun[]> {
  ensureAdsMock();
  const now = opts.now ?? Date.now();
  const { countries } = await offerSettings();
  const pages: any[] = opts.page ? [await findOrgOffer(org, opts.page)] : await OfferPage.find({ organization: org, counting: "api", pageId: { $ne: "" } }).limit(MAX_OFFERS_PER_ORG).lean();
  const tok = await orgLibraryToken(org);
  const client = tok ? new MetaGraphClient(tok.token, undefined, undefined, RUN_MAX_CALLS) : null;
  const out: CountRun[] = [];
  for (const p of pages) {
    if (p.counting === "manual") {
      out.push({ page: String(p._id), name: p.name, kind: "org", status: "sem_pagina", message: "Esta oferta é de contagem manual." });
      continue;
    }
    out.push(await countPage("org", p, client, countries, org, now));
  }
  return out;
}

export async function runHouseCount(opts: { page?: unknown; now?: number } = {}): Promise<CountRun[]> {
  ensureAdsMock();
  const now = opts.now ?? Date.now();
  const { countries } = await offerSettings();
  const pages: any[] = opts.page ? [await findHouseOffer(opts.page)] : await HouseOffer.find({ active: true, counting: "api", pageId: { $ne: "" } }).limit(2000).lean();
  const t = await houseLibraryToken();
  const client = t ? new MetaGraphClient(t, undefined, undefined, RUN_MAX_CALLS) : null;
  const out: CountRun[] = [];
  for (const p of pages) out.push(await countPage("casa", p, client, countries, null, now));
  return out;
}

// ---- histórico (tela "Histórico")
export async function history(kind: "org" | "casa", page: any, org: Org | null, now = Date.now()) {
  const today = dayKey(now);
  const Daily: any = kind === "org" ? OfferDaily : HouseOfferDaily;
  const scope = kind === "org" ? { organization: org } : {};
  const rows: any[] = await Daily.find({ ...scope, page: page._id, date: { $gte: addDays(today, -(HISTORY_DAYS - 1)) } }).sort({ date: 1 }).lean();
  const points: DailyPoint[] = rows.map((r) => ({ date: r.date, count: r.count, source: r.source, complete: r.complete }));
  return {
    _id: String(page._id),
    name: page.name,
    from: addDays(today, -(HISTORY_DAYS - 1)),
    to: today,
    stats: computeStats(points, HISTORY_DAYS),
    rows: rows.map((r) => ({ date: r.date, count: r.count, source: r.source, complete: r.complete !== false, countries: r.countries || [], calls: r.calls || 0, at: r.at, byName: r.byName || "", note: r.note || "" })).reverse(),
  };
}

// ---- favoritos
export async function setFavorite(org: Org, user: string, b: Record<string, any>, canSeeHouse: boolean) {
  const kind = b.kind === "casa" ? "casa" : b.kind === "org" ? "org" : null;
  if (!kind) throw new FriendlyError("Tipo de oferta inválido.", 400, "kind");
  const ref = kind === "org" ? (await findOrgOffer(org, b.id))._id : canSeeHouse ? (await findHouseOffer(b.id, { activeOnly: true }))._id : null;
  if (!ref) throw notFound("Oferta");
  const u = toObjectId(user)!;
  if (b.on === false) await OfferFavorite.deleteOne({ organization: org, user: u, kind, ref });
  else await OfferFavorite.updateOne({ organization: org, user: u, kind, ref }, { $setOnInsert: { organization: org, user: u, kind, ref } }, { upsert: true });
  return { kind, id: String(ref), favorite: b.on !== false };
}

// ---- relatório do mês (lista da casa)
export async function monthlyReport(month: string | null, now = Date.now()) {
  const cur = dayKey(now).slice(0, 7);
  const m = month || cur;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m) || m > cur) throw new FriendlyError("Mês inválido (use AAAA-MM, até o mês atual).", 400, "mes");
  const rows: any[] = await HouseOfferDaily.find({ date: { $gte: `${m}-01`, $lte: `${m}-31` } }).select("page date count source").lean();
  const pages: any[] = await HouseOffer.find({ _id: { $in: [...new Set(rows.map((r) => String(r.page)))] } }).select("name").lean();
  const names = new Map(pages.map((p) => [String(p._id), p.name]));
  const by = new Map<string, DailyPoint[]>();
  for (const r of rows) {
    const k = String(r.page);
    if (!names.has(k)) continue;
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push({ date: r.date, count: r.count, source: r.source });
  }
  const items = monthlyTop([...by.entries()].map(([id, points]) => ({ id, name: names.get(id)!, points })), m);
  return { month: m, items, text: monthlyText(m, items) };
}
