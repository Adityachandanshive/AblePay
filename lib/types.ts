export const INTENT_VALUES = [
  "P2P_TRANSFER",
  "SPLIT_BILL",
  "REQUEST_MONEY",
  "CHECK_HISTORY",
  "CONFIRM",
  "CANCEL",
  "UNKNOWN"
] as const;

export type IntentType = (typeof INTENT_VALUES)[number];

export type Intent = {
  intent: IntentType;
  recipients: { name: string }[];
  amount: number | null;
  currency: "USD";
  note: string | null;
  includeSelf: boolean;
};

export type Contact = {
  id: string;
  name: string;
  email: string;
};

export type PendingType = "P2P_TRANSFER" | "SPLIT_BILL" | "REQUEST_MONEY";

export type PendingTransaction = {
  id: string;
  type: PendingType;
  recipients: Contact[];
  amountCentsTotal: number;
  perRecipientCents: Record<string, number>;
  note: string | null;
  currency: "USD";
  createdAt: number;
  expiresAt: number;
  status: "pending" | "confirmed" | "cancelled" | "expired" | "failed";
  signature: string;
};

export type HistoryTransaction = {
  id: string;
  pendingId?: string;
  type: PendingType;
  recipients: Contact[];
  amountCentsTotal: number;
  perRecipientCents: Record<string, number>;
  note: string | null;
  currency: "USD";
  status: "completed" | "cancelled" | "failed";
  externalId?: string;
  externalStatus?: string;
  createdAt: number;
};

export type PaymentResult = {
  id: string;
  status: string;
  raw: unknown;
};
