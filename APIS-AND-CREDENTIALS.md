# HELM — APIs & Credentials You Need From the User

**The single doc you hand to whoever wires the backend.**
HELM is a company operating system: one web UI, **27 modules**, currently rendering mock/seed data. This checklist is everything a brand-new company must sign up for, every key/secret to collect, every scope and webhook to register, and the exact `env` var names the code expects — so the mock data can be swapped for live data, module by module, without breaking the shell contract.

> **Audience:** a first-time founder operating in **Sweden** (org seed in the build plan = *Northwind Labs AB*, Norrköping, SEK). Every choice gives a **🇸🇪 Sweden pick** and a **🌍 Global default**.
> **Companions:** `BUILD-PLAN.md` (module map, data model D, integrations checklist F) and `WIRING-GUIDE.md` (the earlier Sweden-first per-module guide). This document is the consolidated, current-as-of-June-2026 credentials layer. Where the two disagree, **this doc is newer** — most importantly on **Google Fit** (now deprecated; see §3 Vitals).
> **Prices/limits move.** Figures are "as of mid-2026 — confirm on the vendor page before you pay."

**The one architectural rule that makes the whole thing work:** the UI never calls an external API directly. A **thin API layer** (Next.js API routes or Supabase Edge Functions) holds every secret, receives webhooks, and writes external data into **your own Supabase tables**. The UI reads only your tables. **Every external event becomes (a) a domain record AND (b) an append-only `AuditEvent`** — so the AI copilot can later read the entire company from one export. (See §6–§7.)

---

## 1. TL;DR — setup order (do these in sequence)

Each step unlocks the next. Steps 1–5 are *legal/financial reality* (no software makes them real); 6 onward is wiring.

1. **Register the company.** `verksamt.se` → register the **AB** with **Bolagsverket** (get your **org.nr**); apply for **F-skatt**, **moms (VAT)**, and employer registration with **Skatteverket**. *Nothing downstream is real until you have an org.nr.* (🌍 your country's company registry + tax authority.)
2. **Business bank account** (SEB / Nordea / Handelsbanken / Swedbank, or fintech Lunar / Wise Business). Get **Bankgiro**; set up **Swish Handel** if you sell online.
3. **Bookkeeping** — open **Fortnox** (🇸🇪) or **Bokio**; connect the bank feed. This is your legal source of truth from day one (*bokföringslagen*, save 7 years).
4. **Foundation stack** — create a **Supabase** project in **EU (Frankfurt)** for **Postgres + Auth + Storage**; deploy the HELM UI + API layer to **Vercel**; add the **Anthropic Claude** key for the copilot, meeting briefs, doc-gen, and reading the audit export. *(This is §2 — build this before any connector.)*
5. **Employee logins** — create one **Supabase Auth** user per person on the team seed; assign **roles** (`owner/admin/finance/member/viewer`) that map to `HELM.session.is()/can()`.
6. **Money in/out** — **Stripe** (revenue + payouts), **Fortnox** (auto-bookkeeping + VAT), **Tink** (bank feed). Webhooks → `Payment`/`Voucher` + `AuditEvent`. Finance modules (`command`, `ledger`, `revenue`, `billing`) go live.
7. **Per-user Google** — **Google Workspace** OAuth (Gmail + Calendar APIs), connected **per employee** with stored refresh tokens. `inbox` + `calendar` go live per person.
8. **Slack in-app** — one Slack app (Web API + Socket Mode/Events). `comms` channels/DMs + Huddle/Call deep-links go live.
9. **Dev + infra signal** — **GitHub/GitLab** push webhooks → `devlog`; **Vercel/Supabase** deploy hooks → `Deploy`; **Better Stack / Datadog** monitors → `infra`.
10. **Meetings** — **Recall.ai** (bot joins Meet/Zoom/Teams/Slack) + **AssemblyAI** (or Whisper) for transcript + **Claude** for the brief. `meetings` go live.
11. **Vitals** — per-employee **Whoop** OAuth; **Apple HealthKit** / **Fitbit Web API** / **Health Connect** for the rest. *(Google Fit REST is deprecated — see §3.)*
12. **E-sign** — **Scrive + BankID** (🇸🇪) or **DocuSign / Dropbox Sign**. `vault` sign flow goes live.
13. **Notifications** — **Resend / Postmark / Brevo** (email), **Slack DM**, **web push (VAPID)**. Delivery honors each person's `notificationPrefs`.
14. **GDPR pass** — DPAs signed with every processor, EU regions confirmed, deletion path working, Vitals health data treated as a special category (§7).

---

## 2. Foundation — everyone needs these three

These are not "tabs." They are the substrate all 27 modules sit on. Set them up first.

### Supabase — Postgres + Auth + Storage  (🇸🇪 & 🌍 same pick)
- **Powers:** the entire data store (one table per record type in BUILD-PLAN §D), **per-employee logins + roles** (`HELM.session`), file/object storage for logos, generated docs, payslips and meeting recordings, and the **append-only `audit_events`** table that is the keystone of the whole system.
- **Sign up:** <https://supabase.com> → **New project** → **Region: Europe (Frankfurt) `eu-central-1`** (keeps EU citizens' data in the EU for GDPR).
- **Setup (one line):** create the project in Frankfurt, enable **Row Level Security on every table**, write policies so a logged-in user sees only their org's rows; copy the three keys below from *Project Settings → API*.
- **Env vars:**
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...        # browser-safe (publishable)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...            # SERVER ONLY — full DB access, never ship to client
```

### Vercel — hosting + API layer + cron  (🇸🇪 & 🌍 same; 🌍 alt: Netlify / Cloudflare Pages)
- **Powers:** hosts the HELM frontend **and** the thin API layer (Next.js API routes that receive every webhook and run scheduled pulls), manages env vars, gives preview deploys. Vercel Cron (or Supabase `pg_cron`) drives the KPI snapshot for `command` and the nightly pulls (bank, ad-spend).
- **Sign up:** <https://vercel.com> → import the repo → add all env vars under *Project → Settings → Environment Variables*.
- **Setup (one line):** deploy the repo, paste env vars, add a `CRON_SECRET` and a Bearer-checked `/api/cron/*` route.
- **Env vars:**
```
CRON_SECRET=long-random-string            # verify Bearer on every /api/cron/* and webhook-less pull
APP_BASE_URL=https://helm.yourdomain.se   # used to build webhook callback URLs
```

### Anthropic Claude — the copilot  (🇸🇪 & 🌍 same pick)
- **Powers:** the daily "what needs you" briefing on `command`/`my-day`, **meeting briefs** (`meetings`), **document generation** from templates (`vault`), and **reading the AuditEvent export** to answer questions about the whole company (`audit` → "Export for AI"). Server-side only.
- **Sign up:** <https://console.anthropic.com> → **API Keys** → create key.
- **Current models (Jun 2026):** **`claude-opus-4-8`** (flagship, **$5 / $25** per 1M in/out tokens, **1M-token context by default**, released 2026-05-28) · `claude-sonnet-4-6` (workhorse ~$3/$15) · `claude-haiku-4-5` (cheap/fast ~$1/$5). Use **prompt caching** (~90% cheaper cached input) and the **Batch API** (50% off) for bulk jobs like re-summarizing the audit stream.
- **Env vars:**
```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-8
```

---

## 3. Per-capability credentials — all 27 modules

One row per capability. **Env var names are exactly what the API layer should read.** Webhook URLs assume `APP_BASE_URL` from §2. "🇸🇪 / 🌍" = Sweden pick / global default.

### Identity, people & access

| Powers (module) | 🇸🇪 pick | 🌍 default | Where to get it | Env var(s) | Scopes / webhook | Sweden specifics |
|---|---|---|---|---|---|---|
| **Employees, logins, roles** (`crew` access tab, `settings` profile, `HELM.session`, capability #1/#29) | **Supabase Auth** | Supabase Auth / Clerk / Auth0 | Supabase → *Authentication*; invite one user per team-seed person | reuses `SUPABASE_*` (above) | Email magic-link or password; store `role` + `permissions[]` on the `people` row; enforce with **RLS** + `HELM.session.can()` | Roles map to Swedish org reality (owner=CEO/firmatecknare, finance=ekonomiansvarig). Keep auth data in EU region. |

### Money — costs, accounting, VAT, revenue, bank

| Powers (module) | 🇸🇪 pick | 🌍 default | Where to get it | Env var(s) | Scopes / webhook | Sweden specifics |
|---|---|---|---|---|---|---|
| **Auto-bookkeeping + VAT/moms** (`ledger` auto-accounting feed + VAT panel, capability #3) | **Fortnox** (full API; market leader) | QuickBooks / Xero | <https://apps.fortnox.se/developer> → create integration → Client ID + Secret; OAuth2 → store **refresh token** | `FORTNOX_CLIENT_ID`, `FORTNOX_CLIENT_SECRET`, `FORTNOX_REFRESH_TOKEN` | OAuth2 auth-code → access(short) + refresh(stored); webhook/poll vouchers + VAT report → `Voucher`/`AuditEvent` | **Swedish org.nr required** to register. Display VAT from Fortnox; **don't compute tax yourself for filing** — Fortnox→Skatteverket is source of truth. Std moms 25% (12/6 reduced). BAS chart. |
| ↳ cheaper start | **Bokio** (free tier, 5k req/mo) | — | Bokio → *API Tokens → Create Private Integration*; docs `docs.bokio.se` | `BOKIO_API_TOKEN`, `BOKIO_COMPANY_ID` | read/write vouchers, fetch moms figure | SIE export/import standard supported. |
| **Revenue & payments** (`revenue`, `billing`, capability #4) | **Stripe** | Stripe | <https://dashboard.stripe.com> → Developers → API keys (test first) | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Webhook `→ {APP_BASE_URL}/api/webhooks/stripe`; events `invoice.paid`, `charge.succeeded`, `customer.subscription.*`, `payout.*` → `Payment`/`Invoice`/`AuditEvent` | **Klarna** is available **natively as a Stripe payment method** (enable in Dashboard) — no separate contract to start. **Swish** for SE checkout needs a bank **Swish-avtal** + TLS client cert (see below). |
| ↳ Swish (SE mobile pay) | **Swish Handel** | — | Sign Swish-avtal via business bank; appoint **CPOC**; generate TLS cert | `SWISH_PAYEE_ALIAS`, `SWISH_CERT_PATH`, `SWISH_CERT_PASSWORD`, `SWISH_CALLBACK_URL` | Callback `→ {APP_BASE_URL}/api/webhooks/swish` → `Payment` | Or onboard via an approved technical-supplier to skip per-merchant certs. |
| **Bank feed / cash** (`ledger` cash + runway, capability #4) | **Tink** (Stockholm, Visa-owned; 3,400+ EU banks incl. all Swedish) | **Plaid** (US/UK/EU) | <https://tink.com/get-started> → create app → client_id + secret | `TINK_CLIENT_ID`, `TINK_CLIENT_SECRET` *(or `PLAID_CLIENT_ID`,`PLAID_SECRET`,`PLAID_ENV`)* | Hosted PSD2/strong-auth bank-connect; daily cron pull → `bank_transactions`/`Payment` | PSD2 strong customer authentication; all major Swedish banks covered. |

### Customers, partners, sales, ops

| Powers (module) | 🇸🇪 pick | 🌍 default | Where to get it | Env var(s) | Scopes / webhook | Sweden specifics |
|---|---|---|---|---|---|---|
| **Customers / CRM** (`customers`, capability) | **Native** Supabase `customers` table | Native / HubSpot | — (sync Stripe + Fortnox customers in by external ID) | reuses `SUPABASE_*`; opt. `ROARING_API_KEY` | — | Store **organisationsnummer**; enrich via Bolagsverket / Roaring. Customers = personal data → deletion path. |
| **Partners / counterparties + logos** (`partners`, used by `ledger` & `audit`, capability #10/#15) | **Brandfetch** logo API + manual upload | Clearbit Logo API + manual upload | <https://brandfetch.com/developers> (or Clearbit) → API key | `BRANDFETCH_API_KEY` *(or `CLEARBIT_API_KEY`)* | fetch `logoUrl` by domain; fallback = manual upload to Supabase Storage | `logoUrl` shown in ledger rows, audit entries, partner directory. Store org.nr/VAT per partner. |
| **Pipeline** (`pipeline`) | **Native** Supabase | Native / Pipedrive (EU, Nordic-popular) | Pipedrive → *Settings → Personal → API → token* (only if not native) | `PIPEDRIVE_API_TOKEN` (optional) | mirror deals via webhook → `Deal` | — |
| **Inventory + orders** (`inventory`, `orders`) | **Shopify** (or WooCommerce) | Shopify | Shopify → *Develop apps → Admin API* | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_API_TOKEN`, `SHOPIFY_WEBHOOK_SECRET` | scopes `read_products`,`read_inventory`,`read_orders`; webhooks `products/update`,`inventory_levels/update`,`orders/create` → `inventory`/`orders` | Shipping via PostNord/Budbee/DHL or aggregator (Shipmondo/nShift). |
| **Projects / global task board** (`projects`, `my-day`, capability #17/#18) | **Native** Supabase `tasks` | Native / Linear / Asana | — (opt. Linear webhook mirror) | reuses `SUPABASE_*`; opt. `LINEAR_API_KEY` | drag → `Task.status` + `AuditEvent` | AI copilot reads tasks directly when native. |
| **Marketing / Signal** (`signal`) | Meta Ads + Google Ads APIs | same | Meta Business / Google Ads developer | `META_ADS_ACCESS_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN` | daily cron pull spend/ROAS → `signal` | — |
| **Product/web analytics** (`analytics`) | **PostHog** EU Cloud / **Plausible** (EU) | PostHog / GA4 | posthog.com (EU region) / plausible.io | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST=https://eu.posthog.com`, `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | client snippet → their cloud; query summaries | EU/cookieless options for GDPR. |

### Per-user mail + calendar (OAuth per employee)

| Powers (module) | 🇸🇪 pick | 🌍 default | Where to get it | Env var(s) | Scopes / webhook | Sweden specifics |
|---|---|---|---|---|---|---|
| **Per-employee Gmail + Calendar** (`inbox`, `calendar` — personal scope, re-render on `helm:user`, capability #5/#22) | **Google Workspace** | Microsoft 365 (Graph API) | <https://console.cloud.google.com> → new project → enable **Gmail API** + **Google Calendar API** → configure **OAuth consent screen** → create **OAuth client** (Web) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI={APP_BASE_URL}/api/auth/google/callback` | **One OAuth flow per employee**; store **per-user refresh token** (encrypted, keyed by `personId`). Scopes: `gmail.readonly` or `gmail.modify`, `gmail.send`, `calendar.events` (or `calendar.readonly`), `openid email profile`. Request `access_type=offline&prompt=consent` to get the refresh token. | **Gmail + Calendar scopes are "sensitive/restricted"** → Google **OAuth app verification** required before non-test users can connect (allow lead time; needs a published privacy policy + homepage). One client app; many per-user tokens. |

### In-app Slack

| Powers (module) | 🇸🇪 pick | 🌍 default | Where to get it | Env var(s) | Scopes / webhook | Sweden specifics |
|---|---|---|---|---|---|---|
| **Slack inside HELM — channels, DMs, calls** (`comms`, capability #6) | **Slack API** | Slack API | <https://api.slack.com/apps> → **Create New App** (from scratch). Enable **Socket Mode** (no public URL) **or** Events API (public endpoint). | `SLACK_BOT_TOKEN` (`xoxb-…`), `SLACK_APP_TOKEN` (`xapp-…`, Socket Mode), `SLACK_SIGNING_SECRET`, opt. `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET` (per-user OAuth) | **Bot token scopes:** `channels:read`, `channels:history`, `groups:history`, `im:history`, `mpim:history`, `chat:write`, `users:read`, `reactions:read`, `users:read.email`. **App-level token scope** (Socket Mode): `connections:write` (+ `authorizations:read`). **Events API endpoint** (if not Socket Mode) `→ {APP_BASE_URL}/api/webhooks/slack` subscribing `message.channels`, `message.im`, `reaction_added`, `presence_change`. | **Huddles/Calls = deep-links** (`slack://` / call URL), not an API record/recording — HELM opens them; recording a Slack Huddle goes through Recall.ai (below). **Migrate to a non-classic Slack app — classic apps end Nov 2026.** |

### Dev Log & Infra

| Powers (module) | 🇸🇪 pick | 🌍 default | Where to get it | Env var(s) | Scopes / webhook | Sweden specifics |
|---|---|---|---|---|---|---|
| **Every commit/push** (`devlog`, capability #7) | **GitHub** / **GitLab** | same | Repo (or org) → *Settings → Webhooks → Add webhook* | `GITHUB_WEBHOOK_SECRET` *(and/or `GITLAB_WEBHOOK_SECRET`)* | Payload URL `→ {APP_BASE_URL}/api/webhooks/github`; event **"Just the push event"** (+ optional deployment). Set a **Secret** → verify **`X-Hub-Signature-256`** (HMAC-SHA256, raw body, constant-time compare). GitLab: set **Secret token** header. → `DevLogEntry`/`AuditEvent` | — |
| **Deploy markers** (`devlog`, `infra` deploys) | **Vercel** + **Supabase** deploy hooks | same | Vercel → *Project → Settings → Git → Deploy Hooks* / integration webhooks; Supabase project webhooks | `VERCEL_DEPLOY_WEBHOOK_SECRET`, `SUPABASE_DEPLOY_WEBHOOK_SECRET` | Vercel sends `deployment.succeeded`/`.error` `→ {APP_BASE_URL}/api/webhooks/vercel` → `Deploy` | — |
| **Servers & infra metrics + incidents** (`infra`, capability #9) | **Better Stack** (EU-host-able) | **Datadog** / **Netdata** | betterstack.com (or datadoghq.eu / Netdata) → API token + alert webhook | `BETTERSTACK_API_TOKEN` *(or `DATADOG_API_KEY`+`DATADOG_APP_KEY`, or `NETDATA_API_TOKEN`)* | Monitor → CPU/mem/disk/uptime poll → `InfraNode.metrics`; alert webhook `→ {APP_BASE_URL}/api/webhooks/monitor` → `Incident`/`AuditEvent` | Choose EU region/host for monitor data. |

### Meetings: record → transcribe → brief

| Powers (module) | 🇸🇪 pick | 🌍 default | Where to get it | Env var(s) | Scopes / webhook | Sweden specifics |
|---|---|---|---|---|---|---|
| **Bot joins & records calls** (`meetings`, capability #22) | **Recall.ai** | Recall.ai | <https://recall.ai> → dashboard → API key (pick EU region if offered) | `RECALL_API_KEY`, `RECALL_REGION` | Create bot for a Meet/Zoom/Teams/**Slack Huddle** URL; status/`done` webhook `→ {APP_BASE_URL}/api/webhooks/recall` → `Meeting.recordingUrl` | Recall is SOC2/ISO27001/GDPR-compliant; **notify participants of recording** (Swedish/EU consent norms). |
| **Transcription** | **AssemblyAI** | AssemblyAI / **OpenAI Whisper** (self-host = no data egress) | assemblyai.com → API key | `ASSEMBLYAI_API_KEY` *(or self-host Whisper → no key)* | recording → transcript → `Meeting.transcript` | Self-hosted Whisper keeps audio in your EU infra. |
| **AI brief** | **Anthropic Claude** | same | reuses `ANTHROPIC_API_KEY` | — | transcript → `Meeting.brief{summary,actionItems}` → `vault` Document | — |

### Vitals (per-employee health) — ⚠️ updated since the earlier guide

| Powers (module) | 🇸🇪 pick | 🌍 default | Where to get it | Env var(s) | Scopes / webhook | Sweden specifics |
|---|---|---|---|---|---|---|
| **Wearable recovery/sleep/strain/HR** (`vitals`, capability #14) | **Whoop API** (per person) | Whoop API | <https://developer.whoop.com> → create app → Client ID + Secret | `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_REDIRECT_URI={APP_BASE_URL}/api/auth/whoop/callback` | **OAuth2 per employee**, store refresh token. Scopes (Whoop **v2**): `read:recovery`, `read:sleep`, `read:cycles`, `read:workout`, `read:profile`, `read:body_measurement`, **`offline`** (required to get a refresh token). Optional webhook `→ {APP_BASE_URL}/api/webhooks/whoop`. → `VitalsSample`/`DailyInsight` | Health data = **special-category personal data** under GDPR — explicit consent, EU storage, strict access (§7). |
| **Phone/watch fitness (cross-platform)** | **Apple HealthKit** export (iOS) | **Fitbit Web API** | Apple Developer (HealthKit entitlement, on-device export) / dev.fitbit.com → register app | `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`, `FITBIT_REDIRECT_URI` | Fitbit OAuth2 scopes `activity heartrate sleep profile`; HealthKit is on-device → app pushes samples to your API | **⚠️ Do NOT plan on Google Fit REST.** Google Fit APIs are **closed to new sign-ups (since 2024-05-01) and shut down late 2026.** Google's own guidance: **Health Connect** (Android), **Fitbit Web API** (cross-platform), **Apple HealthKit** (iOS). Use those instead of the deprecated Fit REST. |
| **Android on-device aggregation** | **Health Connect** | Health Connect | developer.android.com/health-connect (companion Android app) | — (on-device → your API) | read permissions per data type; app forwards to `{APP_BASE_URL}/api/vitals/ingest` | Replaces Google Fit on Android. |
| **Derived metrics** | client-side | client-side | — | — | BMR (Mifflin-St Jeor), TDEE, calories from `Person.body` + samples — computed in the browser, no key | — |

### E-sign, document generation, vault

| Powers (module) | 🇸🇪 pick | 🌍 default | Where to get it | Env var(s) | Scopes / webhook | Sweden specifics |
|---|---|---|---|---|---|---|
| **E-signature** (`vault` sign tab, capability #20) | **Scrive** + **BankID** | **DocuSign** / **Dropbox Sign** | <https://scrive.com> → account → API access token (eSign + eID Hub) | `SCRIVE_API_TOKEN`, `SCRIVE_API_SECRET` *(or `DOCUSIGN_*` / `DROPBOX_SIGN_API_KEY`)* | create document → add signers → send; status webhook `→ {APP_BASE_URL}/api/webhooks/esign` (sent/viewed/signed) → each step a `Document.signing` update + `AuditEvent` | Scrive is a **QTSP**: **Qualified Electronic Signatures via Swedish BankID**, eIDAS-compliant — the strongest legal assurance for SE/EU contracts. BankID authenticates the signer. |
| **Document generation from templates** (`vault` generate tab, capability #24) | template + **Claude** + PDF renderer | same | reuses `ANTHROPIC_API_KEY`; pick a PDF renderer | opt. `PDF_RENDERER_API_KEY` (if using a hosted renderer; else server-side Puppeteer/`@react-pdf` = no key) | pick template (Proposal/Contract/Invoice/NDA/Offer) + source record → Claude fills → render PDF → store in Supabase Storage → `Document` | — |

### Customer portal & notifications

| Powers (module) | 🇸🇪 pick | 🌍 default | Where to get it | Env var(s) | Scopes / webhook | Sweden specifics |
|---|---|---|---|---|---|---|
| **External customer portal** (`portal`, capability #27) | **Supabase external auth + RLS** | same | Supabase Auth (separate "external" role) | reuses `SUPABASE_*` | `PortalAccount` rows; **RLS scopes** so a customer sees only their own `sharedDocumentIds[]`; invite tokens | Customer logins isolated from staff; minimal scope. EU region. |
| **Notification delivery — email** (`settings` notif center → `Notification`, capability #11/#26) | **Brevo** (EU) or **Postmark** | **Resend** | brevo.com / postmarkapp.com / resend.com → API key | `RESEND_API_KEY` *(or `POSTMARK_SERVER_TOKEN` / `BREVO_API_KEY`)*, `EMAIL_FROM=notify@yourdomain.se` | send per `notificationPrefs.email`; configure **SPF/DKIM/DMARC** on the domain | EU sending region for GDPR; verify domain. |
| **Notification delivery — Slack DM** | reuses Slack app | same | reuses `SLACK_BOT_TOKEN` | — | `chat.postMessage` to user per `notificationPrefs.slack` | — |
| **Notification delivery — web push** | **VAPID** (self-hosted Web Push) | same | generate a VAPID keypair (`web-push generate-vapid-keys`) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:notify@yourdomain.se`; `NEXT_PUBLIC_VAPID_PUBLIC_KEY` for the browser | browser subscribes (service worker) → push per `notificationPrefs.push` | No third-party; keys self-generated. |

### Audit — the keystone (no external key)

| Powers (module) | Pick | Where | Env var(s) | Notes |
|---|---|---|---|---|
| **Immutable everything-log** (`audit`, capability #16) | **Supabase** append-only `audit_events` table | reuses `SUPABASE_*` | — | Every record-mutating action across all 27 modules calls `HELM.audit.log()` → one `AuditEvent` (per BUILD-PLAN §D shape: `ts, actorId, action, entityType, entityId, summary, before, after, links[], hashPrev, hashSelf`). Hash-chain for tamper-evidence; **DB policy: INSERT-only, no UPDATE/DELETE**. "Export for AI" emits the whole stream as NDJSON for Claude. |

**Modules covered with no new credential** (read your own Supabase tables only): `command` (overview overlay + pulse — rolls up other tables; KPI snapshot via Vercel Cron), `my-day` (Tasks/Meetings/Notifications/Vitals for the acting user), `automations` (webhook-driven rules; opt. `AUTOMATION_WEBHOOK_URL` for outbound to n8n/Make/Zapier), `integrations` (control panel that stores connection state + which person connected each per-user OAuth), `settings` (org/company records + per-person `notificationPrefs`).

---

## 4. Consolidated `.env.example`

```dotenv
# ════════════════════════════════════════════════════════════════
#  HELM — environment variables, grouped by service
#  Anything the browser reads MUST be prefixed NEXT_PUBLIC_.
#  Everything else stays server-side (API layer only).
# ════════════════════════════════════════════════════════════════

# ── Foundation: Supabase (Auth + Postgres + Storage, EU/Frankfurt) ──
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key            # SERVER ONLY

# ── Hosting / jobs: Vercel ──────────────────────────────────────
CRON_SECRET=long-random-string-for-cron-and-pull-auth
APP_BASE_URL=https://helm.yourdomain.se

# ── AI copilot: Anthropic Claude ────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
ANTHROPIC_MODEL=claude-opus-4-8

# ── Revenue & payments: Stripe (Klarna via Stripe) ──────────────
STRIPE_SECRET_KEY=sk_live_xxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxx

# ── Swish (Sweden mobile payments) ──────────────────────────────
SWISH_PAYEE_ALIAS=123XXXXXXX
SWISH_CERT_PATH=/secrets/swish.pem
SWISH_CERT_PASSWORD=xxxxxxxx
SWISH_CALLBACK_URL=https://helm.yourdomain.se/api/webhooks/swish

# ── Bookkeeping + VAT/moms: Fortnox (or Bokio) ──────────────────
FORTNOX_CLIENT_ID=xxxxxxxx
FORTNOX_CLIENT_SECRET=xxxxxxxx
FORTNOX_REFRESH_TOKEN=xxxxxxxx
# BOKIO_API_TOKEN=xxxxxxxx
# BOKIO_COMPANY_ID=xxxxxxxx

# ── Bank feed: Tink (Plaid = global swap-in) ────────────────────
TINK_CLIENT_ID=xxxxxxxx
TINK_CLIENT_SECRET=xxxxxxxx
# PLAID_CLIENT_ID=xxxxxxxx
# PLAID_SECRET=xxxxxxxx
# PLAID_ENV=production

# ── Per-user mail + calendar: Google Workspace (per-employee OAuth)
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxxxxx
GOOGLE_REDIRECT_URI=https://helm.yourdomain.se/api/auth/google/callback
# scopes: gmail.modify gmail.send calendar.events openid email profile
# refresh token stored per personId (access_type=offline&prompt=consent)

# ── In-app Slack: Web API + Socket Mode/Events ──────────────────
SLACK_BOT_TOKEN=xoxb-xxxxxxxx
SLACK_APP_TOKEN=xapp-xxxxxxxx            # Socket Mode (scope: connections:write)
SLACK_SIGNING_SECRET=xxxxxxxx
# SLACK_CLIENT_ID=xxxxxxxx               # only for per-user OAuth
# SLACK_CLIENT_SECRET=xxxxxxxx

# ── Dev Log: GitHub / GitLab push webhooks ──────────────────────
GITHUB_WEBHOOK_SECRET=xxxxxxxx           # verify X-Hub-Signature-256
# GITLAB_WEBHOOK_SECRET=xxxxxxxx
# Deploy markers:
VERCEL_DEPLOY_WEBHOOK_SECRET=xxxxxxxx
SUPABASE_DEPLOY_WEBHOOK_SECRET=xxxxxxxx

# ── Infra monitoring: Better Stack (or Datadog / Netdata) ───────
BETTERSTACK_API_TOKEN=xxxxxxxx
# DATADOG_API_KEY=xxxxxxxx
# DATADOG_APP_KEY=xxxxxxxx
# NETDATA_API_TOKEN=xxxxxxxx

# ── Meetings: Recall.ai + AssemblyAI (brief via Claude above) ───
RECALL_API_KEY=xxxxxxxx
RECALL_REGION=eu
ASSEMBLYAI_API_KEY=xxxxxxxx
# (or self-host Whisper → no key)

# ── Vitals: Whoop (per-employee) + Fitbit (cross-platform) ──────
WHOOP_CLIENT_ID=xxxxxxxx
WHOOP_CLIENT_SECRET=xxxxxxxx
WHOOP_REDIRECT_URI=https://helm.yourdomain.se/api/auth/whoop/callback
# scopes: read:recovery read:sleep read:cycles read:workout read:profile read:body_measurement offline
FITBIT_CLIENT_ID=xxxxxxxx
FITBIT_CLIENT_SECRET=xxxxxxxx
FITBIT_REDIRECT_URI=https://helm.yourdomain.se/api/auth/fitbit/callback
# NOTE: Google Fit REST is deprecated (EOL late 2026) — use Fitbit / HealthKit / Health Connect.

# ── E-sign: Scrive + BankID (or DocuSign / Dropbox Sign) ────────
SCRIVE_API_TOKEN=xxxxxxxx
SCRIVE_API_SECRET=xxxxxxxx
# DOCUSIGN_INTEGRATION_KEY=xxxxxxxx
# DOCUSIGN_SECRET_KEY=xxxxxxxx
# DROPBOX_SIGN_API_KEY=xxxxxxxx

# ── Document generation (PDF renderer; optional if self-rendering)
# PDF_RENDERER_API_KEY=xxxxxxxx

# ── Partner logos: Brandfetch (or Clearbit) ─────────────────────
BRANDFETCH_API_KEY=xxxxxxxx
# CLEARBIT_API_KEY=xxxxxxxx

# ── Notifications: email (Resend / Postmark / Brevo) ────────────
RESEND_API_KEY=re_xxxxxxxx
# POSTMARK_SERVER_TOKEN=xxxxxxxx
# BREVO_API_KEY=xkeysib-xxxxxxxx
EMAIL_FROM=notify@yourdomain.se

# ── Notifications: web push (VAPID, self-generated) ─────────────
VAPID_PUBLIC_KEY=xxxxxxxx
VAPID_PRIVATE_KEY=xxxxxxxx
VAPID_SUBJECT=mailto:notify@yourdomain.se
NEXT_PUBLIC_VAPID_PUBLIC_KEY=xxxxxxxx

# ── Optional connectors ─────────────────────────────────────────
# SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
# SHOPIFY_ADMIN_API_TOKEN=shpat_xxxxxxxx
# SHOPIFY_WEBHOOK_SECRET=xxxxxxxx
# PIPEDRIVE_API_TOKEN=xxxxxxxx
# LINEAR_API_KEY=xxxxxxxx
# META_ADS_ACCESS_TOKEN=xxxxxxxx
# GOOGLE_ADS_DEVELOPER_TOKEN=xxxxxxxx
# NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxx
# NEXT_PUBLIC_POSTHOG_HOST=https://eu.posthog.com
# NEXT_PUBLIC_PLAUSIBLE_DOMAIN=yourdomain.se
# ROARING_API_KEY=xxxxxxxx
# AUTOMATION_WEBHOOK_URL=https://hooks.zapier.com/xxxxxxxx
```

> Put real values in **Vercel → Project → Settings → Environment Variables** plus a git-ignored `.env.local`. Browser-needed values get `NEXT_PUBLIC_`; everything else stays server-side. For per-user OAuth (Google, Whoop), the *client* credentials are env vars but each employee's *refresh token* is stored encrypted in the DB keyed by `personId` — never in env.

---

## 5. Webhooks to register

Each external system POSTs to a HELM endpoint in the API layer. Every handler **verifies the signature**, writes/updates the domain record, **and** appends an `AuditEvent`. All URLs are relative to `APP_BASE_URL`.

| Endpoint HELM exposes | Source / how to register | Verify with | Creates / updates record | AuditEvent `action` |
|---|---|---|---|---|
| `POST /api/webhooks/stripe` | Stripe Dashboard → Developers → Webhooks; events `invoice.paid`, `charge.succeeded`, `customer.subscription.*`, `payout.*` | `STRIPE_WEBHOOK_SECRET` (signature header) | `Payment` (in), `Invoice.status`, revenue rows | `payment.created`, `invoice.paid` |
| `POST /api/webhooks/swish` | Swish callback URL in your Swish-handel config | TLS client cert (`SWISH_CERT_*`) | `Payment` (in) | `payment.created` |
| `POST /api/webhooks/fortnox` *(or poll)* | Fortnox integration; vouchers/VAT updates | OAuth token | `Voucher` (auto-accounting), VAT draft | `voucher.posted`, `vat.drafted` |
| *(cron pull)* `POST /api/cron/tink` | Vercel Cron daily → pulls Tink | `CRON_SECRET` Bearer | `bank_transactions`, `Payment` | `bank.synced` |
| `POST /api/webhooks/github` | Repo/org → Settings → Webhooks; "Just the push event" + secret | **`X-Hub-Signature-256`** HMAC-SHA256 (`GITHUB_WEBHOOK_SECRET`), constant-time | `DevLogEntry` (one per push) | `commit.pushed` |
| `POST /api/webhooks/gitlab` | GitLab project → Webhooks; Push events + secret token | `GITLAB_WEBHOOK_SECRET` header | `DevLogEntry` | `commit.pushed` |
| `POST /api/webhooks/vercel` | Vercel deploy hook / integration; `deployment.succeeded`/`.error` | `VERCEL_DEPLOY_WEBHOOK_SECRET` | `Deploy` | `deploy.succeeded` / `deploy.failed` |
| `POST /api/webhooks/slack` | Slack app → Event Subscriptions (if not Socket Mode); `message.*`, `reaction_added`, `presence_change` | `SLACK_SIGNING_SECRET` | `Message`, `Channel.unreadByUser`, presence | `message.posted`, `presence.changed` |
| `POST /api/webhooks/monitor` | Better Stack / Datadog / Netdata alert webhook | shared secret / token | `Incident`, `InfraNode.status` | `incident.opened` / `incident.resolved` |
| `POST /api/webhooks/recall` | Recall.ai bot status webhook | `RECALL_API_KEY` / signature | `Meeting.recordingUrl`, transcript status | `meeting.recorded`, `meeting.transcribed` |
| `POST /api/webhooks/esign` | Scrive / DocuSign / Dropbox Sign callback; sent/viewed/signed | provider signature | `Document.signing.signers[].status` | `doc.sent`, `doc.viewed`, `doc.signed` |
| `POST /api/webhooks/whoop` *(optional)* | Whoop app webhook (else poll per user) | Whoop signature | `VitalsSample`, `DailyInsight` | `vitals.synced` |
| `POST /api/webhooks/shopify` *(if e-com)* | Shopify webhooks; `orders/create`, `inventory_levels/update` | `SHOPIFY_WEBHOOK_SECRET` (HMAC) | `orders`, `inventory_levels` | `order.created`, `inventory.changed` |

> **Golden rule for every handler:** verify signature → upsert the domain record → `HELM.audit.log(...)` → generate `Notification`s per each recipient's `notificationPrefs`. **No silent mutations.**

---

## 6. Architecture note — minimal live stack

```
                          ┌──────────────────────────────┐
   Browser (HELM UI) ───► │  Vercel (frontend + API)     │
   reads ONLY your tables └───────────────┬──────────────┘
                                          │ server-side (holds ALL secrets)
                          ┌───────────────▼──────────────┐
                          │  Thin API layer              │
                          │  Next.js API routes  ──OR──   │
                          │  Supabase Edge Functions      │
                          └───┬───────────────────┬───────┘
            webhooks in       │                   │   pulls (Vercel Cron)
   Stripe·Swish·GitHub/GitLab │                   │   Tink·Fortnox·Google
   Slack·Recall·e-sign·Vercel │                   │   Whoop·ads·monitors
   ·monitors·Shopify ────────►│                   │◄──────────────────────
                          ┌───▼───────────────────▼──────┐
                          │  Supabase (EU / Frankfurt)   │
                          │  Auth · Postgres · Storage   │
                          │  RLS · Vault (secrets)       │
                          │  audit_events (INSERT-only)  │
                          └──────────────────────────────┘
```

- **Supabase (EU/Frankfurt)** = Auth + Postgres + Storage. One table per BUILD-PLAN §D record type; RLS scopes rows to org/user; `audit_events` is **INSERT-only**.
- **Thin API layer** holds every secret, receives all **webhooks**, runs all **cron pulls**. The UI never holds a secret and never calls an external API.
- **The invariant that makes the AI work:** *every external event becomes a domain record AND an `AuditEvent` (source-tagged).* The Flight Log, Command Pulse, and `audit` stream are all **views** over the same append-only log. The "Export for AI" action emits the full stream as NDJSON — the single artifact Claude reads to understand the entire company end-to-end. Swap mock JSON for `select`s against these tables, module by module, in the §1 order.

---

## 7. Data residency & GDPR

- **EU region everywhere.** Supabase project in **Frankfurt (`eu-central-1`)**; choose EU regions/hosts for PostHog, Plausible, Better Stack, Brevo, Recall.ai, and any other processor that offers one. Don't sync PII into US-only tools without an adequacy decision or SCCs.
- **Sign a DPA** (Data Processing Agreement) with **every** processor that touches personal data: Supabase, Stripe, Fortnox/Bokio, Tink, Google, Slack, Recall.ai, AssemblyAI, Whoop, Scrive, your email provider. Keep them on file.
- **BankID & e-sign.** Scrive's BankID/QES flow is eIDAS-qualified and is the strongest legal basis for SE/EU contracts. BankID processes Swedish personal numbers — keep that data in-EU and minimize retention.
- **Vitals = special-category (health) data.** Whoop/Fitbit/HealthKit recovery, sleep, HR and HRV are **GDPR Article 9 special-category data.** Require **explicit, revocable opt-in per employee**, store in the EU, restrict access (RLS so only the person — and not by default managers — can read their own vitals), and never use it for employment decisions. Offer a one-click disconnect that deletes stored samples.
- **Right to erasure.** Every personal-data table needs a working delete/anonymize path. The **`audit_events` log is the deliberate exception** (immutable, hash-chained) — keep audit entries pseudonymized (store `personId`, not raw PII in `summary` where avoidable) so erasure of a person doesn't require rewriting the tamper-evident chain.
- **Bookkeeping retention.** Swedish *bokföringslagen* requires keeping accounting records **7 years** — Fortnox/Bokio satisfy this; don't delete financial records to satisfy an erasure request (legal-obligation basis overrides).
- **Secrets.** Store per-user refresh tokens and provider secrets in **Supabase Vault** or server-side encryption — never in a browser-readable row. The `integrations` table shows only `connected/disconnected` + which person connected it.

---

*Hand this document, plus `BUILD-PLAN.md` and `WIRING-GUIDE.md`, to whoever wires the backend. Start at §1 step 1 and don't skip the order — each step unlocks the next.*
