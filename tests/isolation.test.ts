/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Access } from "@/lib/api";
import { OAUTH_COOKIE } from "@/lib/instagram/oauth";
import { connectInstagram } from "@/lib/instagram/accounts";
import { setFetchOverride } from "@/lib/instagram/client";
import { mockFetch } from "@/lib/instagram/mock";
import { syncAccount } from "@/lib/instagram/sync";
import { createInvite } from "@/lib/invites";
import { TENANT_MODELS, TenantScopeError } from "@/lib/tenant";
import ApiCredential from "@/models/ApiCredential";
import InstagramComment from "@/models/InstagramComment";
import { InstagramMedia } from "@/models/InstagramMedia";
import { syncComments } from "@/lib/instagram/comments";
import MediaAsset from "@/models/MediaAsset";
import Post from "@/models/Post";
import Project from "@/models/Project";
import SocialAccount from "@/models/SocialAccount";
import AiUsage from "@/models/AiUsage";
import BrandKit from "@/models/BrandKit";
import StudioJob from "@/models/StudioJob";
import VideoTemplate from "@/models/VideoTemplate";
import { SEED_TEMPLATES } from "@/lib/studio/cenas-spec";
import { setStudioFetch } from "@/lib/studio/providers";
import { setAutoKick } from "@/lib/studio/jobs";
import { PALETTE, REEL_CURTO, ROTEIRO_CURTO, studioFake } from "./studio-fake";
import { setMetaFetch } from "@/lib/ads/client";
import { metaMockFetch, youtubeMockFetch } from "@/lib/ads/mock";
import { connectAdAccount, syncAdAccount } from "@/lib/ads/accounts";
import { setYoutubeFetch } from "@/lib/competitors/youtube";
import { refreshCompetitor } from "@/lib/competitors/competitors";
import { Competitor, CompetitorProduct } from "@/models/Competitor";
import { HouseCredential } from "@/models/Platform";
import { HouseOffer, OfferDaily, OfferFavorite, OfferPage } from "@/models/Offer";
import { encrypt } from "@/lib/crypto";
import { Automation, AutomationCounter, AutomationEvent, AutomationLedger, AutomationRun, Contact, TrackedLink } from "@/models/Automation";
import { CaptureRate, ConsentLog, LeadAdsEvent, LeadAdsPage, LeadCapture, LeadEvent, LeadTask, Pipeline } from "@/models/Crm";
import { DEFAULT_STAGES } from "@/lib/crm/pure";
import { CapiLog, Sale, SalesIntegration, TrackEvent, TrackVisitor, TrackingSite } from "@/models/Tracking";
import { type Call, call, cookieFor, makeOrg, makeUser, setCookieValue, setTestEnv } from "./helpers";

// PROVA DE ISOLAMENTO ENTRE CLIENTES.
// Dois clientes (ALFA e BETA) com dados parecidos. Para CADA rota de /api:
//   1) sem login: 401 (menos as públicas);
//   2) papel errado: membro não entra em rota de dono, ninguém de cliente entra em rota de admin;
//   3) ATAQUE: o dono da ALFA usa os ids da BETA (na rota, no link e no corpo).
//      Resposta 404 (ou lista sem nada da BETA), NENHUM dado da BETA na resposta,
//      e o banco da BETA igual, byte a byte, ao de antes;
//   4) CONTROLE: o mesmo pedido com os ids da própria ALFA funciona (prova que o 404 do
//      ataque veio do isolamento, não de um pedido malformado).
// O inventário é lido do disco: rota nova sem linha na tabela CASES faz o teste falhar.

const API_DIR = path.resolve(import.meta.dirname, "../src/app/api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const NOW = Date.now();

interface Side {
  org: any; owner: any; member: any; project: any; post: any; account: any; other: any; cred: any; invite: any; inviteToken: string; asset: any; assetPath: string; comment: any; kit: any; job: any; logo: any; usage: any; adAccount: any; adSpare: any; competitor: any; competitorSpare: any; product: any; scene: any; template: any; cenasJob: any;
  automation: any; automationSpare: any; contact: any; contactSpare: any; run: any; link: any;
  pipeline: any; pipelineSpare: any; leadSpare: any; task: any; taskSpare: any; capture: any; captureSpare: any; page: any; pageSpare: any; leadDup: any;
  site: any; siteSpare: any; projectFree: any; integ: any; integSpare: any;
  offer: any; offerSpare: any; favorite: any;
}
interface World { A: Side; B: Side; admin: any; adminOrg: any; house: any }
type Req = Omit<Call, "cookie"> & { expect?: number | number[]; cookie?: string };
interface Case {
  access: Access;
  /** pedidos do dono da ALFA mirando a BETA (`t` = BETA) */
  attack?: (t: Side, me: Side, w: World) => Req[];
  /** o mesmo tipo de pedido mirando a própria ALFA (`t` = ALFA): tem de funcionar */
  own?: (t: Side, w: World) => Req;
  /** por que não há ataque/controle (rotas públicas e de admin) */
  why?: string;
}

const oauthState = { cookie: "", state: "" };

const CASES: Record<string, Case> = {
  // ---- públicas: não leem dado de cliente pelo que vem do navegador
  "POST /api/auth/login": { access: "public", why: "cria sessão; testada em white-label.test.ts" },
  "POST /api/auth/logout": { access: "public", why: "só apaga o cookie" },
  "GET /api/auth/brand": { access: "public", why: "devolve só nome exibido, logo e cor" },
  "GET /api/auth/invite/[token]": { access: "public", why: "exige o código de 256 bits do convite" },
  "POST /api/auth/invite/[token]": { access: "public", why: "exige o código de 256 bits do convite" },
  // ---- admin da plataforma: cruzam clientes por definição; cliente nenhum entra
  "GET /api/admin/organizations": { access: "admin", why: "lista todos os clientes" },
  "POST /api/admin/organizations": { access: "admin", why: "cria cliente" },
  "GET /api/admin/organizations/[id]": { access: "admin", why: "detalhe de um cliente" },
  "PUT /api/admin/organizations/[id]": { access: "admin", why: "edita um cliente" },
  "POST /api/admin/organizations/[id]/invites": { access: "admin", why: "convite para um cliente" },
  "DELETE /api/admin/organizations/[id]/invites": { access: "admin", why: "cancela convite de um cliente" },
  "POST /api/admin/impersonate": { access: "admin", why: "entrar como" },
  "DELETE /api/admin/impersonate": { access: "admin", why: "sair do entrar como" },

  // ---- conta e equipe
  "GET /api/me": { access: "org", attack: () => [{ path: "/api/me", expect: 200 }], own: () => ({ path: "/api/me" }) },
  "PUT /api/me": {
    access: "org",
    attack: (t) => [{ method: "PUT", path: "/api/me", body: { name: "Alfa Dona", organization: String(t.org._id), role: "platform_admin" }, expect: 200 }],
    own: () => ({ method: "PUT", path: "/api/me", body: { name: "Alfa Dona" } }),
  },
  "GET /api/organization": { access: "owner", attack: (t) => [{ path: `/api/organization?id=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/organization" }) },
  "PUT /api/organization": {
    access: "owner",
    attack: (t) => [{ method: "PUT", path: "/api/organization", body: { _id: String(t.org._id), organization: String(t.org._id), displayName: "Alfa Estúdio" }, expect: 200 }],
    own: () => ({ method: "PUT", path: "/api/organization", body: { color: "#22c55e" } }),
  },
  "GET /api/team": { access: "owner", attack: (t) => [{ path: `/api/team?organization=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/team" }) },
  "PUT /api/team/[id]": {
    access: "owner",
    attack: (t) => [
      { method: "PUT", path: "/api/team/x", params: { id: String(t.member._id) }, body: { active: false } },
      { method: "PUT", path: "/api/team/x", params: { id: String(t.owner._id) }, body: { role: "member" } },
    ],
    own: (t) => ({ method: "PUT", path: "/api/team/x", params: { id: String(t.member._id) }, body: { role: "member" } }),
  },
  "POST /api/invites": {
    access: "owner",
    attack: (t) => [
      { method: "POST", path: "/api/invites", body: { kind: "reset", user: String(t.owner._id) } },
      { method: "POST", path: "/api/invites", body: { kind: "owner", organization: String(t.org._id), email: "intruso@alfa.test" }, expect: 403 },
    ],
    own: (t) => ({ method: "POST", path: "/api/invites", body: { kind: "reset", user: String(t.member._id) }, expect: 201 }),
  },
  "DELETE /api/invites/[id]": {
    access: "owner",
    attack: (t) => [{ method: "DELETE", path: "/api/invites/x", params: { id: String(t.invite._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/invites/x", params: { id: String(t.invite._id) } }),
  },

  // ---- projetos e posts
  "GET /api/projects": { access: "org", attack: () => [{ path: "/api/projects", expect: 200 }], own: () => ({ path: "/api/projects" }) },
  "POST /api/projects": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/projects", body: { name: "Projeto Alfa Dois", organization: String(t.org._id) }, expect: 201 }],
    own: () => ({ method: "POST", path: "/api/projects", body: { name: "Projeto Alfa Três" }, expect: 201 }),
  },
  "GET /api/projects/[id]": {
    access: "org",
    attack: (t) => [{ path: "/api/projects/x", params: { id: String(t.project._id) } }],
    own: (t) => ({ path: "/api/projects/x", params: { id: String(t.project._id) } }),
  },
  "PUT /api/projects/[id]": {
    access: "org",
    attack: (t) => [{ method: "PUT", path: "/api/projects/x", params: { id: String(t.project._id) }, body: { name: "Invadido", active: false } }],
    own: (t) => ({ method: "PUT", path: "/api/projects/x", params: { id: String(t.project._id) }, body: { description: "ok" } }),
  },
  "GET /api/posts": {
    access: "org",
    attack: (t) => [
      { path: "/api/posts", expect: 200 },
      { path: `/api/posts?project=${t.project._id}`, expect: 200 },
      { path: `/api/posts?organization=${t.org._id}`, expect: 200 },
    ],
    own: (t) => ({ path: `/api/posts?project=${t.project._id}` }),
  },
  "POST /api/posts": {
    access: "org",
    attack: (t, me) => [
      { method: "POST", path: "/api/posts", body: post(String(t.project._id)) },
      // projeto meu, mas tentando gravar na organização do outro: grava na MINHA
      { method: "POST", path: "/api/posts", body: { ...post(String(me.project._id)), organization: String(t.org._id) }, expect: 201 },
    ],
    own: (t) => ({ method: "POST", path: "/api/posts", body: post(String(t.project._id)), expect: 201 }),
  },
  "POST /api/posts/bulk": {
    access: "org",
    attack: (t, me) => [{ method: "POST", path: "/api/posts/bulk", body: { posts: [post(String(me.project._id)), post(String(t.project._id))] } }],
    own: (t) => ({ method: "POST", path: "/api/posts/bulk", body: { posts: [post(String(t.project._id))] }, expect: 201 }),
  },
  "GET /api/posts/[id]": {
    access: "org",
    attack: (t) => [{ path: "/api/posts/x", params: { id: String(t.post._id) } }],
    own: (t) => ({ path: "/api/posts/x", params: { id: String(t.post._id) } }),
  },
  "PUT /api/posts/[id]": {
    access: "org",
    attack: (t, me) => [
      { method: "PUT", path: "/api/posts/x", params: { id: String(t.post._id) }, body: { title: "Invadido" } },
      // mover um post MEU para o projeto do outro
      { method: "PUT", path: "/api/posts/x", params: { id: String(me.post._id) }, body: { project: String(t.project._id) } },
    ],
    own: (t) => ({ method: "PUT", path: "/api/posts/x", params: { id: String(t.post._id) }, body: { status: "approved" } }),
  },
  "DELETE /api/posts/[id]": {
    access: "org",
    attack: (t) => [{ method: "DELETE", path: "/api/posts/x", params: { id: String(t.post._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/posts/x", params: { id: String(t.post._id) } }),
  },

  "GET /api/posts/[id]/workflow": {
    access: "org",
    attack: (t) => [{ path: "/api/posts/x/workflow", params: { id: String(t.post._id) } }],
    own: (t) => ({ path: "/api/posts/x/workflow", params: { id: String(t.post._id) } }),
  },
  "POST /api/posts/[id]/workflow": {
    access: "org",
    // aprovar, pedir aprovação, devolver, tentar de novo ou marcar como publicado o post do outro
    attack: (t) => ["approve", "request", "adjust", "draft", "retry", "mark_posted"].map((action) => ({ method: "POST", path: "/api/posts/x/workflow", params: { id: String(t.post._id) }, body: { action, organization: String(t.org._id) } })),
    own: (t) => ({ method: "POST", path: "/api/posts/x/workflow", params: { id: String(t.post._id) }, body: { action: "request" } }),
  },

  // ---- mídia (arquivos)
  "GET /api/uploads": { access: "org", attack: (t) => [{ path: `/api/uploads?organization=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/uploads" }) },
  "POST /api/uploads": {
    access: "org",
    // a pasta é sempre a da sessão; o corpo aqui não é imagem (415). O envio de verdade é provado em publish.test.ts
    attack: (t) => [{ method: "POST", path: `/api/uploads?organization=${t.org._id}&name=..%2F..%2F${t.org._id}%2Fx.jpg`, body: { organization: String(t.org._id) }, expect: 415 }],
    own: () => ({ method: "POST", path: "/api/uploads?name=foto.jpg", body: { nada: true }, expect: 415 }),
  },
  "PUT /api/uploads/[id]": {
    access: "org",
    attack: (t) => [{ method: "PUT", path: "/api/uploads/x", params: { id: String(t.asset._id) }, body: { fit: "crop" } }],
    own: (t) => ({ method: "PUT", path: "/api/uploads/x", params: { id: String(t.asset._id) }, body: { fit: "crop" } }),
  },
  "DELETE /api/uploads/[id]": {
    access: "org",
    attack: (t) => [{ method: "DELETE", path: "/api/uploads/x", params: { id: String(t.asset._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/uploads/x", params: { id: String(t.asset._id) } }),
  },
  "GET /api/media/[org]/[file]": { access: "public", why: "arquivo público que a Meta baixa: só abre com o nome sorteado de 192 bits; sem listagem (publish.test.ts)" },
  "POST /api/instagram/publish-due": { access: "cron", why: "agendador: só com o token de rotina; percorre só organizações com a publicação ligada" },

  // ---- contas e chaves
  "GET /api/social-accounts": {
    access: "org",
    attack: (t) => [{ path: "/api/social-accounts", expect: 200 }, { path: `/api/social-accounts?project=${t.project._id}`, expect: 200 }],
    own: () => ({ path: "/api/social-accounts" }),
  },
  "POST /api/social-accounts": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/social-accounts", body: { project: String(t.project._id), platform: "tiktok", accountName: "@intruso" } }],
    own: (t) => ({ method: "POST", path: "/api/social-accounts", body: { project: String(t.project._id), platform: "youtube", accountName: "@alfa-yt" }, expect: 201 }),
  },
  "GET /api/social-accounts/[id]": {
    access: "org",
    attack: (t) => [{ path: "/api/social-accounts/x", params: { id: String(t.account._id) } }],
    own: (t) => ({ path: "/api/social-accounts/x", params: { id: String(t.account._id) } }),
  },
  "PUT /api/social-accounts/[id]": {
    access: "org",
    attack: (t, me) => [
      { method: "PUT", path: "/api/social-accounts/x", params: { id: String(t.account._id) }, body: { active: false, credentials: { accessToken: "roubado" } } },
      { method: "PUT", path: "/api/social-accounts/x", params: { id: String(me.other._id) }, body: { project: String(t.project._id) } },
    ],
    own: (t) => ({ method: "PUT", path: "/api/social-accounts/x", params: { id: String(t.other._id) }, body: { accountName: "@alfa-tt" } }),
  },
  "DELETE /api/social-accounts/[id]": {
    access: "org",
    attack: (t) => [{ method: "DELETE", path: "/api/social-accounts/x", params: { id: String(t.account._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/social-accounts/x", params: { id: String(t.other._id) } }),
  },
  "GET /api/api-credentials": { access: "org", attack: () => [{ path: "/api/api-credentials", expect: 200 }], own: () => ({ path: "/api/api-credentials" }) },
  "POST /api/api-credentials": {
    access: "org",
    // mesmo serviço que a BETA já tem: cria o da ALFA, não mexe no da BETA
    attack: (t) => [{ method: "POST", path: "/api/api-credentials", body: { service: "openai", label: "OpenAI", organization: String(t.org._id), credentials: { apiKey: "chave-da-alfa-2" } }, expect: [200, 201] }],
    own: () => ({ method: "POST", path: "/api/api-credentials", body: { service: "gemini", label: "Gemini", credentials: { apiKey: "chave-alfa-gemini" } }, expect: 201 }),
  },
  "DELETE /api/api-credentials": {
    access: "org",
    // a BETA tem "freepik"; a ALFA não. Apagar pelo nome do serviço não pode atingir a BETA.
    attack: () => [{ method: "DELETE", path: "/api/api-credentials?service=freepik", expect: 200 }],
    own: () => ({ method: "DELETE", path: "/api/api-credentials?service=openai" }),
  },

  // ---- Instagram
  "POST /api/instagram/connect": {
    access: "org",
    attack: (t, me) => [
      { method: "POST", path: "/api/instagram/connect", body: { project: String(t.project._id), token: "IGAA-conta-intrusa-0000000001" } },
      // trocar o token da conta do outro, dizendo que é projeto meu
      { method: "POST", path: "/api/instagram/connect", body: { project: String(me.project._id), accountId: String(t.account._id), token: "IGAA-conta-intrusa-0000000001" } },
    ],
    own: (t) => ({ method: "POST", path: "/api/instagram/connect", body: { project: String(t.project._id), token: "IGAA-conta-alfaoficial-000001" }, expect: 201 }),
  },
  "GET /api/instagram/dashboard": {
    access: "org",
    attack: (t) => [
      { path: `/api/instagram/dashboard?project=${t.project._id}`, expect: 200 },
      { path: `/api/instagram/dashboard?account=${t.account._id}`, expect: 200 },
      // período escolhido: os parâmetros novos não abrem caminho para a conta do outro
      { path: `/api/instagram/dashboard?project=${t.project._id}&dias=90`, expect: 200 },
      { path: `/api/instagram/dashboard?account=${t.account._id}&periodo=mes-passado`, expect: 200 },
      { path: `/api/instagram/dashboard?account=${t.account._id}&de=2026-01-01&ate=2026-10-01`, expect: 200 },
    ],
    own: (t) => ({ path: `/api/instagram/dashboard?project=${t.project._id}&dias=7` }),
  },
  "GET /api/instagram/report": {
    access: "org+cron",
    attack: (t) => [
      { path: "/api/instagram/report", expect: 200 },
      { path: `/api/instagram/report?project=${t.project._id}`, expect: 200 },
      { path: `/api/instagram/report?project=${t.project._id}&dias=30`, expect: 200 },
      { path: `/api/instagram/report?project=${t.project._id}&de=2026-01-01&ate=2026-10-01`, expect: 200 },
      { path: "/api/instagram/report?periodo=90d", expect: 200 },
    ],
    own: () => ({ path: "/api/instagram/report?tipo=raiox&dias=30" }),
  },
  "POST /api/instagram/sync": {
    access: "org+cron",
    // pedir a conta/projeto do outro: nenhuma conta é sincronizada
    attack: (t) => [
      { method: "POST", path: "/api/instagram/sync", body: { account: String(t.account._id) }, expect: 200 },
      { method: "POST", path: "/api/instagram/sync", body: { project: String(t.project._id) }, expect: 200 },
      // buscar o histórico (12 meses) da conta do outro: nada é buscado nem gravado
      { method: "POST", path: "/api/instagram/sync", body: { account: String(t.account._id), historico: true }, expect: 200 },
    ],
    own: (t) => ({ method: "POST", path: "/api/instagram/sync", body: { account: String(t.account._id) } }),
  },
  "POST /api/instagram/publish": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/instagram/publish", body: { postId: String(t.post._id), dryRun: true } }],
    own: (t) => ({ method: "POST", path: "/api/instagram/publish", body: { postId: String(t.post._id), dryRun: true } }),
  },
  // ---- comentários (texto e @ de terceiros)
  "GET /api/instagram/comments": {
    access: "org",
    attack: (t) => [
      { path: `/api/instagram/comments?post=${t.post._id}` },
      // as duas contas de exemplo têm mídias com o MESMO id no Instagram: a ALFA só recebe os comentários dela
      { path: `/api/instagram/comments?media=${MEDIA_ID}&account=${t.account._id}&organization=${t.org._id}`, expect: 200 },
    ],
    own: () => ({ path: `/api/instagram/comments?media=${MEDIA_ID}` }),
  },
  "GET /api/instagram/comments/study": {
    access: "org",
    attack: (t) => [
      { path: `/api/instagram/comments/study?account=${t.account._id}`, expect: 200 },
      { path: `/api/instagram/comments/study?project=${t.project._id}&dias=90`, expect: 200 },
    ],
    own: (t) => ({ path: `/api/instagram/comments/study?project=${t.project._id}&dias=90` }),
  },
  "POST /api/instagram/comments/sync": {
    access: "org",
    // buscar os comentários da conta do outro: 404, nada é buscado nem gravado
    attack: (t) => [
      { method: "POST", path: "/api/instagram/comments/sync", body: { account: String(t.account._id) } },
      { method: "POST", path: "/api/instagram/comments/sync", body: { account: String(t.account._id), media: MEDIA_ID } },
      { method: "POST", path: "/api/instagram/comments/sync", body: { account: String(t.account._id), periodo: "90d", organization: String(t.org._id) } },
    ],
    own: (t) => ({ method: "POST", path: "/api/instagram/comments/sync", body: { account: String(t.account._id), media: MEDIA_ID } }),
  },
  "POST /api/instagram/comments/[id]/reply": {
    access: "org",
    // chave de resposta desligada: 403 antes de qualquer leitura (com a chave ligada, o comentário
    // do outro cliente dá 404: provado em comments.test.ts)
    attack: (t) => [{ method: "POST", path: "/api/instagram/comments/x/reply", params: { id: String(t.comment._id) }, body: { message: "invadido", confirm: true }, expect: 403 }],
    own: (t) => ({ method: "POST", path: "/api/instagram/comments/x/reply", params: { id: String(t.comment._id) }, body: { message: "oi", confirm: true }, expect: 403 }),
  },
  "POST /api/instagram/accounts/[id]/test": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/instagram/accounts/x/test", params: { id: String(t.account._id) } }],
    own: (t) => ({ method: "POST", path: "/api/instagram/accounts/x/test", params: { id: String(t.account._id) } }),
  },
  "POST /api/instagram/accounts/[id]/renew": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/instagram/accounts/x/renew", params: { id: String(t.account._id) } }],
    // conta recém-conectada: a Meta só renova depois de 24h (aviso 409, que prova que a conta foi achada)
    own: (t) => ({ method: "POST", path: "/api/instagram/accounts/x/renew", params: { id: String(t.account._id) }, expect: 409 }),
  },
  "GET /api/instagram/oauth/start": {
    access: "org",
    attack: (t) => [{ path: `/api/instagram/oauth/start?project=${t.project._id}` }],
    own: (t) => ({ path: `/api/instagram/oauth/start?project=${t.project._id}`, expect: 307 }),
  },
  "GET /api/instagram/oauth/callback": {
    access: "org",
    // um `state` assinado para a BETA (dona da BETA), apresentado pela sessão da ALFA: recusado
    attack: () => [{ path: `/api/instagram/oauth/callback?code=codigo-qualquer&state=${encodeURIComponent(oauthState.state)}`, headers: { cookie2: oauthState.cookie }, expect: 307 }],
    own: () => ({ path: "/api/instagram/oauth/callback?error=access_denied&error_reason=user_denied", expect: 307 }),
  },

  // ---- Estúdio (chaves de IA, kit de marca, carrossel, Reel, uso)
  "GET /api/estudio/chaves": { access: "org", attack: (t) => [{ path: `/api/estudio/chaves?organization=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/estudio/chaves" }) },
  "PUT /api/estudio/chaves": {
    access: "owner",
    // a chave e a ordem vão sempre para a organização da sessão, diga o corpo o que disser
    attack: (t) => [{ method: "PUT", path: "/api/estudio/chaves", body: { organization: String(t.org._id), service: "openai", apiKey: "chave-de-ataque-000001", chains: { texto: ["openai"] } }, expect: 200 }],
    own: () => ({ method: "PUT", path: "/api/estudio/chaves", body: { service: "anthropic", apiKey: "chave-de-controle-000001" } }),
  },
  "DELETE /api/estudio/chaves": {
    access: "owner",
    // a BETA tem chave "openai": apagar "openai" pela ALFA não pode tocar nela (o banco da BETA é conferido)
    attack: (t) => [{ method: "DELETE", path: `/api/estudio/chaves?service=openai&organization=${t.org._id}`, expect: 200 }],
    own: () => ({ method: "DELETE", path: "/api/estudio/chaves?service=anthropic" }),
  },
  "POST /api/estudio/chaves/testar": {
    access: "owner",
    attack: (t) => [{ method: "POST", path: "/api/estudio/chaves/testar", body: { service: "openai", organization: String(t.org._id) }, expect: [200, 404] }],
    own: () => ({ method: "POST", path: "/api/estudio/chaves/testar", body: { service: "anthropic" } }),
  },
  "GET /api/estudio/kit": { access: "org", attack: (t) => [{ path: `/api/estudio/kit?project=${t.project._id}` }], own: (t) => ({ path: `/api/estudio/kit?project=${t.project._id}` }) },
  "PUT /api/estudio/kit": {
    access: "org",
    attack: (t) => [{ method: "PUT", path: "/api/estudio/kit", body: { project: String(t.project._id), organization: String(t.org._id), name: "Invasor", palette: PALETTE } }],
    own: (t) => ({ method: "PUT", path: "/api/estudio/kit", body: { project: String(t.project._id), name: "Marca Alfa", handle: "@alfaoficial", palette: PALETTE } }),
  },
  "POST /api/estudio/arquivo": {
    access: "org",
    attack: (t) => [{ method: "POST", path: `/api/estudio/arquivo?tipo=logo&project=${t.project._id}`, body: { nada: true } }],
    own: () => ({ method: "POST", path: "/api/estudio/arquivo?tipo=trilha", body: { nada: true }, expect: 415 }),
  },
  "DELETE /api/estudio/arquivo": {
    access: "org",
    attack: (t) => [{ method: "DELETE", path: `/api/estudio/arquivo?id=${t.logo._id}` }, { method: "DELETE", path: `/api/estudio/arquivo?id=${t.asset._id}` }],
    own: (t) => ({ method: "DELETE", path: `/api/estudio/arquivo?id=${t.logo._id}` }),
  },
  "POST /api/estudio/previa": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/estudio/previa", body: { project: String(t.project._id), modelo: "editorial" } }],
    own: (t) => ({ method: "POST", path: "/api/estudio/previa", body: { project: String(t.project._id), kit: { name: "Marca Alfa", handle: "@alfaoficial", palette: PALETTE }, modelo: "editorial" } }),
  },
  "POST /api/estudio/roteiro": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/estudio/roteiro", body: { project: String(t.project._id), tipo: "temas", organization: String(t.org._id) } }],
    own: (t) => ({ method: "POST", path: "/api/estudio/roteiro", body: { project: String(t.project._id), tipo: "temas" } }),
  },
  "POST /api/estudio/carrossel": {
    access: "org",
    attack: (t, me) => [
      { method: "POST", path: "/api/estudio/carrossel", body: { project: String(t.project._id), script: ROTEIRO_CURTO } },
      // rascunho no próprio projeto, mas com as mídias da BETA
      { method: "POST", path: "/api/estudio/carrossel", body: { project: String(me.project._id), script: ROTEIRO_CURTO, acao: "salvar", assets: [String(t.asset._id), String(t.logo._id), String(t.asset._id)] }, expect: [404, 409] },
    ],
    own: (t) => ({ method: "POST", path: "/api/estudio/carrossel", body: { project: String(t.project._id), script: ROTEIRO_CURTO } }),
  },
  "GET /api/estudio/trabalhos": { access: "org", attack: (t) => [{ path: `/api/estudio/trabalhos?project=${t.project._id}`, expect: 200 }], own: (t) => ({ path: `/api/estudio/trabalhos?project=${t.project._id}` }) },
  "POST /api/estudio/trabalhos": {
    access: "org",
    attack: (t, me) => [
      { method: "POST", path: "/api/estudio/trabalhos", body: { project: String(t.project._id), kind: "reel_montado", script: REEL_CURTO } },
      // cena com a imagem da BETA e trilha da BETA, no próprio projeto
      { method: "POST", path: "/api/estudio/trabalhos", body: { project: String(me.project._id), kind: "reel_montado", script: { ...REEL_CURTO, cenas: REEL_CURTO.cenas.map((c) => ({ ...c, imagem: String(t.asset._id) })) } } },
      { method: "POST", path: "/api/estudio/trabalhos", body: { project: String(me.project._id), kind: "reel_montado", script: REEL_CURTO, trilha: String(t.logo._id) } },
      { method: "POST", path: "/api/estudio/trabalhos", body: { project: String(t.project._id), kind: "reel_cenas", script: REEL_CURTO, simular: true } },
      { method: "POST", path: "/api/estudio/trabalhos", body: { project: String(me.project._id), kind: "reel_cenas", template: String(t.template._id), script: REEL_CURTO, simular: true } },
    ],
    own: (t) => ({ method: "POST", path: "/api/estudio/trabalhos", body: { project: String(t.project._id), kind: "reel_montado", script: REEL_CURTO, simular: true } }),
  },
  "GET /api/estudio/trabalhos/[id]": { access: "org", attack: (t) => [{ path: "/api/estudio/trabalhos/x", params: { id: String(t.job._id) } }], own: (t) => ({ path: "/api/estudio/trabalhos/x", params: { id: String(t.job._id) } }) },
  "PUT /api/estudio/trabalhos/[id]": {
    access: "org",
    attack: (t) => [{ method: "PUT", path: "/api/estudio/trabalhos/x", params: { id: String(t.job._id) }, body: { seen: true } }],
    own: (t) => ({ method: "PUT", path: "/api/estudio/trabalhos/x", params: { id: String(t.job._id) }, body: { seen: true } }),
  },
  "DELETE /api/estudio/trabalhos/[id]": {
    access: "org",
    attack: (t) => [{ method: "DELETE", path: "/api/estudio/trabalhos/x", params: { id: String(t.job._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/estudio/trabalhos/x", params: { id: String(t.job._id) } }),
  },
  // ---- Ajuda: conteúdo igual para todos; artigo de administrador some para cliente; andamento por projeto
  "GET /api/ajuda": { access: "org", attack: (t) => [{ path: `/api/ajuda?organization=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/ajuda" }) },
  "GET /api/ajuda/[id]": {
    access: "org",
    attack: () => [{ path: "/api/ajuda/x", params: { id: "admin-clientes" } }, { path: "/api/ajuda/x", params: { id: "../../package.json" } }],
    own: () => ({ path: "/api/ajuda/x", params: { id: "primeiros-passos" } }),
  },
  "GET /api/ajuda/telas": { access: "org", attack: (t) => [{ path: `/api/ajuda/telas?organization=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/ajuda/telas" }) },
  "GET /api/ajuda/checklist": { access: "org", attack: (t) => [{ path: `/api/ajuda/checklist?project=${t.project._id}` }], own: (t) => ({ path: `/api/ajuda/checklist?project=${t.project._id}` }) },
  // ---- Reel com cenas: biblioteca, Pexels, padrões de vídeo e roteiro
  "GET /api/estudio/cenas": { access: "org", attack: (t) => [{ path: `/api/estudio/cenas?organization=${t.org._id}&categoria=mar/praia`, expect: 200 }], own: () => ({ path: "/api/estudio/cenas" }) },
  "POST /api/estudio/cenas": {
    access: "org",
    // o envio cai SEMPRE na pasta da organização da sessão; o corpo aqui não é vídeo (o envio real está em cenas.test.ts)
    attack: (t) => [{ method: "POST", path: `/api/estudio/cenas?categoria=mar&licenca=proprio&autor=Invasor&organization=${t.org._id}`, body: { organization: String(t.org._id) }, expect: 415 }],
    own: () => ({ method: "POST", path: "/api/estudio/cenas?categoria=mar&licenca=proprio&autor=Alfa", body: { nada: true }, expect: 415 }),
  },
  "PUT /api/estudio/cenas/[id]": {
    access: "org",
    attack: (t) => [{ method: "PUT", path: "/api/estudio/cenas/x", params: { id: String(t.scene._id) }, body: { category: "invadida", active: false } }, { method: "PUT", path: "/api/estudio/cenas/x", params: { id: String(t.asset._id) }, body: { category: "invadida" } }],
    own: (t) => ({ method: "PUT", path: "/api/estudio/cenas/x", params: { id: String(t.scene._id) }, body: { category: "praia", tags: "sol, mar" } }),
  },
  "DELETE /api/estudio/cenas/[id]": {
    access: "org",
    attack: (t) => [{ method: "DELETE", path: "/api/estudio/cenas/x", params: { id: String(t.scene._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/estudio/cenas/x", params: { id: String(t.scene._id) } }),
  },
  "GET /api/estudio/cenas/pexels": { access: "org", attack: (t) => [{ path: `/api/estudio/cenas/pexels?q=ocean&organization=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/estudio/cenas/pexels?q=ocean" }) },
  "POST /api/estudio/cenas/pexels": {
    access: "org",
    // sem a chave da casa do Pexels: 400 para todos (a importação real, com chave simulada, está em cenas.test.ts)
    attack: (t) => [{ method: "POST", path: "/api/estudio/cenas/pexels", body: { id: 123, categoria: "mar", organization: String(t.org._id) }, expect: 400 }],
    own: () => ({ method: "POST", path: "/api/estudio/cenas/pexels", body: { id: 123, categoria: "mar" }, expect: 400 }),
  },
  "POST /api/estudio/cenas/roteiro": {
    access: "org",
    attack: (t, me) => [
      { method: "POST", path: "/api/estudio/cenas/roteiro", body: { project: String(t.project._id), modo: "prompt", texto: "Frase de ataque um. Frase de ataque dois." } },
      { method: "POST", path: "/api/estudio/cenas/roteiro", body: { project: String(me.project._id), template: String(t.template._id), modo: "prompt", texto: "Frase um. Frase dois." } },
    ],
    own: (t) => ({ method: "POST", path: "/api/estudio/cenas/roteiro", body: { project: String(t.project._id), template: String(t.template._id), modo: "prompt", texto: "Frase um aqui. Frase dois aqui." } }),
  },
  "GET /api/estudio/padroes": { access: "org", attack: (t) => [{ path: `/api/estudio/padroes?project=${t.project._id}` }], own: (t) => ({ path: `/api/estudio/padroes?project=${t.project._id}` }) },
  "POST /api/estudio/padroes": {
    access: "org",
    attack: (t, me) => [
      { method: "POST", path: "/api/estudio/padroes", body: { project: String(t.project._id), name: "Padrão invasor" } },
      { method: "POST", path: "/api/estudio/padroes", body: { project: String(me.project._id), name: "Copiado da Beta", fromJob: String(t.cenasJob._id) } },
    ],
    own: (t) => ({ method: "POST", path: "/api/estudio/padroes", body: { project: String(t.project._id), name: "Salvo do vídeo", fromJob: String(t.cenasJob._id) }, expect: 201 }),
  },
  "PUT /api/estudio/padroes/[id]": {
    access: "org",
    attack: (t) => [{ method: "PUT", path: "/api/estudio/padroes/x", params: { id: String(t.template._id) }, body: { name: "Invadido", isDefault: true, settings: { cutSeconds: 2 } } }],
    own: (t) => ({ method: "PUT", path: "/api/estudio/padroes/x", params: { id: String(t.template._id) }, body: { settings: { cutSeconds: 3 } } }),
  },
  "DELETE /api/estudio/padroes/[id]": {
    access: "org",
    attack: (t) => [{ method: "DELETE", path: "/api/estudio/padroes/x", params: { id: String(t.template._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/estudio/padroes/x", params: { id: String(t.template._id) } }),
  },
  "GET /api/estudio/uso": { access: "org", attack: (t) => [{ path: `/api/estudio/uso?organization=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/estudio/uso" }) },
  "POST /api/estudio/worker": { access: "cron", why: "fila do Estúdio: só com o token de rotina; cada trabalho é processado dentro da organização dele" },
  "GET /api/admin/estudio": { access: "admin", why: "chaves da casa, teto padrão e teto de cada cliente" },
  "GET /api/admin/integracoes": { access: "admin", why: "chave da casa do YouTube (dados públicos)" },
  "PUT /api/admin/integracoes": { access: "admin", why: "chave da casa do YouTube (dados públicos)" },

  // ---- Tráfego (Meta Ads, só leitura) — token de anúncio é segredo do cliente
  "GET /api/trafego/contas": {
    access: "org",
    attack: (t) => [{ path: `/api/trafego/contas?project=${t.project._id}`, expect: 200 }, { path: `/api/trafego/contas?organization=${t.org._id}`, expect: 200 }],
    own: (t) => ({ path: `/api/trafego/contas?project=${t.project._id}` }),
  },
  "POST /api/trafego/contas": {
    access: "org",
    attack: (t, me) => [
      { method: "POST", path: "/api/trafego/contas", body: { project: String(t.project._id), adAccountId: "act_3333333333", token: ADS_TOKEN } },
      // projeto meu, mas a mesma conta de anúncio da BETA: cria a MINHA, não toca na dela
      { method: "POST", path: "/api/trafego/contas", body: { project: String(me.project._id), adAccountId: t.adAccount.adAccountId, organization: String(t.org._id), token: ADS_TOKEN }, expect: 201 },
    ],
    own: (t) => ({ method: "POST", path: "/api/trafego/contas", body: { project: String(t.project._id), adAccountId: "act_4444444444", token: ADS_TOKEN }, expect: 201 }),
  },
  "PUT /api/trafego/contas/[id]": {
    access: "org",
    attack: (t) => [{ method: "PUT", path: "/api/trafego/contas/x", params: { id: String(t.adAccount._id) }, body: { active: false, igUserId: "" } }],
    own: (t) => ({ method: "PUT", path: "/api/trafego/contas/x", params: { id: String(t.adAccount._id) }, body: { active: true } }),
  },
  "DELETE /api/trafego/contas/[id]": {
    access: "org",
    attack: (t) => [{ method: "DELETE", path: "/api/trafego/contas/x", params: { id: String(t.adAccount._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/trafego/contas/x", params: { id: String(t.adSpare._id) } }),
  },
  "POST /api/trafego/sync": {
    access: "org+cron",
    attack: (t) => [
      { method: "POST", path: "/api/trafego/sync", body: { account: String(t.adAccount._id) } },
      { method: "POST", path: "/api/trafego/sync", body: { account: String(t.adAccount._id), dias: 365 } },
      // pelo projeto do outro: nenhuma conta é buscada
      { method: "POST", path: "/api/trafego/sync", body: { project: String(t.project._id), organization: String(t.org._id) }, expect: 200 },
    ],
    own: (t) => ({ method: "POST", path: "/api/trafego/sync", body: { account: String(t.adAccount._id) } }),
  },
  "GET /api/trafego/painel": {
    access: "org",
    attack: (t, me) => [
      { path: `/api/trafego/painel?project=${t.project._id}` },
      { path: `/api/trafego/painel?project=${me.project._id}&account=${t.adAccount._id}&dias=90` },
    ],
    own: (t) => ({ path: `/api/trafego/painel?project=${t.project._id}&dias=7` }),
  },
  "POST /api/trafego/acoes": {
    access: "owner",
    // duas chaves desligadas: 403 antes de ler qualquer coisa (ligadas, o id do outro dá 404: trafego.test.ts)
    attack: (t) => [{ method: "POST", path: "/api/trafego/acoes", body: { account: String(t.adAccount._id), level: "campaign", id: "120200000000001", action: "pause", confirm: true }, expect: 403 }],
    own: (t) => ({ method: "POST", path: "/api/trafego/acoes", body: { account: String(t.adAccount._id), level: "campaign", id: "120200000000001", action: "pause", confirm: true }, expect: 403 }),
  },

  // ---- Concorrentes
  "GET /api/concorrentes": {
    access: "org",
    attack: (t) => [{ path: `/api/concorrentes?project=${t.project._id}` }],
    own: (t) => ({ path: `/api/concorrentes?project=${t.project._id}` }),
  },
  "POST /api/concorrentes": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/concorrentes", body: { project: String(t.project._id), name: "Intruso", instagram: "intruso" } }],
    own: (t) => ({ method: "POST", path: "/api/concorrentes", body: { project: String(t.project._id), name: "Concorrente Alfa Dois", instagram: "marca_c" }, expect: 201 }),
  },
  "PUT /api/concorrentes/[id]": {
    access: "org",
    attack: (t) => [{ method: "PUT", path: "/api/concorrentes/x", params: { id: String(t.competitor._id) }, body: { name: "Invadido" } }],
    own: (t) => ({ method: "PUT", path: "/api/concorrentes/x", params: { id: String(t.competitor._id) }, body: { notes: "ok" } }),
  },
  "DELETE /api/concorrentes/[id]": {
    access: "org",
    attack: (t) => [{ method: "DELETE", path: "/api/concorrentes/x", params: { id: String(t.competitor._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/concorrentes/x", params: { id: String(t.competitorSpare._id) } }),
  },
  "POST /api/concorrentes/[id]/anuncios": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/concorrentes/x/anuncios", params: { id: String(t.competitor._id) } }],
    own: (t) => ({ method: "POST", path: "/api/concorrentes/x/anuncios", params: { id: String(t.competitor._id) } }),
  },
  "POST /api/concorrentes/atualizar": {
    access: "org+cron",
    attack: (t) => [
      { method: "POST", path: "/api/concorrentes/atualizar", body: { competitor: String(t.competitor._id) } },
      { method: "POST", path: "/api/concorrentes/atualizar", body: { project: String(t.project._id) }, expect: 200 },
    ],
    own: (t) => ({ method: "POST", path: "/api/concorrentes/atualizar", body: { competitor: String(t.competitor._id) } }),
  },
  "GET /api/concorrentes/produtos": {
    access: "org",
    attack: (t) => [{ path: `/api/concorrentes/produtos?project=${t.project._id}` }],
    own: (t) => ({ path: `/api/concorrentes/produtos?project=${t.project._id}` }),
  },
  "POST /api/concorrentes/produtos": {
    access: "org",
    attack: (t, me) => [
      { method: "POST", path: "/api/concorrentes/produtos", body: { project: String(t.project._id), name: "Produto intruso" } },
      // produto no meu projeto ligado ao concorrente da BETA
      { method: "POST", path: "/api/concorrentes/produtos", body: { project: String(me.project._id), name: "Produto intruso", competitor: String(t.competitor._id) } },
    ],
    own: (t) => ({ method: "POST", path: "/api/concorrentes/produtos", body: { project: String(t.project._id), name: "Curso Alfa", price: "197,00", competitor: String(t.competitor._id) }, expect: 201 }),
  },
  "PUT /api/concorrentes/produtos/[id]": {
    access: "org",
    attack: (t, me) => [
      { method: "PUT", path: "/api/concorrentes/produtos/x", params: { id: String(t.product._id) }, body: { price: 1 } },
      { method: "PUT", path: "/api/concorrentes/produtos/x", params: { id: String(me.product._id) }, body: { competitor: String(t.competitor._id) } },
    ],
    own: (t) => ({ method: "PUT", path: "/api/concorrentes/produtos/x", params: { id: String(t.product._id) }, body: { price: "297" } }),
  },
  "DELETE /api/concorrentes/produtos/[id]": {
    access: "org",
    attack: (t) => [{ method: "DELETE", path: "/api/concorrentes/produtos/x", params: { id: String(t.product._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/concorrentes/produtos/x", params: { id: String(t.product._id) } }),
  },
  "PUT /api/admin/estudio": { access: "admin", why: "chaves da casa, teto padrão e teto de cada cliente" },

  // ---- Automações do direct e contatos
  "GET /api/instagram/webhook": { access: "public", why: "verificação da Meta: só devolve o hub.challenge com o token de verificação certo (automacoes.test.ts)" },
  "POST /api/instagram/webhook": { access: "public", why: "quem chama é a Meta: corpo assinado (HMAC do segredo do app) conferido antes de tudo; não devolve dado de cliente (automacoes.test.ts)" },
  "GET /api/r/[org]/[code]": { access: "public", why: "link da DM: código sorteado de 64 bits dentro da organização; só soma clique e redireciona (automacoes.test.ts)" },
  "POST /api/automacoes/worker": { access: "cron", why: "motor das automações: só com o token de rotina; percorre só organizações com a chave ligada" },
  "GET /api/automacoes": {
    access: "org",
    attack: (t) => [{ path: `/api/automacoes?project=${t.project._id}` }, { path: `/api/automacoes?organization=${t.org._id}`, expect: 200 }],
    own: (t) => ({ path: `/api/automacoes?project=${t.project._id}` }),
  },
  "POST /api/automacoes": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/automacoes", body: { account: String(t.account._id), name: "Intrusa", trigger: { kind: "comment", scope: "all", keywords: ["quero"] }, dm: { text: "oi" } } }],
    own: (t) => ({ method: "POST", path: "/api/automacoes", body: { account: String(t.account._id), name: "Automação Alfa Dois", trigger: { kind: "dm", keywords: ["preco"] }, dm: { text: "R$ 97" } }, expect: 201 }),
  },
  "GET /api/automacoes/[id]": {
    access: "org",
    attack: (t) => [{ path: "/api/automacoes/x", params: { id: String(t.automation._id) } }],
    own: (t) => ({ path: "/api/automacoes/x", params: { id: String(t.automation._id) } }),
  },
  "PUT /api/automacoes/[id]": {
    access: "org",
    attack: (t) => [
      { method: "PUT", path: "/api/automacoes/x", params: { id: String(t.automation._id) }, body: { name: "Invadida", active: false } },
      { method: "PUT", path: "/api/automacoes/x", params: { id: String(t.automation._id) }, body: { dryRun: false, confirm: true } },
    ],
    own: (t) => ({ method: "PUT", path: "/api/automacoes/x", params: { id: String(t.automation._id) }, body: { name: "Ebook Alfa" } }),
  },
  "DELETE /api/automacoes/[id]": {
    access: "owner",
    attack: (t) => [{ method: "DELETE", path: "/api/automacoes/x", params: { id: String(t.automation._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/automacoes/x", params: { id: String(t.automationSpare._id) } }),
  },
  "GET /api/automacoes/midias": {
    access: "org",
    attack: (t) => [{ path: `/api/automacoes/midias?account=${t.account._id}` }],
    own: (t) => ({ path: `/api/automacoes/midias?account=${t.account._id}` }),
  },
  "GET /api/automacoes/execucoes": {
    access: "org",
    attack: (t) => [
      { path: `/api/automacoes/execucoes?automation=${t.automation._id}`, expect: 200 },
      { path: `/api/automacoes/execucoes?account=${t.account._id}`, expect: 200 },
    ],
    own: (t) => ({ path: `/api/automacoes/execucoes?automation=${t.automation._id}` }),
  },
  "POST /api/automacoes/simular": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/automacoes/simular", body: { automation: String(t.automation._id), text: "quero" } }],
    own: (t) => ({ method: "POST", path: "/api/automacoes/simular", body: { automation: String(t.automation._id), text: "quero" } }),
  },
  "POST /api/automacoes/assinar": {
    access: "owner",
    // chaves desligadas neste mundo: nada vai à Meta, nem para a própria conta
    attack: (t) => [{ method: "POST", path: "/api/automacoes/assinar", body: { account: String(t.account._id) }, expect: 403 }],
    own: (t) => ({ method: "POST", path: "/api/automacoes/assinar", body: { account: String(t.account._id) }, expect: 403 }),
  },
  "GET /api/contatos": {
    access: "org",
    attack: (t) => [
      { path: `/api/contatos?account=${t.account._id}`, expect: 200 },
      { path: `/api/contatos?project=${t.project._id}&formato=csv`, expect: 200 },
      { path: "/api/contatos?tag=cliente-beta", expect: 200 },
    ],
    own: (t) => ({ path: `/api/contatos?account=${t.account._id}` }),
  },
  "PUT /api/contatos/[id]": {
    access: "org",
    attack: (t) => [{ method: "PUT", path: "/api/contatos/x", params: { id: String(t.contact._id) }, body: { tags: ["invadido"] } }],
    own: (t) => ({ method: "PUT", path: "/api/contatos/x", params: { id: String(t.contact._id) }, body: { tags: ["vip"] } }),
  },
  "DELETE /api/contatos/[id]": {
    access: "owner",
    attack: (t) => [{ method: "DELETE", path: "/api/contatos/x", params: { id: String(t.contact._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/contatos/x", params: { id: String(t.contactSpare._id) } }),
  },

  // ---- CRM de leads
  "GET /api/captura/[org]/[code]": { access: "public", why: "formulário de captura: código sorteado de 64 bits dentro da organização; devolve só a ficha anti-robô e o texto de consentimento (crm.test.ts)" },
  "POST /api/captura/[org]/[code]": { access: "public", why: "formulário de captura: ficha assinada, isca, teto por IP, consentimento; responde só ok/erro/para onde ir, nunca dado do cliente (crm.test.ts)" },
  "GET /api/crm/lead-ads/webhook": { access: "public", why: "verificação da Meta: só devolve o hub.challenge com LEAD_ADS_VERIFY_TOKEN certo (crm.test.ts)" },
  "POST /api/crm/lead-ads/webhook": { access: "public", why: "quem chama é a Meta: corpo assinado (META_APP_SECRET) conferido antes de tudo; acha a Página pelo page_id e grava na organização dela; não devolve dado de cliente (crm.test.ts)" },
  "GET /api/crm/leads": {
    access: "org",
    attack: (t) => [
      { path: `/api/crm/leads?funil=${t.pipeline._id}` },
      { path: `/api/crm/leads?funil=${t.pipeline._id}&formato=csv` },
      { path: `/api/crm/leads?responsavel=${t.owner._id}&campanha=campbeta&q=Beta`, expect: 200 },
      { path: `/api/crm/leads?organization=${t.org._id}&etiqueta=cliente-beta`, expect: 200 },
    ],
    own: (t) => ({ path: `/api/crm/leads?funil=${t.pipeline._id}` }),
  },
  "POST /api/crm/leads": {
    access: "org",
    attack: (t) => [
      { method: "POST", path: "/api/crm/leads", body: { name: "Intruso", pipeline: String(t.pipeline._id) } },
      { method: "POST", path: "/api/crm/leads", body: { name: "Intruso", owner: String(t.owner._id) }, expect: 400 },
      // mesmo telefone de um lead da BETA: vira lead NOVO da ALFA (o dedupe nunca cruza clientes)
      { method: "POST", path: "/api/crm/leads", body: { name: "Mesmo telefone", phone: "11 98888-7777", consent: true, consentBasis: "teste de isolamento", organization: String(t.org._id) }, expect: [200, 201] },
    ],
    own: (t) => ({ method: "POST", path: "/api/crm/leads", body: { name: "Lead Alfa Novo", pipeline: String(t.pipeline._id), owner: String(t.member._id) }, expect: 201 }),
  },
  "GET /api/crm/leads/[id]": {
    access: "org",
    attack: (t) => [{ path: "/api/crm/leads/x", params: { id: String(t.contact._id) } }],
    own: (t) => ({ path: "/api/crm/leads/x", params: { id: String(t.contact._id) } }),
  },
  "PUT /api/crm/leads/[id]": {
    access: "org",
    attack: (t, me) => [
      { method: "PUT", path: "/api/crm/leads/x", params: { id: String(t.contact._id) }, body: { stage: "ganhou" } },
      { method: "PUT", path: "/api/crm/leads/x", params: { id: String(me.contact._id) }, body: { owner: String(t.owner._id) }, expect: 400 },
      { method: "PUT", path: "/api/crm/leads/x", params: { id: String(me.contact._id) }, body: { stage: "novo", pipeline: String(t.pipeline._id) } },
    ],
    own: (t) => ({ method: "PUT", path: "/api/crm/leads/x", params: { id: String(t.contact._id) }, body: { stage: "ganhou", value: "999", owner: String(t.member._id) } }),
  },
  "DELETE /api/crm/leads/[id]": {
    access: "owner",
    attack: (t) => [{ method: "DELETE", path: "/api/crm/leads/x", params: { id: String(t.leadSpare._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/crm/leads/x", params: { id: String(t.leadSpare._id) } }),
  },
  "GET /api/crm/leads/[id]/exportar": {
    access: "owner",
    attack: (t) => [{ path: "/api/crm/leads/x/exportar", params: { id: String(t.contact._id) } }],
    own: (t) => ({ path: "/api/crm/leads/x/exportar", params: { id: String(t.contact._id) } }),
  },
  "POST /api/crm/leads/[id]/notas": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/crm/leads/x/notas", params: { id: String(t.contact._id) }, body: { text: "intrusa" } }],
    own: (t) => ({ method: "POST", path: "/api/crm/leads/x/notas", params: { id: String(t.contact._id) }, body: { text: "nota da alfa" }, expect: 201 }),
  },
  "POST /api/crm/leads/[id]/tarefas": {
    access: "org",
    attack: (t, me) => [
      { method: "POST", path: "/api/crm/leads/x/tarefas", params: { id: String(t.contact._id) }, body: { title: "intrusa" } },
      { method: "POST", path: "/api/crm/leads/x/tarefas", params: { id: String(me.contact._id) }, body: { title: "para a beta", assignee: String(t.owner._id) }, expect: 400 },
    ],
    own: (t) => ({ method: "POST", path: "/api/crm/leads/x/tarefas", params: { id: String(t.contact._id) }, body: { title: "Ligar" }, expect: 201 }),
  },
  "POST /api/crm/leads/[id]/mesclar": {
    access: "org",
    attack: (t, me) => [
      { method: "POST", path: "/api/crm/leads/x/mesclar", params: { id: String(me.contact._id) }, body: { other: String(t.leadSpare._id) } },
      { method: "POST", path: "/api/crm/leads/x/mesclar", params: { id: String(t.contact._id) }, body: { other: String(me.contactSpare._id) } },
    ],
    own: (t) => ({ method: "POST", path: "/api/crm/leads/x/mesclar", params: { id: String(t.contact._id) }, body: { other: String(t.leadDup._id) } }),
  },
  "GET /api/crm/tarefas": { access: "org", attack: (t) => [{ path: `/api/crm/tarefas?organization=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/crm/tarefas" }) },
  "PUT /api/crm/tarefas/[id]": {
    access: "org",
    attack: (t, me) => [
      { method: "PUT", path: "/api/crm/tarefas/x", params: { id: String(t.task._id) }, body: { done: true } },
      { method: "PUT", path: "/api/crm/tarefas/x", params: { id: String(me.task._id) }, body: { assignee: String(t.owner._id) }, expect: 400 },
    ],
    own: (t) => ({ method: "PUT", path: "/api/crm/tarefas/x", params: { id: String(t.task._id) }, body: { done: true } }),
  },
  "DELETE /api/crm/tarefas/[id]": {
    access: "org",
    attack: (t) => [{ method: "DELETE", path: "/api/crm/tarefas/x", params: { id: String(t.taskSpare._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/crm/tarefas/x", params: { id: String(t.taskSpare._id) } }),
  },
  "GET /api/crm/funis": { access: "org", attack: (t) => [{ path: `/api/crm/funis?organization=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/crm/funis" }) },
  "POST /api/crm/funis": {
    access: "owner",
    attack: (t) => [{ method: "POST", path: "/api/crm/funis", body: { name: "Funil da Alfa (ataque)", organization: String(t.org._id) }, expect: [201, 400] }],
    own: () => ({ method: "POST", path: "/api/crm/funis", body: { name: "Pós-venda Alfa" }, expect: 201 }),
  },
  "PUT /api/crm/funis/[id]": {
    access: "owner",
    attack: (t) => [{ method: "PUT", path: "/api/crm/funis/x", params: { id: String(t.pipeline._id) }, body: { name: "Invadido", stages: [{ name: "Só uma" }] } }],
    own: (t) => ({ method: "PUT", path: "/api/crm/funis/x", params: { id: String(t.pipelineSpare._id) }, body: { name: "Funil Alfa renomeado" } }),
  },
  "DELETE /api/crm/funis/[id]": {
    access: "owner",
    attack: (t) => [{ method: "DELETE", path: "/api/crm/funis/x", params: { id: String(t.pipelineSpare._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/crm/funis/x", params: { id: String(t.pipelineSpare._id) } }),
  },
  "GET /api/crm/opcoes": { access: "org", attack: (t) => [{ path: `/api/crm/opcoes?organization=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/crm/opcoes" }) },
  "POST /api/crm/importar": {
    access: "org",
    attack: (t) => [
      { method: "POST", path: "/api/crm/importar", body: { csv: "nome,telefone\nX,11 98888-7777\n", pipeline: String(t.pipeline._id), commit: true } },
      { method: "POST", path: "/api/crm/importar", body: { csv: "nome\nX\n", owner: String(t.owner._id), commit: true }, expect: 400 },
      // prévia com o telefone de um lead da BETA: aparece como NOVO (não acha nada do outro cliente)
      { method: "POST", path: "/api/crm/importar", body: { csv: "nome,telefone\nX,11 98888-7777\n" }, expect: 200 },
    ],
    own: (t) => ({ method: "POST", path: "/api/crm/importar", body: { csv: "nome,email\nPlanilha Alfa,planilha@alfa.test\n", pipeline: String(t.pipeline._id), consent: true, consentBasis: "inscritos", commit: true } }),
  },
  "GET /api/crm/relatorios": {
    access: "org",
    attack: (t) => [{ path: `/api/crm/relatorios?agrupar=campanha&organization=${t.org._id}`, expect: 200 }, { path: "/api/crm/relatorios?agrupar=origem&formato=csv", expect: 200 }],
    own: () => ({ path: "/api/crm/relatorios?agrupar=campanha" }),
  },
  "GET /api/crm/capturas": { access: "org", attack: (t) => [{ path: `/api/crm/capturas?organization=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/crm/capturas" }) },
  "POST /api/crm/capturas": {
    access: "org",
    attack: (t) => [
      { method: "POST", path: "/api/crm/capturas", body: { name: "Intrusa", pipeline: String(t.pipeline._id) } },
      { method: "POST", path: "/api/crm/capturas", body: { name: "Intrusa", owner: String(t.owner._id) }, expect: 400 },
    ],
    own: (t) => ({ method: "POST", path: "/api/crm/capturas", body: { name: "Captura Alfa Dois", pipeline: String(t.pipeline._id) }, expect: 201 }),
  },
  "PUT /api/crm/capturas/[id]": {
    access: "org",
    attack: (t) => [{ method: "PUT", path: "/api/crm/capturas/x", params: { id: String(t.capture._id) }, body: { name: "Invadida", active: false } }],
    own: (t) => ({ method: "PUT", path: "/api/crm/capturas/x", params: { id: String(t.capture._id) }, body: { name: "Captura Alfa renomeada" } }),
  },
  "DELETE /api/crm/capturas/[id]": {
    access: "owner",
    attack: (t) => [{ method: "DELETE", path: "/api/crm/capturas/x", params: { id: String(t.captureSpare._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/crm/capturas/x", params: { id: String(t.captureSpare._id) } }),
  },
  "GET /api/crm/lead-ads": { access: "org", attack: (t) => [{ path: `/api/crm/lead-ads?organization=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/crm/lead-ads" }) },
  "POST /api/crm/lead-ads/paginas": {
    access: "owner",
    attack: (t) => [{ method: "POST", path: "/api/crm/lead-ads/paginas", body: { pageId: t.page.pageId, token: "token-colado-pela-alfa-000000", pipeline: String(t.pipeline._id) } }],
    own: (t) => ({ method: "POST", path: "/api/crm/lead-ads/paginas", body: { pageId: "990000000099", token: "token-colado-pela-alfa-000000", pipeline: String(t.pipeline._id) }, expect: 201 }),
  },
  "PUT /api/crm/lead-ads/paginas/[id]": {
    access: "owner",
    attack: (t, me) => [
      { method: "PUT", path: "/api/crm/lead-ads/paginas/x", params: { id: String(t.page._id) }, body: { active: false } },
      { method: "PUT", path: "/api/crm/lead-ads/paginas/x", params: { id: String(me.page._id) }, body: { owner: String(t.owner._id) }, expect: 400 },
    ],
    own: (t) => ({ method: "PUT", path: "/api/crm/lead-ads/paginas/x", params: { id: String(t.page._id) }, body: { tags: ["meta"] } }),
  },
  "DELETE /api/crm/lead-ads/paginas/[id]": {
    access: "owner",
    attack: (t) => [{ method: "DELETE", path: "/api/crm/lead-ads/paginas/x", params: { id: String(t.pageSpare._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/crm/lead-ads/paginas/x", params: { id: String(t.pageSpare._id) } }),
  },
  // ---- Rastreamento (script do site, vendas, API de Conversões)
  "GET /api/t/[key]/script": { access: "public", why: "script do site: chave sorteada de 64 bits; devolve só a configuração do próprio script (domínios de checkout, aviso), nunca dado do cliente (rastreio.test.ts)" },
  "POST /api/t/[key]/evento": { access: "public", why: "evento do script: chave sorteada, domínio conferido, consentimento, teto por IP; responde só o código (rastreio.test.ts)" },
  "POST /api/vendas/[provider]/[key]": { access: "public", why: "webhook da Hotmart/Kiwify: chave sorteada de 128 bits + hottok/assinatura HMAC conferidos; responde só ok/duplicado (rastreio.test.ts)" },
  "GET /api/rastreio": { access: "org", attack: (t) => [{ path: `/api/rastreio?organization=${t.org._id}&project=${t.project._id}`, expect: 200 }], own: () => ({ path: "/api/rastreio" }) },
  "POST /api/rastreio/sites": {
    access: "owner",
    attack: (t) => [{ method: "POST", path: "/api/rastreio/sites", body: { project: String(t.projectFree._id) } }],
    own: (t) => ({ method: "POST", path: "/api/rastreio/sites", body: { project: String(t.projectFree._id), domains: "alfa.loja.test" }, expect: 201 }),
  },
  "PUT /api/rastreio/sites/[id]": {
    access: "owner",
    attack: (t) => [{ method: "PUT", path: "/api/rastreio/sites/x", params: { id: String(t.site._id) }, body: { pixelId: "9999999999999", capiEnabled: false } }],
    own: (t) => ({ method: "PUT", path: "/api/rastreio/sites/x", params: { id: String(t.site._id) }, body: { domains: "alfa.loja.test, www.alfa.loja.test" } }),
  },
  "DELETE /api/rastreio/sites/[id]": {
    access: "owner",
    attack: (t) => [{ method: "DELETE", path: "/api/rastreio/sites/x", params: { id: String(t.siteSpare._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/rastreio/sites/x", params: { id: String(t.siteSpare._id) } }),
  },
  "POST /api/rastreio/sites/[id]/testar": {
    access: "owner",
    // chaves desligadas neste mundo: o teste da própria ALFA volta "não enviado"
    attack: (t) => [{ method: "POST", path: "/api/rastreio/sites/x/testar", params: { id: String(t.site._id) } }],
    own: (t) => ({ method: "POST", path: "/api/rastreio/sites/x/testar", params: { id: String(t.site._id) } }),
  },
  "POST /api/rastreio/integracoes": {
    access: "owner",
    attack: (t) => [
      { method: "POST", path: "/api/rastreio/integracoes", body: { provider: "hotmart", secret: "hottok-intruso-123", project: String(t.project._id) } },
      { method: "POST", path: "/api/rastreio/integracoes", body: { provider: "hotmart", secret: "hottok-intruso-123", pipeline: String(t.pipeline._id) } },
    ],
    own: (t) => ({ method: "POST", path: "/api/rastreio/integracoes", body: { provider: "kiwify", secret: "token-kiwify-alfa", project: String(t.project._id) }, expect: 201 }),
  },
  "PUT /api/rastreio/integracoes/[id]": {
    access: "owner",
    attack: (t, me) => [
      { method: "PUT", path: "/api/rastreio/integracoes/x", params: { id: String(t.integ._id) }, body: { active: false } },
      { method: "PUT", path: "/api/rastreio/integracoes/x", params: { id: String(me.integ._id) }, body: { project: String(t.project._id) } },
    ],
    own: (t) => ({ method: "PUT", path: "/api/rastreio/integracoes/x", params: { id: String(t.integ._id) }, body: { stageOnApproved: "ganhou" } }),
  },
  "DELETE /api/rastreio/integracoes/[id]": {
    access: "owner",
    attack: (t) => [{ method: "DELETE", path: "/api/rastreio/integracoes/x", params: { id: String(t.integSpare._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/rastreio/integracoes/x", params: { id: String(t.integSpare._id) } }),
  },
  "GET /api/rastreio/vendas": { access: "org", attack: (t) => [{ path: `/api/rastreio/vendas?organization=${t.org._id}&tipo=approved`, expect: 200 }], own: () => ({ path: "/api/rastreio/vendas" }) },
  "GET /api/rastreio/capi": { access: "org", attack: (t) => [{ path: `/api/rastreio/capi?organization=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/rastreio/capi" }) },
  "POST /api/crm/lead-ads/processar": {
    access: "org+cron",
    // chaves desligadas neste mundo: não roda nem para a própria organização
    attack: (t) => [{ method: "POST", path: "/api/crm/lead-ads/processar", body: { organization: String(t.org._id) }, expect: 200 }],
    own: () => ({ method: "POST", path: "/api/crm/lead-ads/processar" }),
  },
  // ---- ofertas (Concorrentes › Ofertas) e lista da casa
  "GET /api/ofertas": { access: "org", attack: (t) => [{ path: `/api/ofertas?organization=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/ofertas" }) },
  "POST /api/ofertas": {
    access: "org",
    // grava na MINHA organização mesmo mandando a da outra no corpo
    attack: (t) => [{ method: "POST", path: "/api/ofertas", body: { name: "Oferta de ataque", counting: "manual", organization: String(t.org._id) }, expect: 201 }],
    own: () => ({ method: "POST", path: "/api/ofertas", body: { name: "Oferta Alfa Dois", counting: "manual", tags: { structure: "quiz", countries: ["BR"] } }, expect: 201 }),
  },
  "PUT /api/ofertas/[id]": {
    access: "org",
    attack: (t) => [{ method: "PUT", path: "/api/ofertas/x", params: { id: String(t.offer._id) }, body: { name: "Invadida", counting: "manual" } }],
    own: (t) => ({ method: "PUT", path: "/api/ofertas/x", params: { id: String(t.offer._id) }, body: { notes: "ok", tags: { niche: "nutra" } } }),
  },
  "DELETE /api/ofertas/[id]": {
    access: "org",
    attack: (t) => [{ method: "DELETE", path: "/api/ofertas/x", params: { id: String(t.offer._id) } }],
    own: (t) => ({ method: "DELETE", path: "/api/ofertas/x", params: { id: String(t.offerSpare._id) } }),
  },
  "GET /api/ofertas/[id]/historico": {
    access: "org",
    attack: (t) => [{ path: "/api/ofertas/x/historico", params: { id: String(t.offer._id) } }],
    own: (t) => ({ path: "/api/ofertas/x/historico", params: { id: String(t.offer._id) } }),
  },
  "POST /api/ofertas/[id]/contagem": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/ofertas/x/contagem", params: { id: String(t.offer._id) }, body: { count: 1, note: "contagem de ataque" } }],
    own: (t) => ({ method: "POST", path: "/api/ofertas/x/contagem", params: { id: String(t.offer._id) }, body: { count: 42, note: "Biblioteca, Brasil" }, expect: 201 }),
  },
  "POST /api/ofertas/atualizar": {
    access: "org+cron",
    attack: (t) => [
      { method: "POST", path: "/api/ofertas/atualizar", body: { offer: String(t.offer._id) } },
      // sem oferta: conta só as da MINHA organização
      { method: "POST", path: "/api/ofertas/atualizar", body: { organization: String(t.org._id) }, expect: 200 },
    ],
    own: (t) => ({ method: "POST", path: "/api/ofertas/atualizar", body: { offer: String(t.offer._id) } }),
  },
  "POST /api/ofertas/favoritos": {
    access: "org",
    attack: (t) => [{ method: "POST", path: "/api/ofertas/favoritos", body: { kind: "org", id: String(t.offer._id), on: true } }],
    own: (t) => ({ method: "POST", path: "/api/ofertas/favoritos", body: { kind: "org", id: String(t.offer._id), on: true } }),
  },
  "GET /api/ofertas/casa": { access: "org", attack: (t) => [{ path: `/api/ofertas/casa?organization=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/ofertas/casa" }) },
  "GET /api/ofertas/casa/[id]/historico": {
    access: "org",
    // id de oferta da organização da BETA não abre pela rota da casa
    attack: (t) => [{ path: "/api/ofertas/casa/x/historico", params: { id: String(t.offer._id) } }],
    own: (_t, w) => ({ path: "/api/ofertas/casa/x/historico", params: { id: String(w.house._id) } }),
  },
  "GET /api/ofertas/casa/relatorio": { access: "org", attack: (t) => [{ path: `/api/ofertas/casa/relatorio?organization=${t.org._id}`, expect: 200 }], own: () => ({ path: "/api/ofertas/casa/relatorio" }) },
  "GET /api/admin/ofertas": { access: "admin", why: "lista da casa (dado da plataforma, não de cliente)" },
  "POST /api/admin/ofertas": { access: "admin", why: "lista da casa" },
  "PUT /api/admin/ofertas/[id]": { access: "admin", why: "lista da casa" },
  "DELETE /api/admin/ofertas/[id]": { access: "admin", why: "arquiva da lista da casa" },
  "POST /api/admin/ofertas/[id]/contagem": { access: "admin", why: "contagem manual da lista da casa" },
  "POST /api/admin/ofertas/atualizar": { access: "admin", why: "conta a lista da casa pela API" },
  "GET /api/admin/ofertas/config": { access: "admin", why: "regras do selo, países e token da casa" },
  "PUT /api/admin/ofertas/config": { access: "admin", why: "regras do selo, países e token da casa" },
};

const MEDIA_ID = "1800000000000100";
const ADS_TOKEN = "EAAtoken-de-teste-do-simulador-0000000000001";

function post(project: string) {
  return { project, title: "Post de ataque", format: "reel", platforms: ["instagram"], scheduledDate: "2026-10-20", scheduledTime: "09:00" };
}

function inventory(): { key: string; file: string }[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/^route\.(ts|tsx|js|mjs)$/.test(name)) files.push(full);
    }
  };
  walk(API_DIR);
  return files.sort().map((file) => ({
    file,
    key: "/api/" + path.relative(API_DIR, path.dirname(file)).split(path.sep).join("/"),
  }));
}

let mongo: MongoMemoryServer;
let mediaDir = "";
const w = {} as World;
const handlers: Record<string, any> = {};
let attacks = 0;

async function seedSide(tag: "alfa" | "beta", label: string): Promise<Side> {
  const org = await makeOrg(`Cliente ${label}`, `cliente-${tag}`, { brand: { displayName: `Marca ${label}` }, offersEnabled: true });
  const owner = await makeUser(org._id, "owner", `dona@${tag}.test`);
  const member = await makeUser(org._id, "member", `membro@${tag}.test`);
  const o = org._id;
  const project = await Project.create({ organization: o, name: `Projeto ${label}`, slug: "projeto" });
  const p = await Post.create({
    organization: o, project: project._id, title: `Post secreto da ${label}`, caption: `legenda-${tag}`, format: "reel",
    platforms: ["instagram"], scheduledDate: new Date(NOW), scheduledTime: "09:00", externalIds: { instagram: "1800000000000100" },
  });
  const account = await connectInstagram(o, { project: String(project._id), token: `IGAA-conta-${tag}oficial-000001` }, { now: NOW - 3_600_000 });
  await syncAccount(o, String(account._id), { now: NOW - 1_800_000 });
  const other = await SocialAccount.create({ organization: o, project: project._id, platform: "tiktok", accountName: `@${tag}-tiktok`, credentials: {} });
  const cred = await ApiCredential.create({ organization: o, service: tag === "beta" ? "freepik" : "elevenlabs", label: `Chave ${label}`, credentials: {} });
  if (tag === "beta") await ApiCredential.create({ organization: o, service: "openai", label: "OpenAI Beta", credentials: {} });
  const { invite, token } = await createInvite({ kind: "member", organization: o, email: `convidado@${tag}.test`, createdBy: owner });
  // uma mídia solta (enviada, ainda fora de post), com o arquivo no disco
  const file = `${(tag === "beta" ? "b" : "a").repeat(48)}.jpg`;
  mkdirSync(path.join(mediaDir, String(o)), { recursive: true });
  const assetPath = path.join(mediaDir, String(o), file);
  writeFileSync(assetPath, `arquivo-da-${tag}`);
  const asset = await MediaAsset.create({ organization: o, kind: "image", file, mime: "image/jpeg", bytes: 15, width: 1080, height: 1080, originalName: `foto-${tag}.jpg` });
  // comentários de terceiros guardados (a mídia 100 tem comentários no simulador)
  await syncComments(o, String(account._id), { mediaIgId: MEDIA_ID }, { now: NOW - 1_700_000 });
  const comment = await InstagramComment.findOne({ organization: o, account: account._id, parentIgId: null, own: false });
  expect(comment, "o simulador devolveu comentários").toBeTruthy();
  // Estúdio: kit de marca, um trabalho na fila, um logo guardado e uma linha de uso
  const logoFile = `${(tag === "beta" ? "d" : "c").repeat(48)}.png`;
  writeFileSync(path.join(mediaDir, String(o), logoFile), `logo-da-${tag}`);
  const logo = await MediaAsset.create({ organization: o, kind: "image", keep: true, file: logoFile, mime: "image/png", bytes: 12, originalName: `logo-${tag}.png` });
  const kit = await BrandKit.create({ organization: o, project: project._id, name: `Kit secreto ${label}`, handle: `@kit${tag}`, logo: logo._id });
  const job = await StudioJob.create({ organization: o, project: project._id, kind: "reel_montado", title: `Reel secreto ${label}`, input: { script: REEL_CURTO }, runAfter: new Date(NOW + 86_400_000) });
  // Reel com cenas: uma cena na biblioteca (arquivo + capa no disco), um padrão e um vídeo feito
  const sceneFile = `${(tag === "beta" ? "e" : "f").repeat(48)}.mp4`;
  writeFileSync(path.join(mediaDir, String(o), sceneFile), `cena-da-${tag}`);
  writeFileSync(path.join(mediaDir, String(o), `${(tag === "beta" ? "e" : "f").repeat(47)}1.jpg`), `capa-da-${tag}`);
  const scene = await MediaAsset.create({ organization: o, kind: "cena", keep: true, file: sceneFile, mime: "video/mp4", bytes: 10, width: 1080, height: 1920, durationMs: 8000, scene: { category: "mar/praia", tags: [], title: `Cena secreta ${label}`, license: "proprio", licenseLabel: "Gravação própria", sourceUrl: "", author: `Autor ${label}`, provider: "proprio", poster: `${(tag === "beta" ? "e" : "f").repeat(47)}1.jpg`, active: true } });
  const template = await VideoTemplate.create({ organization: o, project: project._id, name: `Padrão secreto ${label}`, settings: SEED_TEMPLATES[0].settings, isDefault: true });
  const cenasJob = await StudioJob.create({ organization: o, project: project._id, kind: "reel_cenas", status: "done", title: `Vídeo com cenas ${label}`, input: { script: REEL_CURTO, settings: { ...SEED_TEMPLATES[1].settings, ctaText: `chamada-${tag}` }, templateName: `Padrão secreto ${label}` } });
  const usage = await AiUsage.create({ organization: o, at: new Date(NOW), purpose: "texto", service: "anthropic", what: `uso-${tag}`, costUsd: 0.01, costBrl: 0.05, fxRate: 5 });
  // Tráfego e concorrentes: conta de anúncio sincronizada, uma sobrando (para o controle do DELETE),
  // concorrentes lidos (Instagram pelo Business Discovery simulado, YouTube simulado) e um produto
  const adAccount = await connectAdAccount(o, { project: String(project._id), adAccountId: tag === "beta" ? "act_2222222222" : "act_1111111111", token: `${ADS_TOKEN}${tag}` });
  await syncAdAccount(o, adAccount._id, { now: NOW - 1_600_000 });
  const adSpare = await connectAdAccount(o, { project: String(project._id), adAccountId: tag === "beta" ? "act_2222222229" : "act_1111111119", token: ADS_TOKEN });
  const competitor = await Competitor.create({ organization: o, project: project._id, name: `Concorrente secreto ${label}`, instagram: "concorrente_a", youtube: "@concorrentea", facebookPage: `Pagina ${label}` });
  await refreshCompetitor(o, competitor, NOW - 1_500_000);
  const competitorSpare = await Competitor.create({ organization: o, project: project._id, name: `Concorrente sobrando ${label}`, instagram: "mentora_b" });
  const product = await CompetitorProduct.create({ organization: o, project: project._id, competitor: competitor._id, name: `Produto secreto ${label}`, price: 97 });
  // Automações: uma automação com link, uma sobrando, contatos, execução, evento, trava e contador
  const autoBase = { organization: o, project: project._id, account: account._id, trigger: { kind: "comment", scope: "all", keywords: ["quero"] }, publicReplies: [`resposta-publica-${tag}`], dm: { text: `dm-secreta-${tag}`, buttons: [{ kind: "url", title: "Baixar", url: `https://${tag}.exemplo.com.br/ebook` }] } };
  const automation = await Automation.create({ ...autoBase, name: `Automação secreta ${label}` });
  const link = await TrackedLink.create({ organization: o, automation: automation._id, code: tag === "beta" ? "codigoBeta1" : "codigoAlfa1", url: `https://${tag}.exemplo.com.br/ebook` });
  const automationSpare = await Automation.create({ ...autoBase, name: `Automação sobrando ${label}` });
  const contact = await Contact.create({ organization: o, project: project._id, account: account._id, igsid: tag === "beta" ? "8800000000000002" : "8800000000000001", username: `contato_${tag}`, email: `lead@${tag}.test`, tags: [`cliente-${tag}`], consent: { given: true, at: new Date(NOW), text: "ok", version: "v-1" } });
  const contactSpare = await Contact.create({ organization: o, project: project._id, account: account._id, igsid: tag === "beta" ? "8800000000000004" : "8800000000000003", username: `contato_sobrando_${tag}` });
  const run = await AutomationRun.create({ organization: o, account: account._id, automation: automation._id, automationName: automation.name, contact: contact._id, eventKey: `c:${tag}`, trigger: "comment", username: `contato_${tag}`, text: `comentario-${tag}`, status: "done", steps: [{ kind: "private_reply", status: "sent" }] });
  await AutomationEvent.create({ organization: o, account: account._id, key: `c:evento-${tag}`, field: "comments", data: { text: `evento-${tag}` }, eventAt: new Date(NOW), status: "done" });
  await AutomationLedger.create({ organization: o, account: account._id, key: `dm-post:1:${tag}` });
  await AutomationCounter.create({ organization: o, account: account._id, kind: "dm", hour: "2026101800", count: 1, expiresAt: new Date(NOW + 86_400_000) });
  // CRM: funil padrão + um sobrando, o contato vira lead, outro lead (para o DELETE), tarefas, captura,
  // Página da Meta (token criptografado), aviso recebido, linha do tempo, consentimento e teto de captura
  const pipeline = await Pipeline.create({ organization: o, name: `Funil secreto ${label}`, stages: DEFAULT_STAGES, isDefault: true });
  const pipelineSpare = await Pipeline.create({ organization: o, name: `Funil sobrando ${label}`, stages: DEFAULT_STAGES });
  await Contact.updateOne({ _id: contact._id, organization: o }, { $set: { lead: true, leadAt: new Date(NOW), pipeline: pipeline._id, stage: "proposta", value: 4321, name: `Lead secreto ${label}`, firstTouch: { at: new Date(NOW), kind: "meta_lead_ads", campaignId: `camp${tag}`, label: `Campanha ${label}` }, origin: { kind: "meta_lead_ads", leadgenId: `lg${tag}` } } });
  const leadSpare = await Contact.create({ organization: o, name: `Lead sobrando ${label}`, lead: true, leadAt: new Date(NOW), pipeline: pipeline._id, stage: "novo", phone: tag === "beta" ? "+5511988887777" : "+5511988886666", phoneKey: tag === "beta" ? "11988887777" : "11988886666", consent: { given: true, channel: "manual" } });
  const leadDup = await Contact.create({ organization: o, name: `Lead repetido ${label}`, lead: true, leadAt: new Date(NOW), pipeline: pipeline._id, stage: "novo" });
  const task = await LeadTask.create({ organization: o, contact: contact._id, title: `Tarefa secreta ${label}`, dueAt: new Date(NOW + 86_400_000), assignee: owner._id });
  const taskSpare = await LeadTask.create({ organization: o, contact: contact._id, title: `Tarefa sobrando ${label}` });
  await LeadEvent.create({ organization: o, contact: contact._id, kind: "note", text: `nota-secreta-${tag}` });
  await ConsentLog.create({ organization: o, contact: contact._id, action: "given", channel: "manual", basis: `base-secreta-${tag}` });
  const capture = await LeadCapture.create({ organization: o, name: `Captura secreta ${label}`, code: tag === "beta" ? "capturaBeta01" : "capturaAlfa01", pipeline: pipeline._id, stage: "novo", tags: [`captura-${tag}`] });
  const captureSpare = await LeadCapture.create({ organization: o, name: `Captura sobrando ${label}`, code: tag === "beta" ? "capturaBeta02" : "capturaAlfa02" });
  await CaptureRate.create({ organization: o, key: `org:${tag}`, count: 1, expiresAt: new Date(NOW + 3_600_000) });
  const page = await LeadAdsPage.create({ organization: o, pageId: tag === "beta" ? "990000000002" : "990000000001", name: `Página secreta ${label}`, credentials: { accessToken: encrypt(`token-da-pagina-${tag}-0000000000`) } });
  const pageSpare = await LeadAdsPage.create({ organization: o, pageId: tag === "beta" ? "990000000004" : "990000000003", name: `Página sobrando ${label}`, credentials: { accessToken: encrypt("x".repeat(30)) } });
  await LeadAdsEvent.create({ organization: o, page: page._id, pageId: page.pageId, leadgenId: `lg${tag}`, status: "done", contact: contact._id, note: `aviso-${tag}` });
  // Rastreamento: script do site (com token da CAPI), outro sobrando, projeto sem script, integrações de venda,
  // visitante, evento, venda e registro de envio à Meta
  const projectSpare = await Project.create({ organization: o, name: `Projeto sobrando ${label}`, slug: "projeto-sobrando" });
  const projectFree = await Project.create({ organization: o, name: `Projeto livre ${label}`, slug: "projeto-livre" });
  const site = await TrackingSite.create({ organization: o, project: project._id, name: `Site secreto ${label}`, key: tag === "beta" ? "chavesitebeta01" : "chavesitealfa01", domains: [`${tag}.loja.test`], pixelId: tag === "beta" ? "2222222222222" : "1111111111111", capi: { accessToken: encrypt(`token-capi-${tag}-000000000000000000`), testEventCode: "TEST1234" } });
  const siteSpare = await TrackingSite.create({ organization: o, project: projectSpare._id, key: tag === "beta" ? "chavesitebeta02" : "chavesitealfa02" });
  const integ = await SalesIntegration.create({ organization: o, provider: "hotmart", name: `Integração secreta ${label}`, key: (tag === "beta" ? "b" : "a").repeat(32), secret: encrypt(`hottok-${tag}-123456`) });
  const integSpare = await SalesIntegration.create({ organization: o, provider: "kiwify", key: (tag === "beta" ? "d" : "c").repeat(32), secret: encrypt("token-kiwify-0000") });
  await TrackVisitor.create({ organization: o, site: site._id, vid: (tag === "beta" ? "b" : "a").repeat(24), contact: contact._id, fbc: `fb.1.1.fbc${tag}`, expiresAt: new Date(NOW + 86_400_000) });
  await TrackEvent.create({ organization: o, site: site._id, vid: (tag === "beta" ? "b" : "a").repeat(24), type: "page_view", path: `https://${tag}.loja.test/pagina-secreta` });
  await Sale.create({ organization: o, integration: integ._id, provider: "hotmart", externalId: `HP${tag}`, kind: "approved", value: 1234, product: `Produto vendido ${label}`, contact: contact._id });
  await CapiLog.create({ organization: o, site: site._id, eventName: "Purchase", eventId: `purchase.${tag}`, status: "skipped", reason: `motivo-${tag}` });
  // Ofertas: uma contada pela API (página simulada 77...), uma manual, contagem manual com nota e um favorito
  const offer = await OfferPage.create({ organization: o, name: `Oferta secreta ${label}`, pageId: tag === "beta" ? "7720002" : "7710001", counting: "api", tags: { structure: "vsl", countries: ["PT"] } });
  const offerSpare = await OfferPage.create({ organization: o, name: `Oferta sobrando ${label}`, counting: "manual" });
  await OfferDaily.create({ organization: o, page: offer._id, date: "2026-10-01", count: 12, source: "manual", byUser: owner._id, byName: owner.name, note: `nota-${tag}` });
  const favorite = await OfferFavorite.create({ organization: o, user: owner._id, kind: "org", ref: offer._id });
  return { site, siteSpare, projectFree, integ, integSpare, org, owner, member, project, post: p, account, other, cred, invite, inviteToken: token, asset, assetPath, comment, kit, job, logo, usage, adAccount, adSpare, competitor, competitorSpare, product, scene, template, cenasJob, automation, automationSpare, contact, contactSpare, run, link, pipeline, pipelineSpare, leadSpare, task, taskSpare, capture, captureSpare, page, pageSpare, leadDup, offer, offerSpare, favorite };
}

/** Foto do banco inteiro de um cliente (todas as coleções com `organization` + usuários, convites e a própria organização). */
async function snapshot(side: Side): Promise<string> {
  const out: Record<string, unknown> = {};
  for (const name of TENANT_MODELS)
    out[name] = await mongoose.models[name].collection.find({ organization: side.org._id }).sort({ _id: 1 }).toArray();
  for (const name of ["User", "Invite"])
    out[name] = await mongoose.models[name].collection.find({ organization: side.org._id }).sort({ _id: 1 }).toArray();
  out.Organization = await mongoose.models.Organization.collection.find({ _id: side.org._id }).toArray();
  return JSON.stringify(out);
}

/** Tudo que identifica a BETA: ids, nomes, e-mails. Nada disso pode aparecer para a ALFA. */
function markers(side: Side): string[] {
  return [
    String(side.org._id), String(side.owner._id), String(side.member._id), String(side.project._id), String(side.post._id),
    String(side.account._id), String(side.other._id), String(side.cred._id), String(side.invite._id),
    side.org.name, side.org.slug, "Marca Beta", side.project.name, side.post.title, "legenda-beta", "betaoficial", "@beta-tiktok",
    side.owner.email, side.member.email, "convidado@beta.test", "Chave Beta", "OpenAI Beta", side.inviteToken,
    String(side.asset._id), side.asset.file, "foto-beta.jpg", String(side.comment._id),
    String(side.kit._id), "Kit secreto Beta", "@kitbeta", String(side.job._id), "Reel secreto Beta", String(side.logo._id), side.logo.file, "logo-beta.png", String(side.usage._id), "uso-beta",
    String(side.adAccount._id), String(side.adSpare._id), `${ADS_TOKEN}beta`, String(side.competitor._id), "Concorrente secreto Beta", String(side.competitorSpare._id), "Concorrente sobrando Beta", "Pagina Beta", String(side.product._id), "Produto secreto Beta",
    String(side.scene._id), side.scene.file, "Cena secreta Beta", "Autor Beta", String(side.template._id), "Padrão secreto Beta", String(side.cenasJob._id), "Vídeo com cenas Beta", "chamada-beta",
    String(side.automation._id), "Automação secreta Beta", String(side.automationSpare._id), "Automação sobrando Beta", "resposta-publica-beta", "dm-secreta-beta", "beta.exemplo.com.br", "codigoBeta1",
    String(side.contact._id), String(side.contactSpare._id), "contato_beta", "lead@beta.test", "cliente-beta", "8800000000000002", String(side.run._id), "comentario-beta", "evento-beta",
    String(side.pipeline._id), "Funil secreto Beta", String(side.pipelineSpare._id), "Funil sobrando Beta", "Lead secreto Beta", String(side.leadSpare._id), "Lead sobrando Beta", String(side.leadDup._id), "Lead repetido Beta", "campbeta", "Campanha Beta",
    String(side.task._id), "Tarefa secreta Beta", String(side.taskSpare._id), "Tarefa sobrando Beta", "nota-secreta-beta", "base-secreta-beta", String(side.capture._id), "Captura secreta Beta", "capturaBeta01", "captura-beta",
    String(side.captureSpare._id), "Captura sobrando Beta", String(side.page._id), "Página secreta Beta", "990000000002", String(side.pageSpare._id), "Página sobrando Beta", "token-da-pagina-beta", "aviso-beta", "lgbeta",
    String(side.site._id), "Site secreto Beta", "chavesitebeta01", String(side.siteSpare._id), "chavesitebeta02", "2222222222222", "token-capi-beta", String(side.projectFree._id), "Projeto livre Beta", "Projeto sobrando Beta",
    String(side.integ._id), "Integração secreta Beta", "b".repeat(32), String(side.integSpare._id), "d".repeat(32), "hottok-beta", "fbcbeta", "pagina-secreta", "HPbeta", "Produto vendido Beta", "purchase.beta", "motivo-beta",
    String(side.offer._id), "Oferta secreta Beta", String(side.offerSpare._id), "Oferta sobrando Beta", "nota-beta", String(side.favorite._id),
  ];
}

beforeAll(async () => {
  setTestEnv();
  mediaDir = mkdtempSync(path.join(os.tmpdir(), "contenthub-isolamento-"));
  process.env.MEDIA_DIR = mediaDir;
  Object.assign(process.env, { IG_OAUTH_ENABLED: "true", IG_APP_ID: "1234567890", IG_APP_SECRET: "segredo-do-app-de-teste", APP_URL: "https://contenthub.exemplo.test" });
  setFetchOverride(mockFetch(() => NOW));
  // Estúdio: provedores de IA simulados e fila parada (nenhum trabalho roda neste teste)
  const ai = studioFake();
  // a mesma resposta serve ao pedido de temas e ao roteiro do Reel com cenas (com um ajuste do padrão)
  ai.text["*"] = JSON.stringify({ temas: ["Como cuidar da escova de dentes", "O que observar antes de clarear", "Por que a gengiva sangra ao escovar"], ...REEL_CURTO, ajustes: { musica: false } });
  setStudioFetch(ai.fetch);
  setMetaFetch(metaMockFetch(() => NOW));
  setYoutubeFetch(youtubeMockFetch(() => NOW));
  setAutoKick(false);
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("isolamento"));
  w.adminOrg = await makeOrg("Vínculo Digital", "vinculo-digital");
  w.admin = await makeUser(w.adminOrg._id, "platform_admin", "admin@plataforma.test");
  // chave da casa do YouTube (simulado): os concorrentes das duas organizações leem o canal
  await HouseCredential.create({ service: "youtube", credentials: { apiKey: encrypt("AIzaChaveDeTesteDoSimulador000000000000") }, purposes: [] });
  w.house = await HouseOffer.create({ name: "Oferta da casa", pageId: "7730003", counting: "api", addedBy: "admin@plataforma.test" });
  w.A = await seedSide("alfa", "Alfa");
  w.B = await seedSide("beta", "Beta");

  for (const { key, file } of inventory()) {
    const mod = await import(file);
    for (const m of METHODS) if (mod[m]) handlers[`${m} ${key}`] = mod[m];
    // nada além de métodos HTTP e configuração de rota pode ser exportado
    for (const name of Object.keys(mod)) expect([...METHODS, "maxDuration", "dynamic", "runtime"], `${file} exporta ${name}`).toContain(name);
  }

  // `state` legítimo da dona da BETA (para o ataque ao callback do OAuth)
  const start = await call(handlers["GET /api/instagram/oauth/start"], { path: `/api/instagram/oauth/start?project=${w.B.project._id}`, cookie: cookieFor(w.B.owner) });
  oauthState.state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  oauthState.cookie = setCookieValue(start.headers, OAUTH_COOKIE);
});

afterAll(async () => {
  setFetchOverride(null);
  setStudioFetch(null);
  setMetaFetch(null);
  setYoutubeFetch(null);
  await mongoose.disconnect();
  await mongo.stop();
  delete process.env.MEDIA_DIR;
  rmSync(mediaDir, { recursive: true, force: true });
});

const send = (key: string, r: Req, cookie: string) => {
  const { cookie2, ...headers } = (r.headers || {}) as Record<string, string>;
  return call(handlers[key], { ...r, headers, cookie: [cookie, cookie2].filter(Boolean).join("; ") });
};

describe("inventário de rotas", () => {
  it("toda rota de /api passou por route() e tem prova de isolamento na tabela", () => {
    const found = Object.keys(handlers).sort();
    expect(found.length).toBeGreaterThan(40);
    const semProva = found.filter((k) => !CASES[k]);
    expect(semProva, "rota nova sem prova de isolamento: acrescente em CASES").toEqual([]);
    expect(Object.keys(CASES).filter((k) => !handlers[k]), "linha de CASES sem rota").toEqual([]);
    for (const key of found) {
      expect(handlers[key].access, `${key} não foi criada com route()`).toBe(CASES[key].access);
      const c = CASES[key];
      // rota que lê dado de cliente TEM de ter ataque e controle
      if (c.access !== "public" && c.access !== "admin" && c.access !== "cron") expect(Boolean(c.attack && c.own), `${key} sem ataque/controle`).toBe(true);
      else expect(c.why, `${key} sem justificativa`).toBeTruthy();
    }
  });

  it("o modelo recusa consulta sem organização (e com operador no lugar dela)", async () => {
    for (const name of TENANT_MODELS) {
      const M = mongoose.models[name];
      await expect(M.find({}), name).rejects.toBeInstanceOf(TenantScopeError);
      await expect(M.findById(w.B.project._id), name).rejects.toBeInstanceOf(TenantScopeError);
      await expect(M.countDocuments({ organization: { $ne: w.A.org._id } }), name).rejects.toBeInstanceOf(TenantScopeError);
      await expect(M.updateMany({}, { $set: { active: false } }), name).rejects.toBeInstanceOf(TenantScopeError);
      await expect(M.deleteMany({}), name).rejects.toBeInstanceOf(TenantScopeError);
      await expect(M.aggregate([{ $group: { _id: null, n: { $sum: 1 } } }]), name).rejects.toBeInstanceOf(TenantScopeError);
    }
    expect(TENANT_MODELS.sort()).toEqual(["AdAccount", "AdInsightDaily", "AdObject", "AiUsage", "ApiCredential", "Automation", "AutomationCounter", "AutomationEvent", "AutomationLedger", "AutomationRun", "BrandKit", "CapiLog", "CaptureRate", "Competitor", "CompetitorDaily", "CompetitorProduct", "ConsentLog", "Contact", "InstagramAccountDaily", "InstagramComment", "InstagramMedia", "InstagramMediaDaily", "LeadAdsEvent", "LeadAdsPage", "LeadCapture", "LeadEvent", "LeadTask", "MediaAsset", "OfferDaily", "OfferFavorite", "OfferPage", "Pipeline", "Post", "Project", "Sale", "SalesIntegration", "SocialAccount", "StudioJob", "TrackEvent", "TrackVisitor", "TrackedLink", "TrackingSite", "VideoTemplate"]);
    // mover um registro para outra organização por update: recusado
    await expect(Post.updateOne({ _id: w.A.post._id, organization: w.A.org._id }, { $set: { organization: w.B.org._id } })).rejects.toBeInstanceOf(TenantScopeError);
    // criar sem organização: recusado pela validação
    await expect(Project.create({ name: "Sem dono", slug: "sem-dono" })).rejects.toThrow(/organization/);
  });
});

describe("cada rota, uma por uma", () => {
  it("sem login: 401 em tudo que não é público", async () => {
    for (const [key, c] of Object.entries(CASES)) {
      if (c.access === "public") continue;
      const [method, p] = key.split(" ");
      const r = await call(handlers[key], { method, path: p, body: method === "GET" || method === "DELETE" ? undefined : {}, params: { id: String(w.B.post._id) } });
      expect(r.status, key).toBe(401);
    }
  });

  it("cookie de usuário desativado, de versão antiga ou de cliente desativado: 401", async () => {
    const ghostOrg = await makeOrg("Cliente Desligado", "cliente-desligado", { active: false });
    const ghost = await makeUser(ghostOrg._id, "owner", "dona@desligado.test");
    const off = await makeUser(w.A.org._id, "member", "desativado@alfa.test", { active: false });
    const old = cookieFor({ _id: w.A.member._id, sessionVersion: 0 });
    for (const cookie of [cookieFor(ghost), cookieFor(off), old]) {
      expect((await call(handlers["GET /api/projects"], { path: "/api/projects", cookie })).status).toBe(401);
    }
    await mongoose.models.User.deleteMany({ _id: { $in: [ghost._id, off._id] } });
  });

  it("papel errado: cliente não entra em rota de admin (404) e membro não entra em rota de dono (403)", async () => {
    for (const [key, c] of Object.entries(CASES)) {
      const [method, p] = key.split(" ");
      const base = { method, path: p, body: method === "GET" || method === "DELETE" ? undefined : { organization: String(w.B.org._id) }, params: { id: String(w.B.org._id) } };
      if (c.access === "admin") {
        for (const u of [w.A.owner, w.A.member]) {
          const r = await call(handlers[key], { ...base, cookie: cookieFor(u) });
          expect(r.status, `${key} como ${u.role}`).toBe(404);
          for (const m of markers(w.B)) expect(r.text.includes(m), `${key} vazou ${m}`).toBe(false);
        }
        // nem com "entrar como" forjado dentro de um cookie de dono
        const forged = await call(handlers[key], { ...base, cookie: cookieFor(w.A.owner, String(w.B.org._id)) });
        expect(forged.status, `${key} com imp forjado`).toBe(404);
      }
      if (c.access === "owner") {
        const r = await call(handlers[key], { ...base, cookie: cookieFor(w.A.member) });
        expect(r.status, `${key} como membro`).toBe(403);
      }
    }
  });

  it("ATAQUE: dono da ALFA com os ids da BETA não lê, não lista, não edita e não apaga nada", async () => {
    const before = await snapshot(w.B);
    const secret = markers(w.B);
    const cookie = cookieFor(w.A.owner);
    // inclui cookie de dono com "entrar como BETA" (só vale para administrador)
    const cookies = [cookie, cookieFor(w.A.owner, String(w.B.org._id)), cookieFor(w.A.member, String(w.B.org._id))];
    for (const [key, c] of Object.entries(CASES)) {
      if (!c.attack) continue;
      for (const r of c.attack(w.B, w.A, w)) {
        for (const ck of c.access === "owner" ? cookies.slice(0, 2) : cookies) {
          const res = await send(key, r, ck);
          const expected = r.expect === undefined ? [404] : [r.expect].flat();
          expect(expected, `${key} ${JSON.stringify(r.body ?? r.path)} -> ${res.status} ${res.text.slice(0, 120)}`).toContain(res.status);
          const where = res.text + " " + (res.headers.get("location") || "");
          for (const m of secret) expect(where.includes(m), `${key} devolveu dado da BETA (${m})`).toBe(false);
          attacks++;
        }
      }
      expect(await snapshot(w.B), `${key} alterou o banco da BETA`).toBe(before);
      expect(existsSync(w.B.assetPath), `${key} apagou arquivo da BETA`).toBe(true);
    }
    expect(attacks).toBeGreaterThan(100);
    console.log(`[isolamento] ${Object.keys(handlers).length} rotas x método no inventário · ${Object.values(CASES).filter((c) => c.attack).length} com dado de cliente · ${attacks} pedidos de ataque, todos barrados`);
  });

  it("CONTROLE: os mesmos pedidos com os ids da própria ALFA funcionam", async () => {
    const beforeB = await snapshot(w.B);
    const cookie = cookieFor(w.A.owner);
    // exclusões por último, para os outros controles ainda acharem o registro
    const ordered = Object.entries(CASES).sort(([a], [b]) => Number(a.startsWith("DELETE")) - Number(b.startsWith("DELETE")));
    for (const [key, c] of ordered) {
      if (!c.own) continue;
      const r = c.own(w.A, w);
      const res = await send(key, r, cookie);
      const expected = r.expect === undefined ? [200] : [r.expect].flat();
      expect(expected, `${key} -> ${res.status} ${res.text.slice(0, 160)}`).toContain(res.status);
    }
    expect(await snapshot(w.B)).toBe(beforeB);
    // o arquivo da ALFA saiu (controle do DELETE), o da BETA continua lá
    expect([existsSync(w.A.assetPath), existsSync(w.B.assetPath)]).toEqual([false, true]);
    // e as listas da ALFA mostram os dados da ALFA
    const projects = await call(handlers["GET /api/projects"], { path: "/api/projects", cookie });
    expect(projects.data.map((p: any) => p.name)).toEqual(expect.arrayContaining(["Projeto Alfa", "Projeto Alfa Dois", "Projeto Alfa Três"]));
    const dash = await call(handlers["GET /api/instagram/dashboard"], { path: `/api/instagram/dashboard?project=${w.A.project._id}`, cookie });
    expect(dash.data.account.username).toBe("alfaoficial");
    expect(dash.data.dashboard.posts.length).toBeGreaterThan(5);
  });

  it("os dois clientes guardam a mesma mídia do Instagram sem misturar", async () => {
    for (const side of [w.A, w.B]) {
      const mine = await InstagramMedia.find({ organization: side.org._id }).lean<any[]>();
      expect(mine).toHaveLength(26);
      expect(new Set(mine.map((m) => String(m.account)))).toEqual(new Set([String(side.account._id)]));
    }
    expect(await InstagramMedia.collection.countDocuments({ igId: "1800000000000100" })).toBe(2);
  });
});

describe("rotina (cron) e administrador", () => {
  const bearer = () => ({ authorization: `Bearer ${process.env.CRON_TOKEN}` });

  it("cron percorre TODAS as organizações ativas; token errado não entra", async () => {
    const bad = await call(handlers["POST /api/instagram/sync"], { method: "POST", path: "/api/instagram/sync", headers: { authorization: "Bearer errado" } });
    expect(bad.status).toBe(401);
    const sync = await call(handlers["POST /api/instagram/sync"], { method: "POST", path: "/api/instagram/sync", headers: bearer() });
    expect(sync.status).toBe(200);
    expect(sync.data.organizations).toBe(3);
    expect(new Set(sync.data.results.map((r: any) => r.organizationId))).toEqual(new Set([String(w.A.org._id), String(w.B.org._id)]));
    const report = await call(handlers["GET /api/instagram/report"], { path: "/api/instagram/report", headers: bearer() });
    expect(new Set(report.data.reports.map((r: any) => r.organizationName))).toEqual(new Set(["Cliente Alfa", "Cliente Beta"]));
    // o agendador de publicação: só o token de rotina; nenhum login entra (nem o do administrador)
    for (const u of [w.A.owner, w.A.member, w.admin])
      expect((await call(handlers["POST /api/instagram/publish-due"], { method: "POST", path: "/api/instagram/publish-due", cookie: cookieFor(u) })).status).toBe(401);
    const due = await call(handlers["POST /api/instagram/publish-due"], { method: "POST", path: "/api/instagram/publish-due", headers: bearer() });
    expect(due.data).toMatchObject({ enabled: false, published: 0, organizations: [] }); // IG_PUBLISH_ENABLED desligada: nada sai
    // o token de rotina não abre nenhuma outra rota
    const other = await call(handlers["GET /api/projects"], { path: "/api/projects", headers: bearer() });
    expect(other.status).toBe(401);
    // cliente desativado fica fora da rotina
    await mongoose.models.Organization.updateOne({ _id: w.B.org._id }, { $set: { active: false } });
    const sync2 = await call(handlers["POST /api/instagram/sync"], { method: "POST", path: "/api/instagram/sync", headers: bearer() });
    expect(sync2.data.results.every((r: any) => r.organizationId === String(w.A.org._id))).toBe(true);
    await mongoose.models.Organization.updateOne({ _id: w.B.org._id }, { $set: { active: true } });
  });

  it("administrador sem 'entrar como' vê só a própria organização nas rotas de dados", async () => {
    const r = await call(handlers["GET /api/projects"], { path: "/api/projects", cookie: cookieFor(w.admin) });
    expect(r.status).toBe(200);
    expect(r.data).toEqual([]);
    const post = await call(handlers["GET /api/posts/[id]"], { path: "/api/posts/x", params: { id: String(w.B.post._id) }, cookie: cookieFor(w.admin) });
    expect(post.status).toBe(404);
  });
});
