import { synthesize } from "@/lib/gnani/timbre";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string };
    const text = body.text?.trim();

    if (!text) {
      return new Response("Missing text", { status: 400 });
    }

    const audio = await synthesize(text);
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("/api/tts failed", error);
    return new Response("Failed to synthesize speech", { status: 500 });
  }
}
