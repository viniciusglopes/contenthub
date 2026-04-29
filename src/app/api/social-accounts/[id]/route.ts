import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SocialAccount from "@/models/SocialAccount";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();
  const { id } = await params;
  const account = await SocialAccount.findById(id).populate("project", "name slug color icon");
  if (!account) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(account);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();
  const { id } = await params;
  const body = await req.json();
  const account = await SocialAccount.findByIdAndUpdate(id, body, { new: true }).populate(
    "project",
    "name slug color icon"
  );
  if (!account) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(account);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();
  const { id } = await params;
  await SocialAccount.findByIdAndDelete(id);
  return NextResponse.json({ deleted: true });
}
