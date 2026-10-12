import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import ApiCredential from "@/models/ApiCredential";
import { publicCredentials, sealCredentials } from "@/lib/crypto";
import { handle } from "@/lib/instagram/data";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Chaves de API: gravadas criptografadas, nunca devolvidas para a tela.
function toPublic(doc: any) {
  const d = typeof doc.toObject === "function" ? doc.toObject({ flattenMaps: true }) : doc;
  const { values, filled } = publicCredentials(d.credentials);
  return { _id: String(d._id), service: d.service, label: d.label, active: d.active, credentials: values, credentialsFilled: filled };
}

export async function GET() {
  return handle(async () => {
    await connectDB();
    const credentials = await ApiCredential.find().sort({ service: 1 }).lean();
    return NextResponse.json(credentials.map(toPublic));
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    await connectDB();
    const body = await request.json();
    const { service, label, credentials, active } = body;

    if (!service || !label) {
      return NextResponse.json({ error: "Escolha o serviço antes de salvar." }, { status: 400 });
    }
    const sealed = sealCredentials(credentials || {});

    const existing = await ApiCredential.findOne({ service });
    if (existing) {
      existing.label = label;
      // Campo em branco = manter o que já está gravado.
      for (const [k, v] of Object.entries(sealed)) existing.credentials.set(k, v);
      if (active !== undefined) existing.active = active;
      await existing.save();
      return NextResponse.json(toPublic(existing));
    }

    const doc = await ApiCredential.create({
      service,
      label,
      credentials: sealed,
      active: active !== undefined ? active : true,
    });
    return NextResponse.json(toPublic(doc), { status: 201 });
  });
}

export async function DELETE(request: NextRequest) {
  return handle(async () => {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const service = searchParams.get("service");
    if (!service) {
      return NextResponse.json({ error: "Serviço não informado." }, { status: 400 });
    }
    await ApiCredential.deleteOne({ service });
    return NextResponse.json({ ok: true });
  });
}
