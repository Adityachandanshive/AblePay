import { Contact, PaymentResult } from "@/lib/types";
import { fromCents } from "@/lib/split";

const MOCK_MODE = process.env.MOCK_MODE === "true";
const BASE_URL = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";

let tokenCache: { token: string; expiresAt: number } | null = null;

function parsePayPalError(payload: unknown): string {
  const data = payload as {
    details?: { description?: string }[];
    message?: string;
    error_description?: string;
  };
  const details = data?.details?.[0]?.description || data?.message || data?.error_description;
  return details || "PayPal request failed. Please try again.";
}

export async function getAccessToken(): Promise<string> {
  if (MOCK_MODE) {
    return "mock-paypal-token";
  }

  if (tokenCache && tokenCache.expiresAt > Date.now() + 10_000) {
    return tokenCache.token;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials are not configured.");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(parsePayPalError(payload));
  }

  tokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 0) * 1000
  };

  return payload.access_token;
}

export async function sendPayout(params: {
  pendingId: string;
  recipient: Contact;
  amountCents: number;
  note: string | null;
}): Promise<PaymentResult> {
  if (MOCK_MODE) {
    return {
      id: `MOCK-PAYOUT-${params.pendingId}`,
      status: "SUCCESS",
      raw: { mock: true }
    };
  }

  const token = await getAccessToken();
  const body = {
    sender_batch_header: {
      sender_batch_id: `ablepay-${params.pendingId}`,
      email_subject: "You have a payment from AblePay"
    },
    items: [
      {
        recipient_type: "EMAIL",
        receiver: params.recipient.email,
        amount: {
          value: fromCents(params.amountCents),
          currency: "USD"
        },
        note: params.note || "Payment sent with AblePay",
        sender_item_id: `${params.pendingId}-${params.recipient.id}`
      }
    ]
  };

  const response = await fetch(`${BASE_URL}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `ablepay-${params.pendingId}`
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(parsePayPalError(payload));
  }

  return {
    id: payload.batch_header?.payout_batch_id || payload.batch_header?.sender_batch_header?.sender_batch_id || params.pendingId,
    status: payload.batch_header?.batch_status || "PENDING",
    raw: payload
  };
}

export async function requestMoney(params: {
  pendingId: string;
  requests: { recipient: Contact; amountCents: number }[];
  note: string | null;
}): Promise<PaymentResult> {
  if (MOCK_MODE) {
    return {
      id: `MOCK-INVOICE-${params.pendingId}`,
      status: "SENT",
      raw: { mock: true, invoices: params.requests.length }
    };
  }

  const token = await getAccessToken();
  const createdInvoices: unknown[] = [];

  for (const request of params.requests) {
    const { recipient, amountCents } = request;
    const createBody = {
      detail: {
        currency_code: "USD",
        note: params.note || "Payment request from AblePay"
      },
      invoicer: {
        name: {
          given_name: "AblePay",
          surname: "Agent"
        }
      },
      primary_recipients: [
        {
          billing_info: {
            email_address: recipient.email
          }
        }
      ],
      items: [
        {
          name: params.note || "Split bill",
          quantity: "1",
          unit_amount: {
            currency_code: "USD",
            value: fromCents(amountCents)
          }
        }
      ]
    };

    const createResponse = await fetch(`${BASE_URL}/v2/invoicing/invoices`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `ablepay-${params.pendingId}-${recipient.id}`
      },
      body: JSON.stringify(createBody)
    });

    const createPayload = await createResponse.json();
    if (!createResponse.ok) {
      throw new Error(parsePayPalError(createPayload));
    }

    const invoiceId = createPayload.id;
    const sendResponse = await fetch(`${BASE_URL}/v2/invoicing/invoices/${invoiceId}/send`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `ablepay-${params.pendingId}-${recipient.id}-send`
      },
      body: JSON.stringify({ send_to_invoicer: true, send_to_recipient: true })
    });

    if (!sendResponse.ok) {
      const sendPayload = await sendResponse.json();
      throw new Error(parsePayPalError(sendPayload));
    }

    createdInvoices.push({ recipient: recipient.email, invoiceId });
  }

  return {
    id: `invoice-${params.pendingId}`,
    status: "SENT",
    raw: createdInvoices
  };
}
