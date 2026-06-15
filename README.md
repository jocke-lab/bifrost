# Bifrost

The operating system for the whole company — *the bridge for your whole company.*

A single, calm command deck with modules for finance, sales, customers, operations,
team, comms, growth, platform and more, plus a per-person workspace (My Day, Vitals,
notifications) and an immutable audit log of everything.

## Stack (going live)
- **Frontend** — this static app (vanilla HTML/CSS/JS). Opens by double-clicking `index.html`.
- **Backend** — [Supabase](https://supabase.com) (EU / Frankfurt): Postgres + Auth + Storage.
  - Project: `Bifrost` (`zgvqnaorhtafqffzagll`), region `eu-central-1`.
  - Schema: see migration `init_bifrost_schema` (21 tables, RLS enabled, `logos`/`documents`/`avatars` buckets).
- **Hosting** — [Vercel](https://vercel.com).
- Public client config lives in `assets/bifrost.config.js` (publishable key only — RLS-protected).
- **Secrets** (service_role, Stripe, Fortnox, Slack, etc.) live in Vercel env vars — never in this repo.

## Docs
- `APIS-AND-CREDENTIALS.md` — every API/service + env var + webhook (Sweden-first).
- `BUILD-PLAN.md` — architecture + data model (maps 1:1 to the Supabase tables).
- `WIRING-GUIDE.md` — per-module wiring detail.

## Local
Just open `index.html`. No build step.
