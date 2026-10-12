import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { handle } from "@/lib/instagram/data";
import { syncAll } from "@/lib/instagram/sync";

export const maxDuration = 300;

// Sincroniza métricas. Sem corpo: todas as contas ativas (uso do cron diário,
// com "Authorization: Bearer <CRON_TOKEN>"). Com { project } ou { account }: só aquelas.
export async function POST(req: NextRequest) {
  return handle(async () => {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const results = await syncAll({
      project: body.project ? String(body.project) : undefined,
      account: body.account ? String(body.account) : undefined,
    });
    const failed = results.filter((r) => !r.ok);
    return NextResponse.json({
      ok: failed.length === 0,
      accounts: results.length,
      failed: failed.length,
      results,
    });
  });
}
