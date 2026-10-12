import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SocialAccount from "@/models/SocialAccount";
import { sealCredentials } from "@/lib/crypto";
import { publicAccount } from "@/lib/instagram/accounts";
import { handle } from "@/lib/instagram/data";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    await connectDB();
    const { id } = await params;
    const account = await SocialAccount.findById(id).populate("project", "name slug color icon");
    if (!account) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
    return NextResponse.json(publicAccount(account));
  });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    await connectDB();
    const { id } = await params;
    const body = await req.json();
    const set: Record<string, unknown> = {};
    for (const k of ["project", "platform", "accountName", "accountId", "active"]) {
      if (body[k] !== undefined) set[k] = body[k];
    }
    // Campo de credencial em branco = manter o que já está gravado.
    for (const [k, v] of Object.entries(sealCredentials(body.credentials || {}))) {
      set[`credentials.${k}`] = v;
    }
    const account = await SocialAccount.findByIdAndUpdate(id, { $set: set }, { returnDocument: "after" }).populate(
      "project",
      "name slug color icon"
    );
    if (!account) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
    return NextResponse.json(publicAccount(account));
  });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    await connectDB();
    const { id } = await params;
    await SocialAccount.findByIdAndDelete(id);
    return NextResponse.json({ deleted: true });
  });
}
