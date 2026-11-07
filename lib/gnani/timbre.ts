// Adjust request/response shape per Gnani docs
const MOCK_MODE = process.env.MOCK_MODE === "true";

function mockWav(text: string): ArrayBuffer {
  const durationSeconds = Math.max(1, Math.min(3, Math.ceil(text.length / 25)));
  const sampleRate = 8000;
  const numSamples = durationSeconds * sampleRate;
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  return buffer;
}

export async function synthesize(text: string): Promise<ArrayBuffer> {
  if (MOCK_MODE) {
    return mockWav(text);
  }

  const endpoint = process.env.GNANI_TTS_URL;
  const apiKey = process.env.GNANI_API_KEY;

  if (!endpoint || !apiKey) {
    return mockWav(text);
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey
      },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      throw new Error(`TTS request failed with ${response.status}`);
    }

    return await response.arrayBuffer();
  } catch (error) {
    console.error("Gnani Timbre TTS failed, using mock fallback", error);
    return mockWav(text);
  }
}
