import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { connectInstagram, publicAccount } from "@/lib/instagram/accounts";
import { handle } from "@/lib/instagram/data";

// Cola o token -> valida em /me -> guarda criptografado.
export async function POST(req: NextRequest) {
  return handle(async () => {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const account = await connectInstagram({
      project: String(body.project || ""),
      token: String(body.token || ""),
      accountId: body.accountId ? String(body.accountId) : undefined,
    });
    return NextResponse.json(publicAccount(account), { status: 201 });
  });
}
