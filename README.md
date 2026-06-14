# Xeno Mini CRM

An AI-native mini CRM for reaching shoppers — built for the Xeno FDE/SDE Internship assignment. Designed around a real Indian fashion retail brand called **Aria**, with 200 customers and 500 orders seeded from CSV data.

**Live Demo:** https://xeno-mini-crm-frontend-delta.vercel.app

---

## What It Does

Aria CRM lets a marketer:

1. Browse and create customer segments with plain English or manual rules
2. Create and send personalised campaigns across Email, SMS, and WhatsApp
3. Watch delivery happen in real time via an async two-service loop
4. Get AI-generated insights on campaign performance

---

## The Critical Piece — Async Two-Service Loop

The most important architectural requirement was a fully async callback loop between two separate services:

```
Marketer clicks "Create & Send"
        ↓
CRM Backend creates campaign → fires messages to Channel Service (fire-and-forget)
        ↓
Channel Service returns 202 immediately
        ↓
Channel Service simulates delivery (2–10s random delay, channel-aware outcomes)
        ↓
Channel Service POSTs result back to CRM /api/receipt
        ↓
CRM updates message status (pending → delivered/opened/clicked/failed)
        ↓
Frontend polls /api/campaigns/:id/stats every 10s — marketer watches live
```

This loop is verified working. Stats use timestamp presence (`COUNT(delivered_at)`) not status strings — clicked implies opened implies delivered, so timestamps are filled cumulatively.

---

## AI Touchpoints

AI is embedded directly in the marketer's workflow — not as a separate chatbot.

| Touchpoint | Where | What it does |
|---|---|---|
| NL → Segment Rules | Segments page | Converts plain English to validated JSONB rules, previews count instantly |
| Channel Recommendation | Campaign wizard step 3 | Recommends Email/SMS/WhatsApp based on campaign context, auto-selects with green dot |
| Message Generation | Campaign wizard step 4 | Three actions: Suggest, Improve Tone, Personalise — one Groq call per action |
| Agent Mode | Campaign wizard step 1 | Full campaign plan from a single goal: segment + channel + message + reasoning |
| Campaign Insight | Campaign detail dialog | 2–3 sentence AI paragraph interpreting delivery/open/click rates after completion |

One Groq call per campaign action maximum. Never per customer. `campaignSender.ts` interpolates `{{firstName}}` and `{{city}}` per customer — 200 customers, one AI call.

Every Groq response is validated with Zod before it touches anything else.

---

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS v3 + shadcn/ui + TanStack Query |
| CRM Backend | Node.js + Hono + TypeScript — port 3001 |
| Channel Service | Node.js + Hono + TypeScript — port 3002, stateless, no DB |
| Database | Neon PostgreSQL (Singapore) + Drizzle ORM |
| AI | Groq (llama-3.3-70b-versatile) abstracted behind `callGemini()` |
| Hosting | Vercel (frontend) + Render (two backend services) |

> **Why Groq instead of Gemini?** Gemini free tier had a quota provisioning issue on my Google Cloud project — no model would work without billing enabled. Groq with Llama 3.3 70B is genuinely free, faster inference, identical output quality for JSON generation. The model is abstracted behind a single `callGemini()` function — swappable back to Gemini Flash in one line.

---

## Repository Structure

```
xeno-mini-crm/
├── frontend/                  # React + Vite + TypeScript
│   └── src/
│       ├── components/        # Layout, StatCard, shadcn/ui
│       ├── pages/             # Dashboard, Campaigns, Segments
│       └── lib/               # api.ts (all API calls), utils.ts
├── crm-backend/               # Hono API — port 3001
│   ├── data/                  # customers.csv, orders.csv (seed source)
│   └── src/
│       ├── db/                # Drizzle schema, connection, seed script
│       ├── lib/               # segmentEngine, campaignSender, receiptHandler, geminiClient
│       └── routes/            # segments, campaigns, receipt, analytics, ai
└── channel-service/           # Hono API — port 3002, stateless
    └── src/
        └── index.ts           # POST /send → simulate → callback CRM
```

---

## Data Model

Five tables: `customers`, `orders`, `segments`, `campaigns`, `messages`.

Segment rules are stored as JSONB arrays — the one field with genuinely variable structure. Everything else is fixed-schema SQL. Supported fields: `city`, `totalSpend`, `orderCount`, `lastPurchaseAt`, `productCategory`, `discountTag`, `purchasedDuringCampaign`. All rules combine with AND logic.

```json
[
  { "field": "city", "operator": "eq", "value": "Mumbai" },
  { "field": "lastPurchaseAt", "operator": "gt", "value": 60 },
  { "field": "totalSpend", "operator": "gt", "value": 10000 }
]
```

---

## Seed Data

200 customers across Chennai (60), Mumbai (60), Delhi (45), Bangalore (35). 500 orders, 1–8 per customer, ₹500–₹15,000 each. Seven default system segments pre-seeded (All Customers, Active, Inactive, Dormant, High Value, Festive Buyers, Campaign Responders).

Data is assumed to already exist in the system — in production, Xeno ingests from POS systems and e-commerce platforms. There is no CSV upload UI by design.

To reseed:
```bash
cd crm-backend
npm run db:seed
```

---

## Running Locally

**Prerequisites:** Node.js 18+, a Neon database, a Groq API key.

```bash
# Clone
git clone https://github.com/ravindra11-jpg/xeno-mini-crm
cd xeno-mini-crm

# CRM Backend
cd crm-backend
cp .env.example .env   # fill in DATABASE_URL, GROQ_API_KEY, CHANNEL_SERVICE_URL
npm install
npm run db:push
npm run db:seed
npm run dev            # port 3001

# Channel Service (new terminal)
cd channel-service
cp .env.example .env   # fill in CRM_CALLBACK_URL
npm install
npm run dev            # port 3002

# Frontend (new terminal)
cd frontend
cp .env.example .env   # fill in VITE_API_URL=http://localhost:3001
npm install
npm run dev            # port 5173
```

---

## Environment Variables

**crm-backend/.env**
```
DATABASE_URL=
GROQ_API_KEY=
CHANNEL_SERVICE_URL=
PORT=3001
```

**channel-service/.env**
```
CRM_CALLBACK_URL=
PORT=3002
```

**frontend/.env**
```
VITE_API_URL=
```

---

## Key Design Decisions

| Decision | Reason |
|---|---|
| No auth | Single brand demo, zero evaluation signal |
| No real messaging provider | Channel service is a stub by design per assignment spec |
| SQL over NoSQL | Shopper data is structured at point of collection. JSONB only for segment rules — the one genuinely variable field |
| Two separate Hono services | Assignment requirement and correct architecture — CRM never cares how messages are delivered, only whether they were |
| Polling over WebSockets | Achieves identical demo effect at zero complexity cost |
| Fire-and-forget sends | POST /api/campaigns/:id/send returns 200 immediately — send happens in background, frontend polls for progress |
| No customers page | Customers are infrastructure not UI — zero evaluation signal |
| One AI call per campaign | Template interpolated by backend per customer — never 200 Groq calls for 200 customers |
| Timestamp-based stats | `COUNT(delivered_at)` not `COUNT(CASE WHEN status='delivered')` — correctly handles cumulative outcome hierarchy |

---

## API Reference

### CRM Backend (port 3001)

| Method | Route | Purpose |
|---|---|---|
| GET | /health | Health check |
| GET | /api/segments | List all segments with customer counts |
| POST | /api/segments | Create segment — auto-generates AI description |
| DELETE | /api/segments/:id | Delete (403 if default, 409 if used by campaign) |
| POST | /api/segments/preview | Count customers matching unsaved rules |
| GET | /api/campaigns | List all campaigns with stats |
| POST | /api/campaigns | Create campaign (draft) |
| POST | /api/campaigns/:id/send | Trigger send — fire-and-forget, double-send guard |
| GET | /api/campaigns/:id/stats | Aggregated stats for polling |
| POST | /api/receipt | Receive channel service callbacks |
| GET | /api/analytics | Cross-campaign stats for dashboard |
| POST | /api/ai/segment | NL prompt → validated JSONB rules |
| POST | /api/ai/channel | Campaign context → channel recommendation |
| POST | /api/ai/message | suggest / improve / personalise message template |
| POST | /api/ai/agent | Full campaign plan from one goal |
| POST | /api/ai/insight | Campaign stats → insight paragraph |

### Channel Service (port 3002)

| Method | Route | Purpose |
|---|---|---|
| GET | /health | Health check |
| POST | /send | Accept message, return 202, simulate async, callback CRM |

---

## Demo Brand

**Aria** — Indian fashion retail. Cities: Chennai, Mumbai, Delhi, Bangalore. Categories: Kurta, Western, Ethnic Fusion, Accessories.

Demo campaigns shown in walkthrough:
- Re-engage customers inactive for 60+ days
- Target high spenders above ₹10,000
- Mumbai monsoon collection launch

---

*Built by Ravindra Saravanan — SRM Institute of Science and Technology, KTR — Final Year B.Tech CSE*
