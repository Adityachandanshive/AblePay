import { beforeEach, describe, expect, it } from "vitest";

import { guardrails, findDuplicate, LIMITS } from "@/lib/safety";
import { store } from "@/lib/store";
import { Intent } from "@/lib/types";

const baseIntent: Intent = {
  intent: "P2P_TRANSFER",
  recipients: [{ name: "Sam" }],
  amount: 20,
  currency: "USD",
  note: "pizza",
  includeSelf: false
};

describe("safety guardrails", () => {
  beforeEach(() => {
    store.clearMemoryForTests();
  });

  it("rejects amount over per-transaction limit", () => {
    const message = guardrails({ ...baseIntent, amount: 120 }, 1);
    expect(message).toContain("$100");
  });

  it("rejects unknown recipients", () => {
    const message = guardrails(baseIntent, 0);
    expect(message).toContain("couldn't match");
  });

  it("rejects daily limit breaches", () => {
    store.addHistory({
      id: "old",
      type: "P2P_TRANSFER",
      recipients: [],
      amountCentsTotal: LIMITS.dailyCents,
      perRecipientCents: {},
      note: null,
      currency: "USD",
      status: "completed",
      createdAt: Date.now()
    });

    const message = guardrails(baseIntent, 1);
    expect(message).toContain("daily $250");
  });

  it("finds duplicates in 30 second window", () => {
    store.upsertPending({
      id: "pending-1",
      type: "P2P_TRANSFER",
      recipients: [],
      amountCentsTotal: 2000,
      perRecipientCents: {},
      note: "pizza",
      currency: "USD",
      createdAt: Date.now(),
      expiresAt: Date.now() + 120_000,
      status: "pending",
      signature: "P2P_TRANSFER:2000:sam:pizza"
    });

    const dup = findDuplicate("P2P_TRANSFER:2000:sam:pizza");
    expect(dup?.id).toBe("pending-1");
  });
});
