/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { decrypt, isEncrypted } from "@/lib/crypto";
import Organization from "@/models/Organization";
import Post from "@/models/Post";
import Project from "@/models/Project";
import SocialAccount from "@/models/SocialAccount";
import { InstagramAccountDaily, InstagramMedia, InstagramMediaDaily } from "@/models/InstagramMedia";
import { connectInstagram, publicAccount, renewInstagram } from "@/lib/instagram/accounts";
import { InstagramApiError } from "@/lib/instagram/client";
import { dayKey } from "@/lib/instagram/dates";
import { loadInsightData } from "@/lib/instagram/data";
import { MOCK_USER_ID, mockFetch } from "@/lib/instagram/mock";
import { buildDashboard } from "@/lib/instagram/stats";
import { syncAccount } from "@/lib/instagram/sync";

// Ponta a ponta com banco em memória e a Meta simulada: conectar -> sincronizar -> painel.
const NOW = Date.parse("2026-10-12T15:00:00Z");
const DAY = 86_400_000;
let mongo: MongoMemoryServer;
let projectId: string;
let org: mongoose.Types.ObjectId;
let accountId: string;

beforeAll(async () => {
  process.env.CONTENTHUB_ENC_KEY = "c".repeat(64);
  delete process.env.IG_APP_SECRET;
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("teste"));
  org = (await Organization.create({ name: "Org de teste", slug: "org-teste" }))._id;
  const p = await Project.create({ organization: org, name: "Teste", slug: "teste" });
  projectId = String(p._id);
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("conectar conta", () => {
  it("recusa token inválido e conta pessoal com mensagem em português", async () => {
    const f = mockFetch(() => NOW);
    await expect(connectInstagram(org, { project: projectId, token: "IGAA-token-invalido-000000" }, { fetchImpl: f })).rejects.toMatchObject({ kind: "token_invalido" });
    const e = await connectInstagram(org, { project: projectId, token: "IGAA-conta-pessoal-0000000" }, { fetchImpl: f }).catch((x) => x);
    expect(e).toBeInstanceOf(InstagramApiError);
    expect(e.friendly).toMatch(/não é profissional/);
    await expect(connectInstagram(org, { project: projectId, token: "curto" }, { fetchImpl: f })).rejects.toThrow(/token inteiro/);
    expect(await SocialAccount.countDocuments({ organization: org })).toBe(0);
  });

  it("valida em /me, guarda criptografado e não devolve o token", async () => {
    const acc = await connectInstagram(org, { project: projectId, token: "  IGAA-token-de-exemplo-123456\n" }, { fetchImpl: mockFetch(() => NOW), now: NOW });
    accountId = String(acc._id);
    const raw = await SocialAccount.findOne({ _id: accountId, organization: org }).lean<{ credentials: { accessToken: string } }>();
    expect(isEncrypted(raw!.credentials.accessToken)).toBe(true);
    expect(decrypt(raw!.credentials.accessToken)).toBe("IGAA-token-de-exemplo-123456");
    const pub = publicAccount(acc);
    expect(pub).toMatchObject({ connected: true, username: "horademudarojogo", accountId: MOCK_USER_ID, tokenDaysLeft: expect.any(Number), tokenExpiryEstimated: true });
    expect(JSON.stringify(pub)).not.toContain("IGAA");
    expect(JSON.stringify(pub)).not.toContain("enc:v1");
    // colar de novo o token da mesma conta atualiza, não duplica
    await connectInstagram(org, { project: projectId, token: "IGAA-token-de-exemplo-123456" }, { fetchImpl: mockFetch(() => NOW), now: NOW });
    expect(await SocialAccount.countDocuments({ organization: org })).toBe(1);
  });

  it("renovar antes de 24h devolve aviso, não erro da Meta", async () => {
    await expect(renewInstagram(org, accountId, { fetchImpl: mockFetch(() => NOW), now: NOW + 3_600_000 })).rejects.toThrow(/mais de 24 horas/);
  });
});

describe("sincronizar", () => {
  it("grava mídias, métricas por tipo, histórico diário e casa com Post existente", async () => {
    const post = await Post.create({
      organization: org, project: projectId, title: "Post do calendário", format: "reel", platforms: ["instagram"],
      scheduledDate: new Date(NOW), scheduledTime: "09:00", status: "posted", externalIds: { instagram: "1800000000000100" },
    });
    const r = await syncAccount(org, accountId, { fetchImpl: mockFetch(() => NOW), now: NOW });
    // primeira sincronização = histórico: 90 dias da conta (o que a Meta guarda) e até 12 meses de posts
    expect(r).toMatchObject({ ok: true, media: 26, matchedPosts: 1, days: 90, tokenRenewed: false, history: true });
    expect(r.warnings).toEqual([]);

    const reel = await InstagramMedia.findOne({ organization: org, igId: "1800000000000100" }).lean<Record<string, any>>();
    expect(reel).toMatchObject({ kind: "reel", productType: "REELS" });
    expect(String(reel!.post)).toBe(String(post._id));
    expect(reel!.metrics.avgWatchTimeMs).toBeGreaterThan(0);
    expect(reel!.metrics.views).toBeGreaterThan(0);
    const carousel = await InstagramMedia.findOne({ organization: org, igId: "1800000000000101" }).lean<Record<string, any>>();
    expect(carousel!.kind).toBe("carrossel");
    expect(carousel!.post).toBeNull(); // mídia importada, sem Post
    expect(carousel!.metrics.avgWatchTimeMs).toBeUndefined();
    expect(carousel!.metrics.saved).toBeGreaterThan(0);

    const updated = await Post.findOne({ _id: post._id, organization: org }).lean<Record<string, any>>();
    expect(updated!.metrics).toMatchObject({ views: reel!.metrics.views, saves: reel!.metrics.saved, shares: reel!.metrics.shares });

    const today = dayKey(NOW);
    const days = await InstagramAccountDaily.find({ organization: org, account: accountId }).lean<Record<string, any>[]>();
    expect(days).toHaveLength(91); // 90 dias de alcance/views + hoje com seguidores
    expect(days.find((d) => d.date === today)).toMatchObject({ followers: 12512 });
    expect(days.filter((d) => d.reach > 0 && d.views > 0)).toHaveLength(90);
    expect(await InstagramMediaDaily.countDocuments({ organization: org, date: today })).toBe(26);

    const acc = await SocialAccount.findOne({ _id: accountId, organization: org }).lean<Record<string, any>>();
    expect(acc!.lastSync).toEqual(new Date(NOW));
    expect(acc!.lastSyncError).toBe("");
  });

  it("no dia seguinte: não duplica, guarda novo histórico e renova o token", async () => {
    const next = NOW + 25 * 3_600_000;
    const r = await syncAccount(org, accountId, { fetchImpl: mockFetch(() => next), now: next });
    expect(r).toMatchObject({ ok: true, tokenRenewed: true, days: 3 }); // os 3 dias mais recentes (inclui o dia que acabou de fechar)
    expect(await InstagramMedia.countDocuments({ organization: org })).toBe(26);
    expect(await InstagramMediaDaily.countDocuments({ organization: org })).toBe(52);
    const acc = await SocialAccount.findOne({ _id: accountId, organization: org }).lean<Record<string, any>>();
    expect(acc!.tokenExpiryEstimated).toBe(false);
    expect(new Date(acc!.tokenExpiresAt).getTime()).toBe(next + 5_184_000_000);
    expect(decrypt(acc!.credentials.accessToken)).toMatch(/-r\d+$/);

    const { daily, media } = await loadInsightData(org, accountId, next);
    const dash = buildDashboard(daily, media, next);
    expect(dash.followers).toBe(12512);
    expect(dash.posts30.length).toBeGreaterThan(10);
    expect(dash.top10).toHaveLength(10);
    expect(dash.reach7.current).toBeGreaterThan(0);
    expect(dash.posts30.find((m) => m.igId === "1800000000000100")?.postTitle).toBe("Post do calendário");
  });

  it("token vencido ou inválido: registra erro amigável na conta e não derruba a rotina", async () => {
    const late = NOW + 200 * DAY;
    const r = await syncAccount(org, accountId, { fetchImpl: mockFetch(() => late), now: late });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/token venceu/);
    const acc = await SocialAccount.findOne({ _id: accountId, organization: org }).lean<Record<string, any>>();
    expect(acc!.lastSyncError).toMatch(/token venceu/);
  });
});
