import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { parseIntent } from "@/lib/gnani/evon";
import { guardrails, LIMITS, findDuplicate } from "@/lib/safety";
import { splitCentsDeterministic, toCents, fromCents } from "@/lib/split";
import { store } from "@/lib/store";
import { PendingTransaction } from "@/lib/types";

const requestSchema = z.object({
  text: z.string().min(1)
});

function sentenceForPending(type: PendingTransaction["type"], amountCents: number, recipientNames: string, note: string | null) {
  const amount = fromCents(amountCents);
  const noteText = note ? ` for ${note}` : "";
  if (type === "SPLIT_BILL") {
    return `I've prepared split requests totaling $${amount} to ${recipientNames}${noteText}. Should I send them?`;
  }
  if (type === "REQUEST_MONEY") {
    return `I've prepared a request for $${amount} from ${recipientNames}${noteText}. Should I send it?`;
  }
  return `I've prepared a PayPal transfer of $${amount} to ${recipientNames}${noteText}. Should I send it?`;
}

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    store.expirePending();

    const intent = await parseIntent(body.text, "AblePay voice payment flow");

    if (intent.intent === "CHECK_HISTORY") {
      const history = store.getHistory().slice(0, 5);
      const speech = history.length
        ? `You have ${history.length} recent transactions. The latest is ${history[0].status}.`
        : "No transactions yet.";
      return NextResponse.json({ intent, pendingId: null, preview: { history }, speech });
    }

    if (!["P2P_TRANSFER", "SPLIT_BILL", "REQUEST_MONEY"].includes(intent.intent)) {
      return NextResponse.json({
        intent,
        pendingId: null,
        preview: null,
        speech: "I couldn't confidently parse that request. Please rephrase with recipient and amount."
      });
    }
    const pendingType = intent.intent as PendingTransaction["type"];

    const explicitNames = intent.recipients.map((recipient) => recipient.name);
    const inferredNames = store
      .getContacts()
      .filter((contact) => body.text.toLowerCase().includes(contact.name.toLowerCase()))
      .map((contact) => contact.name);
    const resolvedRecipients = store.resolveRecipients([...explicitNames, ...inferredNames]);
    const safetyError = guardrails(intent, resolvedRecipients.length);
    if (safetyError) {
      return NextResponse.json({ intent, pendingId: null, preview: null, speech: safetyError }, { status: 400 });
    }

    const amountCents = toCents(intent.amount || 0);
    const names = resolvedRecipients.map((recipient) => recipient.name);
    const participantIds = resolvedRecipients.map((recipient) => recipient.id);

    const perRecipientCents = (() => {
      if (pendingType === "P2P_TRANSFER") {
        return { [participantIds[0]]: amountCents };
      }

      const splitKeys = intent.includeSelf ? [...participantIds, "self"] : participantIds;
      const split = splitCentsDeterministic(amountCents, splitKeys);
      delete split.self;
      return split;
    })();

    const pendingId = randomUUID();
    const signature = `${intent.intent}:${amountCents}:${participantIds.join(",")}:${(intent.note || "").toLowerCase()}`;
    const duplicate = findDuplicate(signature);
    if (duplicate) {
      return NextResponse.json(
        {
          intent,
          pendingId: duplicate.id,
          preview: {
            type: duplicate.type,
            total: fromCents(duplicate.amountCentsTotal),
            recipients: duplicate.recipients,
            perRecipient: duplicate.perRecipientCents,
            note: duplicate.note
          },
          speech: "I found a similar pending request from just now. Say confirm to continue or cancel to discard it."
        },
        { status: 409 }
      );
    }

    const pending: PendingTransaction = {
      id: pendingId,
      type: pendingType,
      recipients: resolvedRecipients,
      amountCentsTotal: amountCents,
      perRecipientCents,
      note: intent.note,
      currency: "USD",
      createdAt: Date.now(),
      expiresAt: Date.now() + LIMITS.pendingExpiryMs,
      status: "pending",
      signature
    };

    store.upsertPending(pending);

    const speech = sentenceForPending(pending.type, pending.amountCentsTotal, names.join(" and "), pending.note);

    return NextResponse.json({
      intent,
      pendingId,
      preview: {
        type: pending.type,
        total: fromCents(pending.amountCentsTotal),
        recipients: pending.recipients,
        perRecipient: Object.entries(pending.perRecipientCents).map(([id, cents]) => ({
          recipient: pending.recipients.find((r) => r.id === id)?.name || id,
          amount: fromCents(cents)
        })),
        note: pending.note,
        expiresAt: pending.expiresAt
      },
      speech
    });
  } catch (error) {
    console.error("/api/intent failed", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    return NextResponse.json({ error: "Intent parsing failed" }, { status: 500 });
  }
}
