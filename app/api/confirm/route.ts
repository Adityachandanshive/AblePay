import { NextResponse } from "next/server";
import { z } from "zod";

import { requestMoney, sendPayout } from "@/lib/paypal";
import { isPendingExpired } from "@/lib/safety";
import { fromCents } from "@/lib/split";
import { store } from "@/lib/store";

const schema = z.object({
  pendingId: z.string().min(1),
  decision: z.enum(["confirm", "cancel"])
});

export async function POST(request: Request) {
  try {
    const { pendingId, decision } = schema.parse(await request.json());
    store.expirePending();

    const pending = store.getPending(pendingId);
    if (!pending) {
      return NextResponse.json({ error: "Pending transaction not found." }, { status: 404 });
    }

    if (pending.status !== "pending") {
      return NextResponse.json({ error: `This transaction is already ${pending.status}.` }, { status: 400 });
    }

    if (isPendingExpired(pending)) {
      store.upsertPending({ ...pending, status: "expired" });
      return NextResponse.json({ error: "This request expired. Please try again." }, { status: 410 });
    }

    if (decision === "cancel") {
      store.upsertPending({ ...pending, status: "cancelled" });
      store.addHistory({
        id: `cancel-${pending.id}`,
        pendingId: pending.id,
        type: pending.type,
        recipients: pending.recipients,
        amountCentsTotal: pending.amountCentsTotal,
        perRecipientCents: pending.perRecipientCents,
        note: pending.note,
        currency: pending.currency,
        status: "cancelled",
        createdAt: Date.now()
      });
      return NextResponse.json({
        result: { id: pending.id, status: "cancelled" },
        speech: "Okay, I cancelled that request."
      });
    }

    let payment;
    if (pending.type === "P2P_TRANSFER") {
      const recipient = pending.recipients[0];
      payment = await sendPayout({
        pendingId: pending.id,
        recipient,
        amountCents: pending.perRecipientCents[recipient.id],
        note: pending.note
      });
    } else {
      payment = await requestMoney({
        pendingId: pending.id,
        requests: pending.recipients.map((recipient) => ({
          recipient,
          amountCents: pending.perRecipientCents[recipient.id]
        })),
        note: pending.note
      });
    }

    store.upsertPending({ ...pending, status: "confirmed" });
    store.addHistory({
      id: payment.id,
      pendingId: pending.id,
      type: pending.type,
      recipients: pending.recipients,
      amountCentsTotal: pending.amountCentsTotal,
      perRecipientCents: pending.perRecipientCents,
      note: pending.note,
      currency: pending.currency,
      status: "completed",
      externalId: payment.id,
      externalStatus: payment.status,
      createdAt: Date.now()
    });

    const speech = `Done. ${pending.type === "P2P_TRANSFER" ? "Payment" : "Request"} sent for $${fromCents(
      pending.amountCentsTotal
    )}.`;

    return NextResponse.json({
      result: {
        id: payment.id,
        status: payment.status,
        type: pending.type,
        total: fromCents(pending.amountCentsTotal),
        recipients: pending.recipients,
        note: pending.note,
        raw: payment.raw
      },
      speech
    });
  } catch (error) {
    console.error("/api/confirm failed", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid confirmation payload" }, { status: 400 });
    }

    return NextResponse.json(
      { result: null, speech: error instanceof Error ? error.message : "Confirmation failed." },
      { status: 500 }
    );
  }
}
