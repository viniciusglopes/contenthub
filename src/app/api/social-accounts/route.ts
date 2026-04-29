import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SocialAccount from "@/models/SocialAccount";

export async function GET(req: NextRequest) {
  await connectDB();
  const projectId = req.nextUrl.searchParams.get("project");
  const filter: Record<string, unknown> = {};
  if (projectId) filter.project = projectId;
  const accounts = await SocialAccount.find(filter).populate("project", "name slug color icon").sort({ platform: 1 });
  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  await connectDB();
  const body = await req.json();
  const account = await SocialAccount.create(body);
  const populated = await account.populate("project", "name slug color icon");
  return NextResponse.json(populated, { status: 201 });
}
