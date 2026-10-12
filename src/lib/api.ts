import { NextRequest, NextResponse } from "next/server";
import type { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { checkCronToken } from "@/lib/auth";
import { FriendlyError, notFound, toFriendly } from "@/lib/errors";
import { type Session, getSession } from "@/lib/session";
import { toObjectId } from "@/lib/tenant";
import Organization from "@/models/Organization";

/* eslint-disable @typescript-eslint/no-explicit-any */

// TODA rota de /api nasce de `route(acesso, handler)`. É aqui que a organização é decidida,
// sempre no servidor. O teste de inventário (tests/isolation.test.ts) falha se aparecer
// uma rota que não passou por aqui ou que não esteja na tabela de provas de isolamento.
//
// public    sem login (login, convite, marca da tela de entrada)
// org       qualquer usuário logado; `ctx.org` é a organização efetiva
// owner     dono da organização (ou administrador)
// admin     só administrador da plataforma
// org+cron  login OU "Authorization: Bearer <CRON_TOKEN>"; no cron, `ctx.orgs` = todas as ativas
// cron      SÓ "Authorization: Bearer <CRON_TOKEN>" (o agendador de publicação): login não entra
export type Access = "public" | "org" | "owner" | "admin" | "org+cron" | "cron";

export interface Ctx {
  req: NextRequest;
  params: Record<string, string>;
  /** null só em rota pública ou em chamada de rotina (cron) */
  session: Session | null;
  /** organização efetiva da sessão (não existe no cron: use `orgs`) */
  org: Types.ObjectId;
  /** organizações a percorrer: a da sessão, ou todas as ativas no cron */
  orgs: { _id: Types.ObjectId; name: string }[];
  cron: boolean;
  body: () => Promise<Record<string, any>>;
  /** id de rota/corpo -> ObjectId; malformado vira 404 (igual a "não existe") */
  id: (value: unknown, what?: string) => Types.ObjectId;
}

type Handler = (ctx: Ctx) => Promise<NextResponse>;
type RouteFn = ((req: NextRequest, extra?: { params?: Promise<Record<string, string>> }) => Promise<NextResponse>) & {
  access: Access;
};

const UNAUTH = () => NextResponse.json({ error: "Sessão expirada ou não autenticada. Entre de novo." }, { status: 401 });

export function route(access: Access, handler: Handler): RouteFn {
  const fn = async (req: NextRequest, extra?: { params?: Promise<Record<string, string>> }) => {
    try {
      const params = (await extra?.params) || {};
      await connectDB();
      let session: Session | null = null;
      let cron = false;
      let orgs: Ctx["orgs"] = [];

      if (access === "cron") {
        if (!checkCronToken(req.headers.get("authorization"))) return UNAUTH();
        cron = true;
      } else if (access !== "public") {
        session = await getSession(req);
        if (!session && access === "org+cron" && checkCronToken(req.headers.get("authorization"))) {
          cron = true;
          orgs = (await Organization.find({ active: true }).select("name").sort({ createdAt: 1 }).lean()) as any;
        } else if (!session) return UNAUTH();
        if (session) {
          if (access === "admin" && !session.isAdmin) throw new FriendlyError("Não encontrado.", 404);
          if (access === "owner" && !session.canManage)
            throw new FriendlyError("Só o dono da conta pode fazer isso.", 403);
          orgs = [{ _id: session.orgId, name: session.organization.name }];
        }
      }

      const ctx: Ctx = {
        req,
        params,
        session,
        org: session?.orgId as Types.ObjectId,
        orgs,
        cron,
        body: async () => {
          const b = await req.json().catch(() => null);
          return b && typeof b === "object" && !Array.isArray(b) ? b : {};
        },
        id: (value, what) => {
          const oid = toObjectId(value);
          if (!oid) throw notFound(what);
          return oid;
        },
      };
      return await handler(ctx);
    } catch (e) {
      const f = toFriendly(e);
      if (f.status >= 500) console.error("[api]", e instanceof Error ? `${e.name}: ${e.message}` : "erro");
      return NextResponse.json({ error: f.message, field: f.field }, { status: f.status });
    }
  };
  (fn as RouteFn).access = access;
  return fn as RouteFn;
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
