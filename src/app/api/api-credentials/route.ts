import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import ApiCredential from "@/models/ApiCredential";

export async function GET() {
  await connectDB();
  const credentials = await ApiCredential.find().sort({ service: 1 }).lean();
  return NextResponse.json(credentials);
}

export async function POST(request: NextRequest) {
  await connectDB();
  const body = await request.json();
  const { service, label, credentials, active } = body;

  if (!service || !label) {
    return NextResponse.json(
      { error: "service e label obrigatorios" },
      { status: 400 }
    );
  }

  const existing = await ApiCredential.findOne({ service });
  if (existing) {
    existing.label = label;
    existing.credentials = credentials || {};
    if (active !== undefined) existing.active = active;
    await existing.save();
    return NextResponse.json(existing);
  }

  const doc = await ApiCredential.create({
    service,
    label,
    credentials: credentials || {},
    active: active !== undefined ? active : true,
  });
  return NextResponse.json(doc, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  await connectDB();
  const { searchParams } = new URL(request.url);
  const service = searchParams.get("service");
  if (!service) {
    return NextResponse.json({ error: "service obrigatorio" }, { status: 400 });
  }
  await ApiCredential.deleteOne({ service });
  return NextResponse.json({ ok: true });
}
