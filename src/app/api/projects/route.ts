import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Project from "@/models/Project";

export async function GET() {
  await connectDB();
  const projects = await Project.find({ active: true }).sort({ name: 1 });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  await connectDB();
  const body = await req.json();
  body.slug = body.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const project = await Project.create(body);
  return NextResponse.json(project, { status: 201 });
}
