# Bifrost — GO LIVE runbook

Everything backend is **done**. This covers the few steps that need a browser/your accounts.
Pick the deploy path, add the domain, set the DNS, set env vars. ~10 minutes.

- Supabase project: **Bifrost** `zgvqnaorhtafqffzagll` — EU/Frankfurt, schema applied, RLS on.
- Project URL: `https://zgvqnaorhtafqffzagll.supabase.co`
- App folder (already a git repo, committed): `C:\Users\Jocke\Desktop\HELM`

---

## 1) Deploy the app

### Option A — fastest (Vercel CLI, no GitHub needed)
In a terminal:
```
cd C:\Users\Jocke\Desktop\HELM
npx vercel login        # opens browser, log in with your Google
npx vercel --prod       # name it "bifrost", framework = Other, root = ./
```
You'll get a live `https://bifrost-xxxx.vercel.app` URL immediately.

### Option B — GitHub + Vercel (recommended for auto-deploys)
1. Create an **empty private** repo at https://github.com/new named **`bifrost`** (no README).
2. Push (the folder is already committed locally):
   ```
   cd C:\Users\Jocke\Desktop\HELM
   git remote add origin https://github.com/jocke-lab/bifrost.git
   git push -u origin main
   ```
   (Use GitHub Desktop if the CLI asks for auth, or a token with **Contents: write**.)
3. In Vercel → **Add New → Project → Import** `jocke-lab/bifrost`. Framework preset = **Other**. Deploy.

> Note: the token you pasted is fine-grained without "create repository" rights, which is why the repo must be created once by you. After that, pushes work.

---

## 2) Add your domain in Vercel
Vercel → your **bifrost** project → **Settings → Domains** → add **both**:
- `bifrost.<your-tld>`  (apex)
- `www.bifrost.<your-tld>`

Vercel will then show the DNS records to set. They are the standard ones below.

---

## 3) GoDaddy DNS — exactly what to set
GoDaddy → **My Products → your domain → DNS / Manage DNS**.

| Action | Type | Name | Value | TTL |
|---|---|---|---|---|
| **Edit/replace** the existing `@` A record | **A** | `@` | `76.76.21.21` | 600 |
| **Add** | **CNAME** | `www` | `cname.vercel-dns.com` | 600 |

Then:
- **Delete** any GoDaddy default **A `@` → "Parked"** record and any **Forwarding** on the domain (Settings → Forwarding) — those fight the new A record.
- **DO NOT touch the `MX` records** (those run your email — leaving them keeps email working).
- Leave any existing `TXT` (SPF/verification) records alone.

Propagation: usually a few minutes, up to ~1 hour. Vercel auto-issues the HTTPS cert once it sees the records.

> If you'd rather hand Vercel the whole domain: in GoDaddy set the **nameservers** to `ns1.vercel-dns.com` / `ns2.vercel-dns.com` instead of the A/CNAME above — BUT that moves *all* DNS (incl. email/MX) to Vercel, so only do this if you don't use the domain for email. The A/CNAME method above is safer.

---

## 4) Vercel environment variables
Vercel → project → **Settings → Environment Variables** (scope: Production + Preview).

Public (also already in `assets/bifrost.config.js`, safe):
```
NEXT_PUBLIC_SUPABASE_URL = https://zgvqnaorhtafqffzagll.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = sb_publishable_lgI1O2aderasrvjazJZSPw_Oul6pHvx
```
Server-only secrets (NEVER in the repo — paste from the dashboards):
```
SUPABASE_SERVICE_ROLE_KEY = <your NEW service_role key from Supabase → Settings → API>
# later, as you wire integrations:
STRIPE_SECRET_KEY = ...
FORTNOX_ACCESS_TOKEN = ...
ANTHROPIC_API_KEY = ...
```
(Full list in `APIS-AND-CREDENTIALS.md`.)

---

## 5) Supabase auth URLs
Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://bifrost.<your-tld>`
- **Redirect URLs**: add `https://bifrost.<your-tld>/**` and `https://www.bifrost.<your-tld>/**`

This makes employee logins (magic links / OAuth) redirect back to your domain.

---

## 6) Security — do this now
- **Rotate** the GitHub token and the Supabase `service_role` key you pasted in chat (regenerate both). Put the new service_role key only in Vercel env (step 4), never in a file or chat.

---

## What's already done for you
- ✅ Database schema (21 tables, RLS, storage buckets) in the EU project.
- ✅ App committed to git locally with README, `vercel.json`, `.gitignore`.
- ✅ `assets/bifrost.config.js` wired to the DB with the publishable key.
- ⏭️ Next after live: wire the UI to Supabase (auth + live reads/writes) — a separate build.
