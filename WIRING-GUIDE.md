# HELM — Company-Operating-System Wiring Guide

**For:** a first-time founder in **Sweden** turning a mock-data dashboard into a live company OS.
**What this is:** a per-module map of *what to connect, which service to pick (Sweden-first + global default), and the exact steps + env vars* to wire it up.

> **How to read this**
> - Every module has: **Data source** → **Recommended service** → **Connect steps** → **Env vars**.
> - **🇸🇪 Sweden pick** is the option to choose if you're operating a Swedish company. **🌍 Global default** is the fallback if you ever go international or the Sweden pick doesn't fit.
> - Skip nothing in the **DO THIS FIRST** checklist at the bottom — order matters for a brand-new company.
> - Prices/limits move; treat figures as "as of mid-2026" and confirm on the vendor page before you pay.

---

## 0. The 60-second mental model

Your dashboard is a **frontend**. To make it real you need three things behind it:

1. **A backend database** that holds your own data (customers, orders, tasks, invoices). → **Supabase (Postgres)**.
2. **A thin API layer** that talks to outside services and writes their data into your tables. → **Next.js API routes** or **Supabase Edge Functions**.
3. **External services** (Stripe, Fortnox, Tink, Gmail, etc.) that *are* the real-world systems — they push data in via **webhooks** or you **pull** it on a schedule (cron).

The UI never calls Stripe/Fortnox/Tink directly. It reads **your** tables; your API layer keeps those tables in sync. That keeps secrets server-side and the UI fast.

---

## 1. Foundation (used by every module)

These aren't a dashboard "tab" — they're the substrate everything else sits on.

| Concern | 🇸🇪 Sweden pick | 🌍 Global default | Why |
|---|---|---|---|
| Auth (login) | **Supabase Auth** | Clerk / Auth0 | Bundled with your DB, EU data region available, GDPR-friendly |
| Database + backend | **Supabase (Postgres)** | Firebase (Firestore) | Real SQL, row-level security, EU hosting (Frankfurt `eu-central-1`) |
| File/object storage | **Supabase Storage** | AWS S3 / Cloudflare R2 | Same project, signed URLs, EU bucket |
| Hosting / deploy | **Vercel** | Netlify / Cloudflare Pages | First-class Next.js, preview deploys, env-var UI |
| AI copilot | **Anthropic Claude API** (`claude-opus-4-8`) | same | Latest flagship; EU traffic supported |

**Supabase setup**
1. Create a project at `https://supabase.com` → **choose region `Europe (Frankfurt)`** (keep EU citizens' data in the EU for GDPR).
2. Project Settings → **API**: copy the **Project URL**, the **anon/publishable** key (safe for browser), and the **service_role** key (server-only — never ship to the client).
3. Enable **Row Level Security** on every table; write policies so a logged-in user only sees their org's rows.

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...        # browser-safe
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...            # SERVER ONLY — full DB access
```

**Anthropic (AI copilot) setup**
1. Create a key at `https://console.anthropic.com` → **API Keys**.
2. Call from the **server** only. Current models: `claude-opus-4-8` (flagship, ~$5/$25 per 1M in/out tokens), `claude-sonnet-4-6` (workhorse, ~$3/$15), `claude-haiku-4-5` (cheap/fast, ~$1/$5). Use **prompt caching** (90% cheaper cached input) and the **Batch API** (50% off) for bulk jobs.

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-8
```

---

## 2. Module-by-module wiring

### 🧭 Command / Overview
The home screen. It **reads nothing of its own** — it aggregates the other modules.

| | Detail |
|---|---|
| **Data source** | Roll-ups from Finance, Sales, Orders, Support, Tasks tables |
| **🇸🇪 / 🌍 service** | None new. A nightly **cron** (Vercel Cron or Supabase pg_cron) writes a `kpi_snapshots` row so the overview loads instantly instead of recomputing live |
| **Connect** | 1) Create a `kpi_snapshots` table. 2) Add a Vercel Cron job (`vercel.json` → `crons`) hitting `/api/cron/snapshot`. 3) That route reads the other tables, computes KPIs, upserts the snapshot. |
| **AI** | Feed the snapshot to Claude for a daily "what needs you" briefing. |

```
CRON_SECRET=replace-with-long-random-string   # verify Bearer on /api/cron/*
```

---

### 💰 Finance & Cash Flow
The money truth: revenue in, costs out, runway.

| | 🇸🇪 Sweden pick | 🌍 Global default |
|---|---|---|
| Revenue / MRR feed | **Stripe** | Stripe |
| Bank balance + transactions (open banking) | **Tink** (Stockholm-based, owned by Visa; 3,400+ EU banks incl. all Swedish banks) | **Plaid** (US/UK/EU) |
| Bookkeeping / VAT (moms) | **Fortnox** or **Bokio** | QuickBooks / Xero |
| Manual fallback | Bank **CSV/SIE import** | CSV import |

**Stripe (revenue)**
1. `https://dashboard.stripe.com` → Developers → **API keys** (use **test** keys first; switch to live when ready).
2. Developers → **Webhooks** → add endpoint `https://YOUR-APP/api/webhooks/stripe`, subscribe to `invoice.paid`, `charge.succeeded`, `customer.subscription.*`. Copy the **signing secret**.
3. Your handler verifies the signature, then writes to `revenue_events` / `mrr`.

**Tink (cash flow / bank feeds)**
1. Free developer account at `https://tink.com/get-started` → create an app → get **client_id** + **client_secret**.
2. Use the **Account Check / Transactions** product; the user authenticates their bank via Tink's hosted flow (PSD2/strong auth).
3. A daily job pulls balances + transactions into `bank_accounts` / `bank_transactions`. (Plaid is the swap-in if you leave the EU.)

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
TINK_CLIENT_ID=...
TINK_CLIENT_SECRET=...
```

**Accounting/VAT** — see the next module; the Finance tab should show the bookkeeping balance + VAT (moms) liability pulled from Fortnox/Bokio.

---

### 🧾 Accounting / Bookkeeping / VAT (moms) — Sweden-critical
Not just a number on the dashboard — this is your legal bookkeeping (*bokföringsskyldighet*).

| | 🇸🇪 Sweden pick | 🌍 Global default |
|---|---|---|
| Bookkeeping engine | **Fortnox** (market leader, full API) or **Bokio** (free tier, modern API) | **QuickBooks** / **Xero** |
| VAT (moms) reporting | Fortnox/Bokio → file to **Skatteverket** | provider's tax module |
| File format | **SIE** (Swedish standard export/import) | CSV/native |

**Fortnox**
1. Register at `https://apps.fortnox.se/developer` (a **Swedish personal/org number is required**) → create an integration → get **Client ID** + **Client Secret**.
2. OAuth 2.0: send the user to the authorize endpoint, get an **authorization code**, exchange for **access + refresh tokens** (store the refresh token; access tokens are short-lived).
3. Pull invoices, vouchers, VAT report; push your invoices/payments so books stay in sync.

**Bokio** (cheaper to start)
1. In Bokio → **API Tokens** → **Create Private Integration** (free; 5,000 requests/month at no cost). Docs: `https://docs.bokio.se`.
2. Use the token to read/write vouchers and fetch the VAT (moms) figures the Finance tab displays.

```
FORTNOX_CLIENT_ID=...
FORTNOX_CLIENT_SECRET=...
FORTNOX_REFRESH_TOKEN=...
# or
BOKIO_API_TOKEN=...
BOKIO_COMPANY_ID=...
```

> **Moms note:** standard Swedish VAT is 25% (12%/6% reduced). Your dashboard should *display* the VAT owed from the accounting feed — **don't compute tax yourself for filing**; let Fortnox/Bokio + Skatteverket be the source of truth.

---

### 🧾→ Invoicing
| | 🇸🇪 Sweden pick | 🌍 Global default |
|---|---|---|
| Issue invoices | **Fortnox Invoicing** (Swedish layout, ROT/RUT, OCR refs, e-invoice/Peppol) | **Stripe Invoicing** |
| Card/subscription billing | **Stripe Billing** | Stripe Billing |

- For B2B Swedish invoices with proper moms handling and **Peppol e-invoicing**, prefer **Fortnox**.
- For self-serve SaaS-style card payments, **Stripe Invoicing/Billing** (reuse the Stripe keys above).

---

### 📈 Sales Pipeline
Deals, stages, forecast.

| | 🇸🇪 Sweden pick | 🌍 Global default |
|---|---|---|
| Pipeline data | **Native** (your own `deals` table in Supabase) | Native, or **Pipedrive** (EU servers, popular in Nordics) / **HubSpot** |
| Email signals | Gmail/Microsoft 365 (see Calendar/email) | same |

**Connect**
- Simplest + cheapest: keep deals **in Supabase**. Stages = enum column; activity = `deal_events`.
- If sales is multi-person and you want call/email logging: **Pipedrive** (`https://app.pipedrive.com` → Settings → **Personal preferences → API → token`). Mirror deals into your DB via webhooks so the dashboard reads one place.

```
PIPEDRIVE_API_TOKEN=...        # only if not using native
```

---

### 👥 Customers / CRM
| | 🇸🇪 Sweden pick | 🌍 Global default |
|---|---|---|
| Customer master | **Native** (`customers` table) | Native or HubSpot |
| Company lookup/enrichment | **Bolagsverket / Roaring / Bisnode** (Swedish org-number lookup) | Clearbit |
| De-dupe key | **Org.nr** (företag) / email | email/domain |

**Connect**
- Make your `customers` table the single source. Sync **Stripe customers** and **Fortnox customers** into it by external ID so Sales, Orders, Finance all reference the same record.
- For Swedish B2B, store **organisationsnummer**; you can validate/enrich via Bolagsverket or a provider like Roaring.

```
# optional enrichment
ROARING_API_KEY=...
```

> **GDPR:** customers are personal data. Keep a lawful basis, a deletion path (`DELETE /api/customers/:id` cascading), and an EU data region. Don't sync PII into US-only tools without an adequacy/SCC basis.

---

### 📦 Products & Inventory
| | 🇸🇪 Sweden pick | 🌍 Global default |
|---|---|---|
| Product catalog + stock | **Shopify** (Nordic-friendly, hosted) or **WooCommerce** (self-host) | Shopify |
| Nordic multichannel/ERP-lite | **Centra** or **Sello** (Sweden) | — |
| Stock truth | the store platform + your `inventory` table | same |

**Shopify**
1. `Settings → Apps and sales channels → Develop apps → Create an app` → enable **Admin API**, select scopes (`read_products`, `read_inventory`, `read_orders`).
2. Install → copy the **Admin API access token**.
3. Pull products/inventory into `products` / `inventory_levels`; subscribe to `products/update` and `inventory_levels/update` **webhooks** for live stock.

```
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_API_TOKEN=shpat_...
SHOPIFY_WEBHOOK_SECRET=...
```

---

### 🚚 Orders & Fulfillment
| | 🇸🇪 Sweden pick | 🌍 Global default |
|---|---|---|
| Orders | **Shopify / WooCommerce** orders | Shopify |
| Payments at checkout | **Klarna** + **Swish** + cards (via Stripe) | Stripe / PayPal |
| Shipping & labels | **PostNord**, **Instabox/Budbee**, **DHL**, or an aggregator like **Shipmondo/nShift** | Shippo / EasyPost |

**Payments for Swedish checkout**
- **Cards + Klarna:** Klarna is a Swedish company and is available **natively as a Stripe payment method** — enable it in the Stripe Dashboard (`Settings → Payment methods → Klarna`). No separate Klarna contract needed to start.
- **Swish (huge in Sweden):** for e-commerce use **Swish Handel**. Sign the **Swish-avtal** through your business bank (Swedbank/SEB/Nordea/Handelsbanken/etc.), appoint a **Certificate Point of Contact (CPOC)**, generate the **TLS client certificate** in the certificate manager, and install it on your server to call the **Swish API**. (Or onboard via an approved **technical-supplier/partner** to skip per-merchant certs.)

**Orders flow**
- Shopify/Woo **order webhooks** → your `orders` table. The fulfillment tab updates status; pushing tracking numbers back closes the loop.

```
# Klarna runs through Stripe keys above. Swish:
SWISH_PAYEE_ALIAS=1231181189          # your Swish-handel number
SWISH_CERT_PATH=/secrets/swish.pem    # client cert + key
SWISH_CERT_PASSWORD=...
SWISH_CALLBACK_URL=https://YOUR-APP/api/webhooks/swish
```

---

### ✅ Projects & Tasks
| | 🇸🇪 Sweden pick | 🌍 Global default |
|---|---|---|
| Task data | **Native** (`projects`, `tasks` tables) | Native or **Linear** / Asana / Trello |
| Calendar sync | Google/Microsoft (see below) | same |

**Connect** — Start **native**; it's the cheapest and your AI copilot can read it directly. If the team already lives in **Linear**, mirror issues via Linear's webhook into `tasks` so the dashboard stays the single pane.

```
LINEAR_API_KEY=...     # optional
```

---

### 🧑‍🤝‍🧑 Team / People
| | 🇸🇪 Sweden pick | 🌍 Global default |
|---|---|---|
| Identity / roles | **Supabase Auth** users + a `team_members` table | same / Clerk orgs |
| Payroll & HR | **Fortnox Lön**, **Hailey HR**, **Kontek** (Sweden) | Gusto / Deel |
| Directory | Google Workspace / Microsoft 365 directory | same |

**Connect**
- Roles/permissions live in your DB (`role` column + RLS).
- Payroll stays in the Swedish payroll tool; the dashboard just **reads headcount + cost** via its API or a monthly CSV. Don't rebuild payroll.

---

### 📣 Marketing & Growth
| | 🇸🇪 Sweden pick | 🌍 Global default |
|---|---|---|
| Email campaigns | **Brevo** (EU/France, GDPR-clean) or **Mailchimp** | Mailchimp |
| Transactional email | **Postmark** or **Resend** | Resend |
| Ads data | Meta Ads, Google Ads APIs | same |
| Web analytics | **Plausible** (EU, cookieless) | PostHog / GA4 |

**Connect**
- **Campaigns:** Brevo/Mailchimp API key → sync list growth, open/click into `marketing_metrics`.
- **Ads:** pull spend/ROAS daily from Meta/Google Ads APIs into the same table; the AI copilot summarizes performance.

```
BREVO_API_KEY=...            # or MAILCHIMP_API_KEY=...
META_ADS_ACCESS_TOKEN=...
GOOGLE_ADS_DEVELOPER_TOKEN=...
```

---

### 📊 Analytics / BI
| | 🇸🇪 Sweden pick | 🌍 Global default |
|---|---|---|
| Product analytics | **PostHog** (EU Cloud region) | PostHog |
| Privacy-first web stats | **Plausible** (Sweden/EU-hosted) | GA4 |
| BI / SQL dashboards | **Metabase** on your Supabase DB | Metabase / Looker Studio |

**Connect**
- Put the **PostHog/Plausible snippet** on your site → events flow to their cloud.
- For internal BI, point **Metabase** at the Supabase Postgres (read-only DB user). The dashboard's Analytics tab can embed Metabase questions or query summary tables directly.

```
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://eu.posthog.com
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=yourdomain.se
```

---

### 📅 Calendar / Schedule
| | 🇸🇪 Sweden pick | 🌍 Global default |
|---|---|---|
| Calendar + email backbone | **Google Workspace** (Gmail + Calendar APIs) | Microsoft 365 (Graph API) |
| Scheduling links | **Cal.com** (open-source, EU-host-able) | Calendly |

**Google Workspace**
1. `https://console.cloud.google.com` → create project → enable **Google Calendar API** + **Gmail API**.
2. Configure **OAuth consent screen**, create **OAuth client** → get **client_id/secret**; set redirect URI to your app.
3. Request scopes `calendar.readonly` (or `calendar.events`) and `gmail.readonly`/`gmail.modify`. Store the user's **refresh token**; sync events into a `calendar_events` table.

```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://YOUR-APP/api/auth/google/callback
```

---

### 📨 Inbox / Support
| | 🇸🇪 Sweden pick | 🌍 Global default |
|---|---|---|
| Shared inbox | **Gmail** (Workspace) shared mailbox, or **Front** | Front / Help Scout |
| Live chat | **Crisp** (EU, France) | Intercom |
| Ticket store | your `tickets` table | provider |

**Connect**
- Cheapest start: a **support@ Gmail** mailbox synced via the Gmail API → upsert threads into `tickets`; reply from the dashboard via Gmail send.
- For live chat, drop the **Crisp** widget on the site; its webhook posts new conversations into `tickets`. The AI copilot can draft replies.

```
CRISP_IDENTIFIER=...
CRISP_KEY=...
CRISP_WEBSITE_ID=...
```

---

### ⚙️ Automations
| | 🇸🇪 Sweden pick | 🌍 Global default |
|---|---|---|
| No-code glue | **Make** (EU-host-able) | **Zapier** |
| Self-hosted glue | **n8n** (run in EU; GDPR control) | n8n |
| Scheduled jobs | **Vercel Cron** / Supabase **pg_cron** | same |
| Event-driven | **Webhooks** in/out | same |

**Connect**
- Use webhooks as the spine: every external service posts to `/api/webhooks/*`; your handlers normalize and store.
- Use **n8n/Make** for the long tail ("new Stripe payment → post to Slack → create Fortnox voucher") without writing code.
- Use **cron** for pulls (bank sync, KPI snapshot, ad-spend fetch).

```
ZAPIER_WEBHOOK_URL=https://hooks.zapier.com/...   # or MAKE_WEBHOOK_URL / N8N_WEBHOOK_URL
```

---

### 🔌 Integrations Hub
Not a data source — it's the **control panel** where the founder connects/disconnects the services above.

| | Detail |
|---|---|
| **What it stores** | One `integrations` table: `service`, `status`, `connected_at`, encrypted credentials/refresh-token reference |
| **🇸🇪 / 🌍 service** | Native UI over your own table; secrets in **Supabase Vault** (or env vars for single-tenant) |
| **Connect** | Each "Connect" button kicks off that service's OAuth or asks for an API key, then writes status to `integrations`. The other modules check this table to know what's live. |
| **Security** | Never store raw secrets in browser-readable rows. Use Supabase **Vault** / server-side encryption; the UI shows only `connected/disconnected`. |

---

### ⚙️ Settings
| | Detail |
|---|---|
| **Data source** | `org_settings` + `team_members` tables (company profile, org.nr, VAT no., branding, roles, locale `sv-SE`, currency `SEK`, timezone `Europe/Stockholm`) |
| **🇸🇪 specifics** | Store **organisationsnummer**, **VAT/momsregistreringsnummer** (`SE` + 12 digits), **F-skatt** status, bank/Bankgiro/Swish number — these feed Invoicing and Accounting |
| **Connect** | Pure DB-backed; gate edits behind admin role via RLS |

---

## 3. 🇸🇪 Sweden specifics cheat-sheet

| Thing | What it is | Where |
|---|---|---|
| **Bolagsverket** | Company registry — register your **aktiebolag (AB)** | `verksamt.se` / `bolagsverket.se` — digital reg ~**2,200 SEK**, **min. 25,000 SEK** share capital, ~5–15 business days |
| **Skatteverket** | Tax agency — **F-skatt**, **moms (VAT)** registration, employer registration | `skatteverket.se` (via `verksamt.se`) |
| **Org.nr** | Your company's national ID — used everywhere (Fortnox, Swish, invoices) | issued by Bolagsverket on registration |
| **Moms (VAT)** | 25% standard / 12% / 6% reduced; file via Fortnox/Bokio → Skatteverket | quarterly or monthly |
| **F-skatt** | Approval to handle your own tax/social fees as a business | apply with Skatteverket |
| **Swish** | Dominant SE mobile payment; **Swish Handel** for e-com (needs bank agreement + TLS cert) | via your business bank |
| **Bankgiro/Plusgiro** | Standard SE payment reference numbers on invoices | via bank |
| **GDPR** | EU data law — keep PII in **EU regions**, have a deletion path, lawful basis, DPA with each processor | applies to every module touching personal data |
| **Bokföringslagen** | Legal duty to keep books (save 7 years) | satisfied by Fortnox/Bokio |

---

## 4. ✅ DO THIS FIRST — setup order for a brand-new company

Wire in this sequence; each step unlocks the next.

1. **Register the company.** `verksamt.se` → register **AB** with **Bolagsverket** (get **org.nr**), apply for **F-skatt** + **moms** + employer reg with **Skatteverket**. *(Nothing else is real until you have an org.nr.)*
2. **Open a business bank account** (SEB/Nordea/Handelsbanken/Swedbank or a fintech like Lunar/Wise Business). Get **Bankgiro** + set up **Swish Handel** if you sell online.
3. **Set up bookkeeping** — **Fortnox** or **Bokio**. Connect the bank feed; this is your legal source of truth from day one.
4. **Payments** — **Stripe** account (enable cards + **Klarna**); add **Swish** for SE checkout. Verify business with org.nr.
5. **Domain + email** — buy the domain, set up **Google Workspace** (Gmail + Calendar), and configure **SPF/DKIM/DMARC** so transactional email (Resend/Postmark) and campaigns (Brevo) actually deliver.
6. **Foundation stack** — **Supabase** project (EU/Frankfurt) for auth+DB+storage, deploy the dashboard to **Vercel**, add the **Anthropic** key for the AI copilot.
7. **Connect revenue + cash** — Stripe webhook → `revenue_events`; **Tink** bank feed → `bank_transactions`. Now Finance & Command tabs go live.
8. **Connect store** (if e-com) — **Shopify** products/inventory/orders webhooks.
9. **CRM/Sales** — start native in Supabase; add Pipedrive only if needed.
10. **The rest** — Marketing (Brevo + Plausible/PostHog), Support (Crisp/Gmail), Calendar, Automations (n8n/Make + cron), Documents.
11. **GDPR pass** — DPAs signed with each processor, EU regions confirmed, deletion endpoint working, privacy policy published.

---

## 5. Consolidated `.env.example`

```dotenv
# ── Foundation: Supabase (auth + Postgres + storage) ──────────────
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key       # SERVER ONLY

# ── Hosting / jobs ────────────────────────────────────────────────
CRON_SECRET=long-random-string-for-cron-auth

# ── AI copilot: Anthropic Claude ──────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
ANTHROPIC_MODEL=claude-opus-4-8

# ── Payments & revenue: Stripe (+ Klarna via Stripe) ──────────────
STRIPE_SECRET_KEY=sk_live_xxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxx

# ── Swish (Sweden mobile payments) ────────────────────────────────
SWISH_PAYEE_ALIAS=123XXXXXXX
SWISH_CERT_PATH=/secrets/swish.pem
SWISH_CERT_PASSWORD=xxxxxxxx
SWISH_CALLBACK_URL=https://YOUR-APP/api/webhooks/swish

# ── Banking / cash flow: Tink (Plaid is the global swap-in) ───────
TINK_CLIENT_ID=xxxxxxxx
TINK_CLIENT_SECRET=xxxxxxxx
# PLAID_CLIENT_ID=xxxxxxxx
# PLAID_SECRET=xxxxxxxx
# PLAID_ENV=production

# ── Accounting / VAT (moms): Fortnox OR Bokio ─────────────────────
FORTNOX_CLIENT_ID=xxxxxxxx
FORTNOX_CLIENT_SECRET=xxxxxxxx
FORTNOX_REFRESH_TOKEN=xxxxxxxx
# BOKIO_API_TOKEN=xxxxxxxx
# BOKIO_COMPANY_ID=xxxxxxxx

# ── E-commerce / orders / inventory: Shopify ──────────────────────
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_API_TOKEN=shpat_xxxxxxxx
SHOPIFY_WEBHOOK_SECRET=xxxxxxxx

# ── CRM / Sales (optional — native DB preferred) ──────────────────
PIPEDRIVE_API_TOKEN=xxxxxxxx
# LINEAR_API_KEY=xxxxxxxx

# ── Calendar + email: Google Workspace ────────────────────────────
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxxxxx
GOOGLE_REDIRECT_URI=https://YOUR-APP/api/auth/google/callback

# ── Transactional email: Resend (or Postmark) ─────────────────────
RESEND_API_KEY=re_xxxxxxxx
# POSTMARK_SERVER_TOKEN=xxxxxxxx
EMAIL_FROM=hello@yourdomain.se

# ── Marketing campaigns: Brevo (or Mailchimp) ─────────────────────
BREVO_API_KEY=xkeysib-xxxxxxxx
# MAILCHIMP_API_KEY=xxxxxxxx-us21

# ── Ads (optional) ────────────────────────────────────────────────
META_ADS_ACCESS_TOKEN=xxxxxxxx
GOOGLE_ADS_DEVELOPER_TOKEN=xxxxxxxx

# ── Analytics: PostHog + Plausible ────────────────────────────────
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxx
NEXT_PUBLIC_POSTHOG_HOST=https://eu.posthog.com
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=yourdomain.se

# ── Support / live chat: Crisp ────────────────────────────────────
CRISP_WEBSITE_ID=xxxxxxxx
CRISP_IDENTIFIER=xxxxxxxx
CRISP_KEY=xxxxxxxx

# ── Automations: webhook out (Zapier / Make / n8n) ────────────────
AUTOMATION_WEBHOOK_URL=https://hooks.zapier.com/xxxxxxxx

# ── Optional: company enrichment (Sweden org.nr lookup) ───────────
# ROARING_API_KEY=xxxxxxxx
```

> Put real values in **Vercel → Project → Settings → Environment Variables** (and a local `.env.local` that is **git-ignored**). Anything the browser needs must be prefixed `NEXT_PUBLIC_`; everything else stays server-side.

---

## 6. Architecture note (today → live)

**Today:** the dashboard is a static frontend rendering mock data.

**Minimal stack to make it live:**

```
                         ┌─────────────────────────────┐
   Browser (the UI) ───► │  Vercel (Next.js frontend)  │
   reads ONLY your tables└──────────────┬──────────────┘
                                        │ server-side
                         ┌──────────────▼──────────────┐
                         │  Thin API layer             │
                         │  Next.js API routes  ──OR──  │
                         │  Supabase Edge Functions     │
                         └───┬───────────────┬──────────┘
              webhooks in    │               │   pulls (cron)
        Stripe / Shopify ───►│               │◄─── Tink, Fortnox/Bokio,
        Swish / Crisp        │               │     Google, Ads, Brevo
                         ┌───▼───────────────▼──────────┐
                         │  Supabase (EU / Frankfurt)   │
                         │  Auth · Postgres · Storage   │
                         │  RLS · Vault (secrets)       │
                         └──────────────────────────────┘
```

- **Supabase** = auth + Postgres + storage (EU region for GDPR). Each module reads its own table(s); RLS keeps data scoped to the org/user.
- **Thin API layer** (Next.js API routes *or* Supabase Edge Functions) holds all secrets, receives **webhooks** from Stripe/Shopify/Swish/Crisp, and runs **cron pulls** from Tink/Fortnox/Google/ads to keep tables fresh.
- **Vercel** hosts the frontend + API routes, manages env vars, and gives preview deploys.
- The **per-service integrations** above each feed one or two tables; the UI just renders those. Swap mock JSON for `select`s against these tables, module by module, in the **DO THIS FIRST** order.

**Golden rules:** UI never holds a secret · external data lands in *your* DB before the UI sees it · EU region + DPAs for GDPR · start native (Supabase tables) and only add a SaaS when a module genuinely needs it.
