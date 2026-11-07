// Adjust request/response shape per Gnani docs
const MOCK_MODE = process.env.MOCK_MODE === "true";

export async function transcribe(audioBlob: Blob): Promise<string> {
  if (MOCK_MODE) {
    return "Send twenty dollars to Sam for pizza";
  }

  const endpoint = process.env.GNANI_STT_URL;
  const apiKey = process.env.GNANI_API_KEY;

  if (!endpoint || !apiKey) {
    return "";
  }

  const formData = new FormData();
  formData.append("audio", audioBlob, "voice.webm");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey
      },
      body: formData
    });

    const payload = await response.json();
    return payload.text || payload.transcript || payload.result || "";
  } catch (error) {
    console.error("Gnani Prisma STT failed, using mock fallback", error);
    return "Send twenty dollars to Sam for pizza";
  }
}
