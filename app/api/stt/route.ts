import { NextResponse } from "next/server";

import { transcribe } from "@/lib/gnani/prisma";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "Missing audio blob" }, { status: 400 });
    }

    const text = await transcribe(audio);
    return NextResponse.json({ text });
  } catch (error) {
    console.error("/api/stt failed", error);
    return NextResponse.json({ error: "Failed to transcribe audio" }, { status: 500 });
  }
}
