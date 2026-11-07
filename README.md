# AblePay

AblePay is a voice-native, accessibility-first payment agent built with Next.js 14.

It demonstrates:
- **Gnani Prisma** for speech-to-text
- **Gnani Evon** for intent reasoning
- **Gnani Timbre** for speech synthesis
- **PayPal Sandbox REST APIs** for payouts and invoice-based money requests

## Tech
- Next.js 14 App Router + TypeScript + Tailwind CSS
- Route Handlers for backend APIs
- `zod` validation
- In-memory store (`Map`) for pending/history
- `vitest` for unit tests

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open: `http://localhost:3000`
Demo page: `http://localhost:3000/demo`

## Environment Variables

Add to `.env.local`:

```bash
GNANI_API_KEY=
GNANI_STT_URL=
GNANI_LLM_URL=
GNANI_TTS_URL=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
MOCK_MODE=false
CONTACT_SAM_EMAIL=sb-sam-personal@example.com
CONTACT_SARAH_EMAIL=sb-sarah-personal@example.com
CONTACT_MOM_EMAIL=sb-mom-personal@example.com
```

### PayPal Sandbox keys + test accounts
1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/)
2. Create a Sandbox app and copy **Client ID** + **Secret**
3. Create/inspect Sandbox personal accounts (for contacts)
4. Put credentials in `.env.local`
5. Update `CONTACT_*_EMAIL` with sandbox personal-account emails

### Plug in Gnani endpoints
- `GNANI_STT_URL`: Prisma STT endpoint
- `GNANI_LLM_URL`: Evon LLM endpoint
- `GNANI_TTS_URL`: Timbre TTS endpoint
- `GNANI_API_KEY`: shared bearer key

All clients automatically fallback to realistic mocks when:
- `MOCK_MODE=true`, or
- external API call fails

## API routes
- `POST /api/stt` → `{ text }`
- `POST /api/intent` → `{ intent, pendingId, preview, speech }`
- `POST /api/confirm` → `{ result, speech }`
- `POST /api/tts` → audio stream
- `GET /api/history` → `{ transactions }`

## Tests

```bash
npm run test
```

Covers:
- deterministic split logic (`lib/split.ts`)
- safety guardrails (`lib/safety.ts`)

## Demo script (3 commands)
Use voice or text:
1. "Send twenty dollars to Sam for pizza"
2. "Split this 60 dollar dinner between me Sam and Sarah"
3. "Request 15 dollars from Mom for groceries"

Or run one-click actions on `/demo`.

## 60-second pitch outline
1. **Problem (10s):** payments are not voice-first or accessibility-first.
2. **Solution (15s):** AblePay understands spoken intent, computes safe previews, and confirms before execution.
3. **AI stack (15s):** Prisma transcribes, Evon parses intent, Timbre speaks response.
4. **Trust & safety (10s):** hard guardrails, limits, dedupe, idempotency, expiry, sandbox-only badge.
5. **Execution (10s):** confirmed commands trigger PayPal sandbox payouts/invoices with receipts.

## Exact commands to run
```bash
npm install
cp .env.example .env.local
npm run dev
npm run test
npm run build
```

## 5 manual verification steps (end-to-end)
1. Open `http://localhost:3000`, confirm **SANDBOX MODE • NO REAL MONEY** badge is visible.
2. Type: `Send twenty dollars to Sam for pizza` and submit.
3. Confirm preview appears with recipient, amount, and note; trigger **Confirm**.
4. Verify spoken/status response updates and transaction appears in **Recent Activity**.
5. Open `http://localhost:3000/demo` and run all three one-click commands successfully.
