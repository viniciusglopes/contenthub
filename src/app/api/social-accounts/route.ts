import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SocialAccount from "@/models/SocialAccount";
import { sealCredentials } from "@/lib/crypto";
import { publicAccount } from "@/lib/instagram/accounts";
import { handle } from "@/lib/instagram/data";

// As credenciais são gravadas criptografadas e nunca voltam para a tela.
export async function GET(req: NextRequest) {
  return handle(async () => {
    await connectDB();
    const projectId = req.nextUrl.searchParams.get("project");
    const filter: Record<string, unknown> = {};
    if (projectId) filter.project = projectId;
    const accounts = await SocialAccount.find(filter).populate("project", "name slug color icon").sort({ platform: 1 });
    return NextResponse.json(accounts.map(publicAccount));
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    await connectDB();
    const body = await req.json();
    const account = await SocialAccount.create({
      project: body.project,
      platform: body.platform,
      accountName: body.accountName,
      accountId: body.accountId || "",
      active: body.active !== false,
      credentials: sealCredentials(body.credentials || {}),
    });
    const populated = await account.populate("project", "name slug color icon");
    return NextResponse.json(publicAccount(populated), { status: 201 });
  });
}
