import { store } from "@/lib/store";
import { Intent, PendingTransaction } from "@/lib/types";

export const LIMITS = {
  perTransactionCents: 10000,
  dailyCents: 25000,
  duplicateWindowMs: 30_000,
  pendingExpiryMs: 120_000
} as const;

export function guardrails(intent: Intent, resolvedRecipientCount: number, now = Date.now()): string | null {
  if (intent.currency !== "USD") {
    return "AblePay currently supports USD only.";
  }

  if (intent.amount === null || intent.amount <= 0) {
    return "Please provide an amount greater than zero.";
  }

  const amountCents = Math.round(intent.amount * 100);
  if (amountCents > LIMITS.perTransactionCents) {
    return "This exceeds the $100 per-transaction sandbox limit.";
  }

  if (resolvedRecipientCount === 0 && ["P2P_TRANSFER", "SPLIT_BILL", "REQUEST_MONEY"].includes(intent.intent)) {
    return "I couldn't match the recipient to your contacts. Who should I pay?";
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const spentTodayCents = store
    .getHistory()
    .filter((h) => h.status === "completed" && h.createdAt >= today.getTime())
    .reduce((sum, tx) => sum + tx.amountCentsTotal, 0);

  if (spentTodayCents + amountCents > LIMITS.dailyCents) {
    return "This would exceed your daily $250 sandbox limit.";
  }

  return null;
}

export function findDuplicate(signature: string, now = Date.now()): PendingTransaction | undefined {
  return store
    .pendingSnapshot()
    .find((tx) => tx.signature === signature && now - tx.createdAt <= LIMITS.duplicateWindowMs && tx.status === "pending");
}

export function isPendingExpired(tx: PendingTransaction, now = Date.now()): boolean {
  return tx.expiresAt <= now;
}
