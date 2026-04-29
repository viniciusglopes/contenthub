import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Post from "@/models/Post";

export async function POST(req: NextRequest) {
  await connectDB();
  const { posts } = await req.json();
  if (!Array.isArray(posts) || posts.length === 0) {
    return NextResponse.json({ error: "posts array required" }, { status: 400 });
  }
  const created = await Post.insertMany(posts);
  return NextResponse.json({ count: created.length, posts: created }, { status: 201 });
}
