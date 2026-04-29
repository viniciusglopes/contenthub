import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Post from "@/models/Post";

export async function GET(req: NextRequest) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  const status = searchParams.get("status");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const platform = searchParams.get("platform");

  const filter: Record<string, unknown> = {};
  if (project) filter.project = project;
  if (status) filter.status = status;
  if (platform) filter.platforms = platform;
  if (startDate || endDate) {
    filter.scheduledDate = {};
    if (startDate) (filter.scheduledDate as Record<string, unknown>).$gte = new Date(startDate);
    if (endDate) (filter.scheduledDate as Record<string, unknown>).$lte = new Date(endDate);
  }

  const posts = await Post.find(filter)
    .populate("project", "name slug color icon")
    .sort({ scheduledDate: 1, scheduledTime: 1 });

  return NextResponse.json(posts);
}

export async function POST(req: NextRequest) {
  await connectDB();
  const body = await req.json();
  const post = await Post.create(body);
  const populated = await post.populate("project", "name slug color icon");
  return NextResponse.json(populated, { status: 201 });
}
