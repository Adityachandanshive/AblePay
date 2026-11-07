// Adjust request/response shape per Gnani docs
import { z } from "zod";

import { INTENT_VALUES, Intent } from "@/lib/types";

const MOCK_MODE = process.env.MOCK_MODE === "true";

const evonSchema = z.object({
  intent: z.enum(INTENT_VALUES),
  recipients: z.array(z.object({ name: z.string().min(1) })),
  amount: z.number().nullable(),
  currency: z.literal("USD"),
  note: z.string().nullable(),
  includeSelf: z.boolean()
});

const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100
};

const SYSTEM_PROMPT = `Return ONLY valid JSON with this exact schema:
{ "intent": "P2P_TRANSFER" | "SPLIT_BILL" | "REQUEST_MONEY" | "CHECK_HISTORY" | "CONFIRM" | "CANCEL" | "UNKNOWN",
  "recipients": [{ "name": string }],
  "amount": number | null, "currency": "USD", "note": string | null,
  "includeSelf": boolean }
No markdown fences, no prose.`;

function extractAmount(text: string): number | null {
  const numericMatch = text.match(/(\d+(?:\.\d{1,2})?)/);
  if (numericMatch) {
    return Number(numericMatch[1]);
  }

  const tokens = text.toLowerCase().split(/\s+/);
  let current = 0;

  for (const token of tokens) {
    const value = numberWords[token];
    if (!value) continue;
    if (value === 100) {
      current = Math.max(current, 1) * 100;
    } else {
      current += value;
    }
  }

  return current > 0 ? current : null;
}

function fallbackIntent(text: string): Intent {
  const lower = text.toLowerCase();
  const recipients = (lower.match(/\b(to|with|between|from)\s+([a-z]+)/g) || []).map((segment) => {
    const name = segment.split(/\s+/).pop() || "";
    return { name: name.charAt(0).toUpperCase() + name.slice(1) };
  });

  const amount = extractAmount(lower);

  let intent: Intent["intent"] = "UNKNOWN";
  if (lower.includes("split")) intent = "SPLIT_BILL";
  else if (lower.includes("request")) intent = "REQUEST_MONEY";
  else if (lower.includes("history")) intent = "CHECK_HISTORY";
  else if (["yes", "confirm", "send it"].some((keyword) => lower.includes(keyword))) intent = "CONFIRM";
  else if (["no", "cancel", "stop"].some((keyword) => lower.includes(keyword))) intent = "CANCEL";
  else if (lower.includes("send") || lower.includes("pay")) intent = "P2P_TRANSFER";

  return {
    intent,
    recipients,
    amount,
    currency: "USD",
    note: lower.includes("for") ? lower.split("for").slice(1).join("for").trim() || null : null,
    includeSelf: lower.includes(" me ") || lower.includes(" myself") || lower.includes("between me")
  };
}

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function parseIntent(text: string, context?: string): Promise<Intent> {
  if (!text.trim()) {
    return fallbackIntent(text);
  }

  if (MOCK_MODE) {
    return fallbackIntent(text);
  }

  const endpoint = process.env.GNANI_LLM_URL;
  const apiKey = process.env.GNANI_API_KEY;

  if (!endpoint || !apiKey) {
    return fallbackIntent(text);
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey
      },
      body: JSON.stringify({
        system: SYSTEM_PROMPT,
        input: text,
        context: context || ""
      })
    });

    const payload = await response.json();
    const raw = payload.output || payload.text || payload.response || payload.result || "";
    const parsed = JSON.parse(stripFences(raw));
    return evonSchema.parse(parsed);
  } catch (error) {
    console.error("Gnani Evon intent parsing failed, using fallback", error);
    const fallback = fallbackIntent(text);
    try {
      return evonSchema.parse(fallback);
    } catch {
      return {
        intent: "UNKNOWN",
        recipients: [],
        amount: null,
        currency: "USD",
        note: null,
        includeSelf: false
      };
    }
  }
}
