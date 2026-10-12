import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { testInstagram, publicAccount } from "@/lib/instagram/accounts";
import { handle } from "@/lib/instagram/data";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await connectDB();
    const { id } = await params;
    return NextResponse.json(publicAccount(await testInstagram(id)));
  });
}
