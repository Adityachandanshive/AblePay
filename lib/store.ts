import { Contact, HistoryTransaction, PendingTransaction } from "@/lib/types";

type StoreState = {
  pending: Map<string, PendingTransaction>;
  history: HistoryTransaction[];
};

const globalStore = globalThis as typeof globalThis & { __ABLEPAY_STORE__?: StoreState };
const state =
  globalStore.__ABLEPAY_STORE__ ||
  (globalStore.__ABLEPAY_STORE__ = {
    pending: new Map<string, PendingTransaction>(),
    history: []
  });

const seededContacts: Contact[] = [
  {
    id: "sam",
    name: "Sam",
    email: process.env.CONTACT_SAM_EMAIL || "sb-sam-personal@example.com"
  },
  {
    id: "sarah",
    name: "Sarah",
    email: process.env.CONTACT_SARAH_EMAIL || "sb-sarah-personal@example.com"
  },
  {
    id: "mom",
    name: "Mom",
    email: process.env.CONTACT_MOM_EMAIL || "sb-mom-personal@example.com"
  }
];

export const store = {
  getContacts(): Contact[] {
    return seededContacts;
  },

  resolveRecipients(names: string[]): Contact[] {
    const uniqueNames = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];

    return uniqueNames
      .map((name) =>
        seededContacts.find(
          (contact) =>
            contact.name.toLowerCase() === name ||
            contact.id.toLowerCase() === name ||
            contact.name.toLowerCase().includes(name)
        )
      )
      .filter((contact): contact is Contact => Boolean(contact));
  },

  upsertPending(tx: PendingTransaction): void {
    state.pending.set(tx.id, tx);
  },

  getPending(id: string): PendingTransaction | undefined {
    return state.pending.get(id);
  },

  deletePending(id: string): void {
    state.pending.delete(id);
  },

  expirePending(now = Date.now()): void {
    for (const [id, tx] of state.pending.entries()) {
      if (tx.expiresAt <= now) {
        state.pending.set(id, { ...tx, status: "expired" });
      }
    }
  },

  pendingSnapshot(): PendingTransaction[] {
    return Array.from(state.pending.values());
  },

  addHistory(entry: HistoryTransaction): void {
    state.history.unshift(entry);
  },

  getHistory(): HistoryTransaction[] {
    return state.history;
  },

  clearMemoryForTests(): void {
    state.pending.clear();
    state.history.length = 0;
  }
};
