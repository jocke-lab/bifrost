# HELM — BUILD PLAN

**Operating system for the whole company.** Vanilla HTML/CSS/JS, zero build step, opens by double-clicking `index.html`.
This document turns the new feature spec into a precise, buildable plan that other engineers can each implement one module at a time against the existing HELM contract.

> **The contract (do not break it).** Every module calls `HELM.register({id,label,icon,render})`. `render(root)` runs **lazily, once**, into the pre-declared `<section id="view-{id}">`. Modules use **only** the documented component classes + `HELM.charts/fmt/data/toast/el/count`. Modules **never** inject fonts/colors/global CSS and **never** touch another module's DOM. The dock, tape, flight log, ⌘K palette, accent themes, profile chip, boot and background canvas are **shell-owned** (`core.js` / `index.html`).
>
> **What's net-new at the shell level:** there is currently **no `HELM.session`**. The identity layer (Section A) is the one piece that must land **first** and is the only change to `core.js` + `index.html` that everything else depends on. After that, modules are independent files and can be built in parallel.

---

## A) IDENTITY & SESSION LAYER  *(shell — build FIRST)*

This is the spine. "Logged in as a person" is a real object in the shell that every personal module and notification reads from. It is mock/local for now (no real auth) but shaped so a real backend slots in unchanged.

### A.1 `HELM.session` (new in `core.js`)
A small shell-owned singleton. **Additive only** — does not change any existing public method.

```js
HELM.session = {
  user,                       // the acting Person record (see Data Model)
  org,                        // the Company/Org record (single tenant for now)
  team: [],                   // all Person records (seed below)
  is(role),                   // 'owner'|'admin'|'finance'|'member'|'viewer' → bool (>= gate)
  can(permission),            // 'ledger.write','crew.manage','payroll.run', … → bool
  presence,                   // 'available'|'focus'|'meeting'|'away' for the acting user
  switchUser(id),             // re-point user, persist, fire 'helm:user'
  setPresence(state),         // update + fire 'helm:presence'
  on(evt, fn)                 // 'helm:user' | 'helm:presence' | 'helm:notify'
};
```

- **Persistence:** `localStorage['helm.session']` holds `{userId, presence}` only. Team/org are seeded deterministically via `HELM.data` so the app still opens cold by double-click.
- **Events:** `switchUser()` dispatches a `helm:user` CustomEvent on `document`. **Personal modules re-render on it** (see A.4). Company modules ignore it.
- **Permission model:** role rank `owner(5) > admin(4) > finance(3) > member(2) > viewer(1)`. `is(role)` = rank-gte. `can(permission)` maps fine-grained perms to a minimum role + per-person overrides stored on the Person record (`permissions[]`). The shell exposes `HELM.session.can()`; modules **call it to gate buttons** (disable + tooltip "needs Finance role"), never to hide whole modules unless `viewer`.

### A.2 Person switcher (on the existing profile chip)
The topbar already has `.profile-chip` (`index.html` line ~95). Wire it (in `core.js` `wireShell()`) to open a small **identity popover**: avatar list of `team`, current presence selector (Available / Focus / In a meeting / Away), "View my profile" → `settings`, and a role badge. Selecting a person calls `HELM.session.switchUser(id)`; the chip's `.av` initials + name update live. This is the single control that the spec's capability #29 demands.

### A.3 Notification bell → real center
The bell (`icon-btn[data-act="bell"]`) currently just toasts. Re-point it to open the **Notification Center** drawer (a shell-owned overlay, same pattern as `.cmdk`), fed by `HELM.session.user`'s notifications. Per-person tuning lives in `settings` (capability #11/#26); the bell only **renders** what the active user is subscribed to. Badge count = unread for the acting user.

### A.4 PERSONAL vs COMPANY modules
The shell tags each module at registration. Modules pass an optional `scope:'personal'|'company'` to `register()` (defaults `'company'`; **back-compatible** — existing 18 modules omit it and stay company-wide). Personal modules subscribe to `helm:user`/`helm:presence` and re-render their root when the acting user changes.

| Scope | Modules |
|---|---|
| **PERSONAL** (re-render on user switch) | `my-day`, `vitals`, `inbox`, `calendar`, `comms` (active DMs/unread), parts of `settings` (profile + my notifications) |
| **COMPANY** (same for everyone, role-gated writes) | `command`, `ledger`, `revenue`, `billing`, `customers`, `pipeline`, `inventory`, `orders`, `projects`, `crew`, `signal`, `analytics`, `automations`, `integrations`, `vault`, `partners`, `devlog`, `infra`, `audit`, `meetings`, `portal` |

> Implementation note for the shell: in `show(id)`, when a personal module is shown after a `helm:user` event, clear `mod.rendered=false` and empty its `<section>` so `render()` re-runs for the new user. Provide a tiny helper `HELM.rerender(id)` so personal modules can also self-refresh.

### A.5 The team seed (deterministic, in `core.js`)
Eight people so every personal feature has texture. Org = the existing fictional Swedish company.

| id | Name | Role | Title | Accent emoji | Mail identity |
|---|---|---|---|---|---|
| `u-arvid` | Arvid Arvidsson | owner | Founder / CEO | 🜨 | arvid@northwind-helm.se |
| `u-mira` | Mira Lindqvist | admin | COO | ✦ | mira@… |
| `u-ola` | Ola Forsberg | finance | Head of Finance | ▲ | ola@… |
| `u-sofia` | Sofia Berg | member | Head of Sales | ◆ | sofia@… |
| `u-noah` | Noah Ek | member | Lead Engineer | ⬡ | noah@… |
| `u-lena` | Lena Holm | member | Ops & Logistics | ◈ | lena@… |
| `u-kai` | Kai Nyström | member | Marketing | ✧ | kai@… |
| `u-isa` | Isa Dahl | viewer | Customer Success | ○ | isa@… |

Org seed: **Northwind Labs AB**, org.nr `559123-4567`, VAT `SE559123456701`, Norrköping SE, fiscal currency `SEK` (display `kr`/`$` via `HELM.fmt`), Fortnox + Stripe + Tink "connected" (mock).

---

## B) MODULE MAP  (final list)

**9 new modules** join the existing 18 → **27 modules**. New: `my-day`, `comms`, `partners`, `devlog`, `infra`, `vitals`, `audit`, `meetings`, `portal`. The "company overview overlay" and "pulse feed" are built **into `command`** (overlay) — not separate modules. E-sign + doc-gen live in `vault`; payroll/HR/presence live in `crew`; notification control center + profile + company records live in `settings`.

### Final module table

| id | label | icon | scope | one-line purpose | key sections |
|---|---|---|---|---|---|
| `my-day` | My Day | ☀️ | personal | The page each person opens every morning | My tasks · Approvals waiting on me · Today's meetings · Follow-ups due · Unread that matter · Focus toggle |
| `command` | Command Deck | 🛰️ | company | Is the ship okay? + **Company Overview overlay** + **Pulse feed** | Health ring · telemetry · vitals · needs-you · **⤢ Overview overlay** · **Pulse** |
| `ledger` | Ledger | 📒 | company | Cash, costs (fixed+variable+source), auto-bookkeeping, VAT | Cash · **Costs (fixed/variable + vendor)** · **Auto-accounting feed** · **VAT/moms** · runway |
| `revenue` | Revenue | 📈 | company | Register & analyse all revenue streams | MRR · streams · register-revenue · cohorts |
| `billing` | Billing | 🧾 | company | Invoices, AR, dunning | Invoices · overdue · dunning · DSO |
| `customers` | Customers | 👥 | company | The people/companies we sell to | Accounts · health · CSAT · → portal link |
| `partners` | Partners | 🤝 | company | **Every counterparty** (buy/sell/deal) **with logo** | Directory (logos) · vendors · buyers · per-partner history · used by ledger+audit |
| `pipeline` | Pipeline | 🎯 | company | Deals in flight | Board · stages · forecast |
| `inventory` | Inventory | 📦 | company | Stock & SKUs | Stock · par levels · reorder |
| `orders` | Orders | 🚚 | company | Fulfilment | Queue · shipping · returns |
| `projects` | Projects | 🗂️ | company | **Global Trello board of ALL company tasks** | **Global board** · per-person swimlanes · assign · my-tasks filter |
| `crew` | Crew | 🧑‍🚀 | company | **Employees, access, payroll, HR, presence** | Roster · **access/roles/invite/deactivate** · **payroll** · **HR (leave/docs)** · **presence** |
| `signal` | Signal | 📡 | company | Marketing/ads performance | Channels · ROAS · campaigns |
| `analytics` | Analytics | 🔬 | company | Product & web analytics | Funnels · retention · events |
| `calendar` | Calendar | 📅 | personal | **Per-person Google Calendar** + meeting create | My calendar · team layer · **create meeting → record** |
| `inbox` | Inbox | 📥 | personal | **Per-person company mail + Gmail** | My mailbox · threads · send · triage |
| `comms` | Comms | 💬 | personal* | **Slack inside HELM** — channels, DMs, calls | Channels · DMs · composer · **join call** · presence sync |
| `meetings` | Meetings | 🎥 | company | Recorded, transcribed, briefed calls kept as files | Upcoming · **recordings** · **transcripts** · AI brief · → vault |
| `automations` | Automations | ⚙️ | company | Rules that fire on events | Rules · runs · templates |
| `integrations` | Integrations | 🔌 | company | **All connectors** (per-user OAuth + company) | Connected · per-user mail/cal · Slack · GitHub · monitors · finance |
| `devlog` | Dev Log | 📟 | company | **Every commit/change across all repos/platforms** | Feed · per-repo · per-platform · deploy markers |
| `infra` | Infra | 🖥️ | company | **Servers & computers** — uptime, CPU/mem/disk, deploys, incidents | Fleet · metrics · deploys · incidents · status page |
| `vitals` | Vitals | 💗 | personal | **Per-employee health** (Whoop/Google Fit), insights, BMR/calories | Today (HR/HRV/sleep/strain) · body (wt/ht/age→BMR/TDEE) · calendar stress flags · trends |
| `vault` | Vault | 🗄️ | company | Documents + **e-sign** + **doc generation from templates** | Files · **generate (proposal/contract/invoice)** · **sign/e-sign** · templates |
| `portal` | Customer Portal | 🪟 | company | External-facing: customer accounts & what they see | Portal accounts · invites · client view preview · shared docs |
| `audit` | Audit Log | 🛡️ | company | **Immutable everything-log, AI-readable** | Stream · filters (actor/entity/action) · entity timeline · export-for-AI |
| `settings` | Settings | ⚙️ | personal+company | **Profile + Notification Control Center + Company Records** | My profile · **my notifications** · org/company records · team defaults · theme |

\* `comms` is "personal" in that the active DMs/unread reflect the acting user, but channels are company-wide.

### Dock order & grouping
The dock scrolls (`overflow-y:auto`, `core.css` line ~131). Introduce **group dividers** (a thin `.dock-div` — see C/shell note) so 27 items stay legible. Order:

```
[H mark]
— PERSONAL —      my-day · vitals
— MONEY —         command · ledger · revenue · billing
— CUSTOMERS —     customers · partners · pipeline
— OPS —           inventory · orders · projects
— PEOPLE —        crew · meetings
— COMMS —         comms · inbox · calendar
— GROWTH —        signal · analytics
— PLATFORM —      automations · integrations · devlog · vault · portal
— SYSTEM —        infra · audit · (spacer) · settings (pinned bottom)
```

`my-day` sits at the very top (default landing for a logged-in person). `command` stays the company-wide default when no user context. `settings` stays pinned at the dock bottom as today.

---

## C) ENHANCEMENTS TO EXISTING MODULES

Each enhancement is written so the assigned engineer touches **only that module's `.js`/`.css`** (plus, for the shell items, the clearly-scoped `core.js`/`index.html` edits in Section A).

### `command` — Company Overview overlay + Pulse feed
- **Overview overlay** (capability #8): a full-stage **⤢ overlay** (own shell-level overlay like `.cmdk`, opened from a "Company Overview" button in the view-head and from ⌘K). Beautiful single canvas: a **value-flow map** (where revenue is generated → channels → segments → net), org-wide KPIs, a live map of every subsystem (finance/sales/ops/people/platform) each linking to its module. Built from `HELM.charts` (area/donut/bars/gauge) + the existing `.card/.kpi/.attn` kit. Pulls read-only numbers from the same seeds the modules use.
- **Pulse feed** (capability #19): a "Company Pulse" card on the deck — deals closed, new hires, things shipped, milestones — sourced from the **AuditEvent** stream filtered to "celebration-worthy" event types. Live-prepend like the flight log.
- New: `command.css` overview-overlay styles; `command.js` builds overlay lazily on first open.

### `ledger` — costs, sources, auto-accounting, VAT (capabilities #2, #3, #4-partial)
- **Costs section:** add-cost form (amount, category, **fixed vs variable** toggle, **source/vendor → Partner picker**, date, VAT rate). Two ledgers: recurring fixed costs (rent, SaaS, salaries handle-off to crew/payroll) and variable/"moving" costs. Each row shows the **partner logo** (from `partners`).
- **Auto-accounting feed:** a stream of **auto-posted double-entry vouchers** (debit/credit accounts per Swedish BAS-style chart) generated from every Payment/Cost/Invoice. Read-only "what the system booked" with a confidence pill; manual override gated by `can('ledger.write')`.
- **VAT/moms panel:** output VAT vs input VAT, net to pay, period, "draft declaration" button (writes an AuditEvent, toasts). Mirrors the existing "Approve Fortnox VAT draft" agenda item.
- Revenue registration UI proper lives in `revenue`; `ledger` shows the booked side.

### `crew` → employees, access, payroll, HR, presence (capabilities #1, #21, #23)
- **Roster** from `HELM.session.team` with role + presence dots.
- **Access tab:** invite (email + role), edit role/permissions (writes Person.permissions), **deactivate/reactivate**, "separate login" indicator. All gated by `can('crew.manage')`.
- **Payroll tab:** monthly run, per-person gross/tax/net, employer fees (Swedish arbetsgivaravgift ~31.42%), payslip generation → `vault`. "Run payroll" writes AuditEvents + auto-accounting cost rows in `ledger`.
- **HR tab:** employment record, start date, leave/vacation balance, documents (contract → `vault`), onboarding checklist.
- **Presence:** read/write `HELM.session.presence` per person; show team focus/available board (capability #23) — also surfaced in `comms` and `my-day`.

### `vault` — doc generation + e-sign (capabilities #20, #24)
- **Generate tab:** pick a template (Proposal / Contract / Invoice / NDA / Offer letter), pick the source record (Deal/Customer/Partner/Person), preview a document **auto-filled from record fields** (capability #24), save as Document.
- **Sign tab:** e-signature flow (capability #20) — signer list, send-for-signature, signing status (sent/viewed/signed), audit trail per signature (each step → AuditEvent), provider = Scrive/DocuSign/Dropbox Sign (mock states).
- **Files:** all generated/signed docs + payslips + contracts, each with universal metadata + "last modified by".

### `settings` — profile + notification control center + company records (capabilities #11, #12, #15, #26, #28)
- **My Profile** (personal): name, title, avatar, mail identities, connected accounts (Google/Slack/Whoop), password/login (mock), body metrics handoff to `vitals`.
- **Notification Control Center** (personal, capability #11/#26): a matrix — rows = event sources (Gmail, approvals, mentions, deal won, payment, infra incident, devlog push, meeting starting, task assigned, …), columns = channels (in-app, email, Slack DM, push). Per-person toggles persisted on Person.notificationPrefs. The bell + Notification Center read this.
- **Company Records** (company, capability #15/#28): the Org record editor — logo, address, org.nr/VAT/EIN (country-aware identifier set), primary contact, fiscal settings, created/updated/last-modified-by. This is the canonical "store company info" surface; the underlying store is described in D.
- **Team defaults / theme:** accent (re-uses shell `setTheme`), default notification policy.

### `calendar` + `inbox` — per-person Google + meeting record (capabilities #5, #22)
- Both become **personal scope**: render the acting user's mailbox/calendar; re-render on `helm:user`. Each shows a "Connected as {identity}" chip → `integrations` per-user OAuth.
- **`calendar`**: create-meeting flow lets you attach a call provider (Google Meet / Zoom / Slack). Creating with "record" on seeds a Meeting record and a placeholder recording → `meetings`.
- **`inbox`**: per-identity threads, triage, send (mock). "Needs reply" feeds `my-day` follow-ups and notifications.

### `projects` — global Trello board + assignment (capability #17)
- Convert to a **global kanban** of **all** company Tasks (columns: Backlog / Todo / Doing / Review / Done), drag between columns (writes Task.status + AuditEvent).
- **Assignment:** each card has an assignee avatar (Person); filter chips for "All / My tasks / by person". The same Task store powers `my-day`'s "My tasks". Per-person swimlane view toggle.

### `integrations` — all new connectors (capability #5, #6, #7, #9, #14, +)
- Connector grid grouped: **Per-user** (Google Workspace mail+calendar, Whoop/Google Fit per person) vs **Company** (Slack, GitHub/GitLab webhooks, server monitor, Stripe/Fortnox/Tink, e-sign, transcription).
- Per-user rows show **which team member connected** and re-scope when you switch users. Each connect button writes an AuditEvent and (mock) flips state. This is the front door; detailed setup → `WIRING-GUIDE.md`.

### Shell bits these enhancements need (small, additive, in `core.js`/`index.html`)
1. `HELM.session` + person switcher + Notification Center (Section A).
2. `register()` accepts `scope`; `show()` re-renders personal modules on user switch; `HELM.rerender(id)`.
3. **9 new `<section id="view-…">`** rows + 9 `<link>` + 9 `<script>` rows in `index.html` (mechanical; keep bible order).
4. A `.dock-div` divider element + group labels in `buildDock()` (driven by a small `GROUPS` map keyed by module id).
5. Overlay host nodes for the **Company Overview** and **Notification Center** (siblings of `.cmdk` in `index.html`).
> None of these change an existing public method signature — they're all additive, preserving the contract for the 18 shipped modules.

---

## D) DATA MODEL

All records are plain JS objects produced by `HELM.data` seeds (deterministic) and, where written at runtime, stored in `localStorage` namespaced `helm.<collection>`. **Every record carries the universal metadata block.** The shape is backend-ready: a Supabase/Postgres schema maps 1:1 (see F).

### Universal metadata (on EVERY record)
```
id          string   stable, kebab/uuid-ish
createdAt   ISO ts
updatedAt   ISO ts
createdBy   personId
updatedBy   personId        // "last modified by whom" (capability #15)
source      enum            // 'manual'|'stripe'|'fortnox'|'tink'|'gmail'|'slack'|'github'|'monitor'|'whoop'|'import'|'system'
```

### Core record types

**Company / Org**
`name, logoUrl, addresses[], country, identifiers{ orgNo|vat|ein|… }, primaryContactId, fiscalCurrency, fiscalYearStart, connectedServices[]` + metadata.

**Person / Employee**
`name, email, mailIdentities[], title, role, permissions[], status('active'|'invited'|'deactivated'), presence, avatar, employment{ startDate, type, salary, leaveBalance }, body{ weightKg, heightCm, age, sex }, connections{ google, slack, whoop, googleFit }, notificationPrefs{ [eventType]:{ inApp,email,slack,push } }` + metadata.

**Partner (counterparty)** *(capability #10, #15)*
`name, kind('vendor'|'buyer'|'both'|'partner'), logoUrl, address, primaryContact, identifiers{ orgNo|vat|ein }, country, tags[], history[]` (linked Payments/Costs/Deals/Documents) + metadata. **logoUrl shown in ledger rows, audit entries and the partner directory.**

**Customer**
`name, logoUrl, accountOwnerId, segment, health, portalAccountId?, contacts[], lifetimeValue` + metadata. (External login → PortalAccount.)

**PortalAccount** *(capability #27)*
`customerId, loginEmail, status('invited'|'active'|'suspended'), scopes[], sharedDocumentIds[], lastSeenAt` + metadata.

**Deal**
`title, partyId(customer/partner), stage, value, currency, ownerId, probability, expectedClose, history[]` + metadata.

**Invoice**
`number, customerId, lines[], net, vat, gross, currency, status('draft'|'sent'|'paid'|'overdue'), dueDate, paymentIds[]` + metadata.

**Payment** *(capability #15: same metadata + party + logo)*
`direction('in'|'out'), amount, currency, partyId, partyType('customer'|'partner'), method, reference, vatAmount, bookedVoucherId, occurredAt` + metadata.

**Cost** *(capability #2)*
`amount, currency, category, costType('fixed'|'variable'), vendorPartnerId, vatRate, recurring{ interval }?, occurredAt, bookedVoucherId` + metadata + `source`.

**Voucher (auto-accounting)** *(capability #3)*
`series, entries[]{ account, debit, credit }, vatCode, period, sourceRef{ type, id }, posted(bool), confidence` + metadata (`source:'system'`).

**Task** *(capability #17, #18)*
`title, description, status('backlog'|'todo'|'doing'|'review'|'done'), assigneeId, dueAt, projectId?, priority, checklist[], relatedRef?` + metadata.

**Document** *(capability #20, #24)*
`title, type('proposal'|'contract'|'invoice'|'nda'|'payslip'|'offer'|'other'), templateId?, generatedFromRef?, fileMeta, signing{ status, signers[]{ personId|email, status, signedAt } }, version` + metadata.

**Meeting** *(capability #22)*
`title, startAt, endAt, provider('meet'|'zoom'|'slack'), attendees[], recordingUrl?, transcript{ status, text? }, brief{ status, summary?, actionItems[] }, documentId?` + metadata.

**Message (comms)** *(capability #6)*
`channelId|dmId, authorId, body, ts, reactions[], threadParentId?` + metadata. **Channel** `name, kind('channel'|'dm'), memberIds[], unreadByUser{}`.

**Notification** *(capability #11, #26)*
`recipientId, eventType, title, body, link{ moduleId, ref }, channelsSent[], read(bool), createdAt` + metadata. Generated from AuditEvents per recipient's `notificationPrefs`.

**InfraNode + Incident + Deploy** *(capability #9)*
Node: `name, kind('server'|'workstation'|'service'), provider, region, status('up'|'degraded'|'down'), metrics{ cpu, mem, disk, uptimePct }, lastCheckAt`. Incident: `nodeId, severity, openedAt, resolvedAt?, summary`. Deploy: `repo, env, version, status, deployedAt, byPersonId`.

**DevLogEntry** *(capability #7)*
`platform('github'|'gitlab'|'vercel'|'supabase'|…), repo, branch, commitSha, message, authorId, filesChanged, pushedAt, deployId?` + metadata. (One per push; a Deploy may bundle many.)

**VitalsSample + DailyInsight** *(capability #14)*
Sample: `personId, kind('hr'|'hrv'|'sleep'|'strain'|'steps'|'spo2'), value, unit, takenAt, deviceSource`. DailyInsight: `personId, date, recoveryScore, strain, sleepHours, suggestion, stressEvents[]{ calendarEventId, reason }`. Derived metrics (BMR via Mifflin-St Jeor, TDEE, calories burned) computed client-side from `Person.body` + samples.

### AuditEvent — the everything-log *(capability #16, the keystone)*
**Append-only. Immutable. Designed so an AI can later reconstruct the whole company.** Every create/edit/action across every module writes one.

```
id           string
ts           ISO ts                  // when it happened
actorId      personId | 'system'     // who did it
actorRole    role snapshot
action       verb                    // 'payment.created','cost.added','invoice.paid',
                                      // 'task.moved','role.changed','doc.signed','meeting.recorded',
                                      // 'deploy.succeeded','presence.changed','partner.created',…
entityType   string                  // 'Payment'|'Task'|'Person'|…
entityId     string
summary      string                  // human sentence ("Ola booked $4,200 cost from Northwind AB")
before       object|null             // prior field values (for edits)
after        object|null             // new field values
amount?      { value, currency }     // when monetary
links[]      { entityType, entityId }// partner, customer, deal, etc.
context      { module, source, ip?, sessionId }
hashPrev     string                  // chain hash of previous event (tamper-evidence)
hashSelf     string
```

- **Producer:** a shell helper `HELM.audit.log(evt)` (added to `core.js`) that every module calls on every mutation. It stamps `ts/actor/hash` and appends to `helm.audit`. The Flight Log and Command Pulse are **views** over this stream.
- **AI-readability:** `summary` is always a complete plain-English sentence; `before/after` are structured; `links[]` make the graph traversable. An "Export for AI" action in `audit` emits the whole stream as newline-delimited JSON — the single artifact an LLM reads to understand the company end-to-end.

> **Rule for every engineer:** any button that changes data calls `HELM.audit.log(...)` **and** (where relevant) `Notification` generation. No silent mutations.

---

## E) BUILD WAVES

Each module writes **only its own files** (`modules/<id>.js`, `modules/<id>.css`) so waves run in parallel without merge conflicts. The single shared edit is `index.html` (section/link/script rows) — done **once** in Wave 0 with all 9 new slots stubbed so later waves never touch it.

**Wave 0 — Shell identity spine (one engineer, blocks nothing-else-can-start)**
`core.js`: `HELM.session`, person switcher, `helm:user/presence` events, `register({scope})`, personal re-render, `HELM.rerender`, `HELM.audit.log`, Notification Center + Company Overview overlay hosts, `.dock-div` groups. `index.html`: add all 9 new `<section>`/`<link>`/`<script>` rows + 2 overlay hosts + team/org seed. Ship empty module stubs so the app still boots.

**Wave 1 — New COMPANY modules (parallel, independent files)**
`partners` (counterparties+logos — build early, others link to it) → then `comms`, `devlog`, `infra`, `audit`, `meetings`, `portal`. Each registers, renders mock data, writes AuditEvents.

**Wave 2 — New PERSONAL modules (parallel)**
`my-day`, `vitals`. These consume `HELM.session.user`, Tasks, Meetings, Notifications, VitalsSamples; verify re-render on user switch.

**Wave 3 — Enhancements to existing modules (parallel, one engineer per module)**
`command` (overview overlay + pulse), `ledger` (costs/sources/auto-accounting/VAT), `crew` (access/payroll/HR/presence), `vault` (gen+e-sign), `settings` (profile/notif-center/company-records), `projects` (global board+assign), `calendar`/`inbox` (per-person + meeting record), `integrations` (connectors), `revenue` (register revenue).

**Wave 4 — Cross-wiring & polish**
Audit producers verified in every module; Notification generation; Pulse/Flight-Log read from audit; tape/⌘K entries for new actions; dock grouping QA.

**Wave 5 — Mobile pass (capability #25)**
One engineer, mostly `core.css` `@media` work (no new modules). Dock → bottom tab bar on phones; overlays full-screen; rail becomes a swipe-in sheet; `my-day` is the mobile home; tables → stacked cards; person switcher + bell reachable in a compact topbar. Each module already uses the responsive `.grid`/`.card` kit, so the pass is shell-CSS-heavy, module-light.

---

## F) INTEGRATIONS / APIs CHECKLIST

*(Just the checklist — detailed keys, scopes, webhooks and edge functions live in `WIRING-GUIDE.md`.)*

**Identity & data store**
- [ ] **Supabase** (Postgres) — one table per record type in D; RLS per person/role; `audit_events` append-only; Storage for logos/docs/recordings. Single tenant now, org-scoped columns ready for multi-tenant.
- [ ] **Auth** — Supabase Auth (separate logins per employee, capability #1); roles/permissions claims.

**Per-user (OAuth, scoped to each Person)**
- [ ] **Google Workspace** — Gmail API + Google Calendar API per employee (capability #5); per-user refresh tokens.
- [ ] **Whoop API** / **Google Fit (Fitness REST)** / **Apple HealthKit** export — per-person vitals (capability #14).

**Company-wide**
- [ ] **Slack API** — Web API + Socket Mode/Events + (Huddles/Calls deep-link) for in-app comms (capability #6).
- [ ] **GitHub / GitLab webhooks** — push events → DevLogEntry (capability #7); Vercel/Supabase deploy hooks → Deploy.
- [ ] **Server monitoring** — Better Stack / Datadog / Netdata agent → InfraNode metrics + Incidents (capability #9).
- [ ] **Meeting transcription** — Recall.ai (joins Meet/Zoom/Slack calls) or AssemblyAI / OpenAI Whisper for recording→transcript→brief (capability #22).
- [ ] **E-signature** — Scrive (Swedish, eIDAS/BankID) preferred, or DocuSign / Dropbox Sign (capability #20).
- [ ] **Finance** — Stripe (revenue/payouts, capability #4), Fortnox (Swedish bookkeeping/VAT, capability #3), Tink (bank feed). Map each webhook → Payment/Voucher/AuditEvent.
- [ ] **AI** — Anthropic Claude for daily briefings, meeting briefs, doc generation, and reading the AuditEvent export (capability #8/#16/#22/#24).

**Cross-cutting**
- [ ] Every external event lands as a record **and** an AuditEvent (source-tagged) so the immutable log stays complete.
- [ ] Push/email/Slack delivery honors each Person's `notificationPrefs` (capability #11/#26).

---

### Appendix — capability → home (all 29 covered)
1 crew(access)·Auth → 2 ledger(costs) → 3 ledger(auto-acct/VAT)·Fortnox → 4 revenue·ledger·Stripe → 5 inbox+calendar·integrations(per-user Google) → 6 **comms**(Slack) → 7 **devlog** → 8 command(overview overlay) → 9 **infra** → 10 **partners**(logos) → 11 settings(notif center)+bell → 12 settings(profile) → 13 ⌘K global search(shell) → 14 **vitals** → 15 settings(company records)+universal metadata → 16 **audit**(AuditEvent) → 17 projects(global board) → 18 **my-day** → 19 command(pulse) → 20 vault(e-sign) → 21 crew(payroll/HR) → 22 **meetings** → 23 crew/comms(presence) → 24 vault(doc-gen) → 25 mobile pass(Wave 5) → 26 settings(notif center) → 27 **portal** → 28 settings(company records)·Supabase → 29 **HELM.session**(identity layer).
