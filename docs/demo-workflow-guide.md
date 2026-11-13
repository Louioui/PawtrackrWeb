# Pawtrackr demo workflow guide

This guide explains every workflow in the Pawtrackr web app: where it lives, what it does, why it exists, what is real versus demo, and what to build next. It is written so that a designer (UX Pilot) or an engineer (Codex) can work from it without reading the source first.

Status labels used below:

- **Live**: reads and writes a hosted Supabase project behind a real staff or public session. Verified on the hosted project unless stated.
- **Built, unverified on hosted**: implemented and tested locally, but migrations `0016`–`0019` are not yet applied to the hosted project and the flow has not run against real Auth or Stripe.
- **Demo**: runs on sample data and a development disk ledger. Production builds return HTTP 503 for its writes.
- **Preview**: a screen that shows the intended experience with no real delivery behind it.

---

## 1. The product in one paragraph

Pawtrackr is software for pet grooming salons and mobile groomers. Three people use it, and the app is organized around them. A **pet parent** books a visit and sees their pet's history. A **salon team member** (receptionist or groomer) runs the day: check-in, grooming, checkout. An **owner** sets up the salon and reads the numbers. All three see the same appointment record, which is why the app is built as one connected workflow instead of three separate tools.

## 2. Route map

| Route | Who uses it | Purpose | Status |
| --- | --- | --- | --- |
| `/` | Everyone (visitors) | Explains the product and offers entry points | Demo (interactive preview) |
| `/signup` | New salon owner | Creates an account and provisions a salon | Built, unverified on hosted |
| `/login` | Staff | Staff entry | Demo (sample PIN) |
| `/dashboard` | Staff and owner | Command center for one salon | Demo |
| `/dashboard/appointments/live` | Salon team | Live day timeline, agenda, reservations, CSV | Live (staff session); booking writes built, unverified on hosted |
| `/dashboard/clients/live` | Salon team | Client and pet roster, intake, weight | Live (staff session) |
| `/dashboard/settings/live` | Owner | Catalog, hours, time zone, groomers, shifts | Live (staff session) |
| `/dashboard/analytics/live` | Owner | Recorded checkout totals, daily chart, CSV, settlement | Live (staff session); Stripe built, not run against Stripe |
| `/dashboard/analytics` | Owner (demo) | Demo charts and weekly pacing | Demo |
| `/dashboard/settings` | Owner (demo) | Demo salon settings | Demo |
| `/dashboard/messages` | Salon team | Message inbox | Preview |
| `/dashboard/retention` | Owner | Membership and retention ideas | Preview |
| `/dashboard/payroll` | Owner | Payroll view | Preview |
| `/dashboard/fleet` | Mobile groomer | Van and route view | Preview |
| `/dashboard/operations` | Owner | Operational view | Preview |
| `/dashboard/import` | Owner | Importing data from another system | Preview (no verified import pipeline) |
| `/admin` | Platform operator | Platform-level view | Preview |
| `/portal/live` | Pet parent | Directory of live salons | Live (anonymous, published salons only) |
| `/portal/live/[slug]` | Pet parent | One salon's public page and online booking form | Live catalog; booking built, unverified on hosted |
| `/portal/[salon-slug]` | Pet parent (demo) | Demo pet-parent portal with sample grooming options | Demo |
| `/client/[id]` | Pet parent or staff (demo) | Demo client profile with sample offers | Demo |

Routes not listed above (`/api/*`) are the server endpoints each workflow calls.

---

## 3. Workflows, one at a time

### W1. Landing page (`/`)

**What it does.** The landing page is the front door. It explains the product in one headline ("The Trusted Operating System for Modern Pet-Care Businesses"), then walks the visitor through a sample appointment for a dog named Bello. A three-tab switcher (Pet Parent, Salon Team, Owner) shows what each person sees. Below it, a six-stage lifecycle bar lets the visitor select Requested, Confirmed, Checked in, Grooming, Paid, or Follow-up, and each stage explains who acts and what the system checks automatically. An availability inspector shows one valid and one blocked booking and names the exact rule that decided each. A data-confidence inspector shows how the app labels stale, offline, checking, and demo data. Finally, a plans section and entry cards send the visitor into the demo or sign-in.

**Why it is built this way.** A grooming owner does not buy software because it has a dashboard. They buy it because a missed booking, a double-booked groomer, or a wrong checkout total costs them money. So the page leads with the lifecycle and the explainable rules, not with feature lists. The "explain why" design (for example, "blocked because no groomer shift covers 12:00") is the differentiator, so it appears on the front page.

**Where the user goes next.** The "Open Interactive Demo" button leads to the demo command center. "Preview Pet-Parent Booking" leads to the public salon page. "Live Staff Schedule" leads to the staff sign-in path. Choosing the wrong one is the most common confusion, because the labels look similar but only one touches real data.

**Gaps.** The page is long (about 2,000 lines of code and roughly six full screens). It mixes a sales pitch with a product tour, so a visitor can finish reading without knowing whether they can buy it or sign up. The status line ("Interactive product preview • Simulated salon workflow") is honest but easy to miss. Nothing on the page says "waitlist" or "start free," so a visitor who is ready to sign up has no obvious next step other than the plan cards.

**Recommended changes.** Split the page into two clearly labeled parts: "How Pawtrackr works" (the lifecycle and rules, as now) and "Start" (sign-up, demo, waitlist). Put one primary action above the fold that matches the real status (for example "Create your salon" once `/signup` is verified, or "Join the waitlist" before that). Keep the status line but move it next to the primary button so the visitor reads it before clicking.

---

### W2. Owner sign-up and salon setup (`/signup`)

**What it does.** A new owner enters an email and password, or signs in if they already have an account. After email confirmation, `POST /api/onboarding` calls a database function that creates the salon, its settings, and the owner's membership in one step. A new salon starts in `trialing`. The page then shows a checklist that points to the four steps that make a salon usable: add services, hours, and groomers (`/dashboard/settings/live`); open the public booking page; see today's appointments (`/dashboard/appointments/live`); add clients and pets (`/dashboard/clients/live`); record checkouts and see revenue (`/dashboard/analytics/live`).

**Why it is built this way.** Setup is where most software loses people. The checklist turns a blank account into a sequence of visible wins, and each step opens the screen that matters for it. The database function refuses to create a second salon for a user who already has one, and it takes the owner from the signed-in session rather than from a form field, so one user cannot provision another user's salon.

**Gaps.** The flow is built and tested locally but has not been run against the hosted project or a real email confirmation. There is no staff invitation, so a salon with more than one groomer cannot yet add them through the product. There is no step that confirms the salon's time zone, even though the availability rules depend on it. A new owner who skips the checklist sees an empty command center with no explanation.

**Recommended changes.** Add a time-zone step to sign-up (a single dropdown with the salon's city preset) because booking times are wrong without it. Turn the checklist into a progress bar that the command center also shows until the salon has at least one service, one groomer, and one open-hours day. Add a staff invitation step after the groomer step, marked "coming soon" until invitations are built.

---

### W3. Staff sign-in (`/login`)

**What it does.** The login page asks the user to choose an account type and enter a sample PIN. This is demo-only. It leads to the demo command center.

**Why it is built this way.** The demo needs a fast way in for a visitor who is evaluating the product. The real staff sign-in exists on the live views (`/dashboard/appointments/live`, `/dashboard/clients/live`, `/dashboard/settings/live`, `/dashboard/analytics/live`), where a Supabase email and password session is required and the server checks active staff membership on every request.

**Gaps.** Two different sign-in experiences exist, and the page does not explain which one is real. A staff member could reasonably think the PIN is their account. Client profiles use demo IDs, not verified pet-parent accounts, and pet-parent accounts do not exist yet.

**Recommended changes.** Label the PIN page clearly as "Demo access" and add a link to the real staff sign-in. Add a single banner to every live page that says "Signed in as [name] for [salon]" with a sign-out button, so staff always know which tenant they are viewing.

---

### W4. Command center (`/dashboard`)

**What it does.** The command center is the owner's and staff's home for one salon. Its heading reads "[Salon name] — Command Center" and shows the salon's tagline and its public booking URL. It is a demo: the data is sample data, and the page exists so a visitor can see the shape of the day, the revenue, and the operational tasks before the live views are connected.

**Why it is built this way.** A single home screen gives the team a one-glance view. The live views are the real version of its parts (schedule, roster, settings, analytics), so the command center acts as a map to them.

**Gaps.** The demo numbers can look like real salon data, which is exactly what the README warns against. The command center does not yet link to the live views with their real status, so staff can land on a demo number and believe it is live.

**Recommended changes.** Put a visible badge on every demo number ("Sample data") and a "View live" link next to each card that has a live counterpart. Show the data source and "as of" time on each card, as the live views already do.

---

### W5. Live appointments (`/dashboard/appointments/live`)

**What it does.** This is the staff schedule. It shows one salon-local day (the day the salon's time zone defines, falling back to UTC if no zone is set). On a wide screen it shows a timeline with one lane per groomer; on a phone it shows a portrait agenda. Staff can filter by groomer, select an appointment to see its details, create a reservation, and change its status. The page exports the visible, filtered day as CSV, marking the source and the time the data was read. Reservation creation checks the salon's operating hours, the groomer's shift (or time-off block), the service duration, and a 15-minute buffer, and the database refuses any overlap for the same groomer.

**Why it is built this way.** A schedule is only useful if staff trust it. So the page shows where each number came from and when it was read, refuses to show a blank day as if it were empty, and returns a clear reason when a booking is blocked. The database constraint is the final guard, because two staff members can click "book" at the same moment and only the database can guarantee one wins.

**Gaps.** The reservation writes are built and verified locally but not yet run against the hosted project. The calendar grid is UTC-based in places (the timeline navigator), so a salon in another time zone can see confusing day boundaries near midnight. The timeline does not yet show the pet's care notes, so a groomer has to open a second page to see that a dog bites. Drag-to-reschedule does not exist; moving a visit means editing it.

**Recommended changes.** Show the care-note flag (for example, "Bite risk") directly on each appointment block, using the existing alert colors so staff see it before check-in. Add a "why blocked" panel that names the rule that refused a booking, using the same wording as the landing page's availability inspector. Add a "move" action that opens the same availability check before saving.

---

### W6. Clients and pets (`/dashboard/clients/live`) and client profile (`/client/[id]`)

**What it does.** The clients page is the salon's roster of pet parents and their pets. Staff can add a client and their pet at intake, see the pet roster table, and log a new weight with its date. Weight is stored as dated observations, so the history is a record rather than a single number. The client profile page (`/client/[id]`) is currently a demo that shows the client's history and sample offers.

**Why it is built this way.** A weight history matters in grooming because it shows coat and health changes over time and helps a groomer judge a dog's condition before the visit. Keeping each observation dated, rather than overwriting the last number, is what makes the history trustworthy.

**Gaps.** Pet-parent accounts do not exist, so a pet parent cannot see their own pet's history yet. The client profile page uses demo IDs and sample offers, which could be confused with real offers. Photos and waivers have no authenticated upload flow. Intake does not collect consent or the pet's care notes in a structured way.

**Recommended changes.** Add a structured care-notes field at intake (bite risk, anxiety, senior care, medical, matted coat) using the existing alert categories, so the same flags appear on the timeline (W5). Mark the demo client profile clearly and do not show its offers as real. Add a "consent and waiver" checkbox to intake, stored with a date, even before the waiver upload exists.

---

### W7. Catalog, hours, groomers, and shifts (`/dashboard/settings/live`)

**What it does.** The live settings page is where the owner sets up how the salon sells and staffs its day. It manages the service catalog (name, duration, price in cents), operating hours, the salon's IANA time zone, the tax rate, the booking buffer, the groomer roster, and each groomer's shifts for a local date. A time-off row blocks booking for that groomer; a scheduled row must cover the service plus buffer. Days with no shift rows fall back to the salon's operating hours.

**Why it is built this way.** Every availability decision in the app depends on these settings. Prices are stored in whole cents because floating-point decimals produce wrong totals (for example, 19.99 times 100 is not exactly 1999 in binary). The time zone matters because a booking at 10:30 in Los Angeles is a different instant from 10:30 in New York. The shift rule exists so that a groomer on a day off cannot be booked by accident.

**Gaps.** The settings page is a long form with many fields and no guidance on what each one changes. A salon that enters hours but no shifts gets a different rule (hours only) without being told. The migration that enforces hours and shifts in the database (`0016`) is not yet applied to the hosted project.

**Recommended changes.** Add a short "What this changes" line under each section (for example, "These hours decide which times customers can book online"). Show a single readiness summary at the top: services, hours, time zone, groomers, and shifts, each with a check or a warning. Warn when a groomer has no shift and the salon has hours, since the fallback may not be what the owner intended.

---

### W8. Recorded checkout analytics (`/dashboard/analytics/live`) and demo analytics (`/dashboard/analytics`)

**What it does.** The live analytics page shows the salon's recorded checkouts for the last 7, 30, or 90 UTC days: a daily chart, an exact-value table, and a CSV export. It separates three kinds of money: confirmed (settled through Stripe), in-progress (a payment has started but not settled), and recorded-only (a checkout staff entered but no card payment is linked to). Staff record a checkout for a visit, and the database refuses a second completed checkout for the same visit with HTTP 409. The demo analytics page shows sample charts, weekly target pacing, and comparisons, and is labeled as demo.

**Why it is built this way.** Owners make decisions from these numbers, so the app must never blur them. A recorded checkout is not the same as money in the bank, and the page keeps the categories apart. Integer cents and a one-completed-checkout rule stop double counting. The page keeps the last loaded snapshot during an offline or failed refresh and clears it on sign-out or lost membership, so a former staff member cannot read old totals.

**Gaps.** Stripe settlement is built and tested locally with signed test events but has never run against Stripe. There is no card-entry UI, so a checkout cannot yet take a card on the device. The demo analytics page could be mistaken for live numbers, which is the same risk as W4. Owners cannot yet see a per-groomer breakdown in the live view.

**Recommended changes.** Add the three money categories as a visible legend on the chart, each with its own label, so the owner never reads recorded totals as settled. Add a per-groomer filter, which the data already supports. Add a permanent "Sample data" label to the demo analytics page, and a "View live" link when the owner is signed in.

---

### W9. Public booking and the pet-parent portal (`/portal/live`, `/portal/live/[slug]`, `/portal/[salon-slug]`)

**What it does.** `/portal/live` lists salons that have an active subscription and at least one published service. Each salon has a page at `/portal/live/[slug]` that shows its name, its published services with prices and durations, its time zone, and its hours. A booking form on that page asks for a service, a date, a time, a name, a phone number, and the pet's name and details. The form calls `GET /api/public/availability`, which returns 30-minute start times where at least one active groomer is free. Submitting calls `POST /api/public/bookings`, which picks a groomer, reuses an existing client only when the phone number and name both match, and inserts through the same availability rules as staff bookings. Limits: at least 60 minutes ahead, within 90 days, four upcoming online bookings per phone per salon, and 60 online bookings per salon per hour. Demo salons are excluded from search engines and from the sitemap. `/portal/[salon-slug]` is the demo version with sample grooming options.

**Why it is built this way.** Public booking is the feature that brings new customers in, so it is the one most exposed to abuse and to bad data. The anonymous side gets only two database functions and no table access, so a visitor can book but cannot read anyone else's records. Matching existing clients only on phone and name prevents one person from attaching a booking to someone else's pet. The limits stop a single phone number or script from filling a groomer's day.

**Gaps.** Online bookings are confirmed immediately as booked, with no staff approval step. A customer cannot cancel or reschedule online. No confirmation message is sent. The rate limit is per server process, so it is not shared across multiple servers. The booking form asks for the pet's details but does not ask about the care notes that matter for the visit (for example, bite history). The demo portal and the live portal use different designs, which can confuse a customer who visits both.

**Recommended changes.** Add a "Request" mode for salons that want to approve bookings first (status `requested`, shown to staff in W5 with an Approve button). Add a customer cancel link in the confirmation, limited to bookings more than a set number of hours away. Ask two safety questions on the form (bite history, medical or senior care) and show the answers as flags on the appointment. Send one confirmation message as soon as messaging is verified. Replace the demo portal's design with the live one so there is only one customer look.

---

### W10. Preview pages (messages, retention, payroll, fleet, operations, import, admin)

**What they do.** These screens show what the product will do without real delivery behind them. Messages shows a reminder inbox. Retention shows membership ideas (for example, a four-week grooming club, a bi-weekly bath pass, a senior comfort club) with sample subscribers. Payroll shows groomer pay summaries. Fleet is a mobile van and route view. Operations is a general operational overview. Import is a screen for bringing in data from another system. Admin is a platform-level view.

**Why they exist.** They show the full range of the product so an owner can judge whether it covers their business, and they give the team a place to design the next features.

**Gaps.** None of them can send a message, pay a groomer, or import data yet. Import has no verified pipeline. Showing sample membership prices and pay numbers next to real-looking controls is risky, because a user may assume they work.

**Recommended changes.** Give every preview page the same banner: "Preview — this feature is not connected yet," with a link to the status page (`docs/build-status.md`). Disable write buttons on preview pages rather than letting them appear to save. Keep the sample data obviously fake (round, repeated names) so no one mistakes it for real records.

---

### W11. Navigation: top bar, command palette, support widget, and demo switcher

**What they do.** The top navigation has a few main links (Command Center, Fleet, the bespoke portal, a sample client). The command palette (opened from the keyboard) lists every route, from messages and operations to the live views. The support and tour widget offers quick help links to settings, import, the portal, and the command center. The demo switcher bar appears on demo pages and switches between perspectives (command center, salon portal, a client profile, settings, and sign-in) while keeping the same demo salon and client.

**Why it is built like this.** A product with eleven or more routes needs more than one way to find things. The palette serves people who know what they want; the top bar serves people who are exploring; the switcher lets an evaluator see the same salon from each perspective without losing their place.

**Gaps.** The top bar, palette, switcher, and widget do not agree on labels. "Command center," "dashboard," and "salon portal" all name related screens but are not consistent. The switcher keeps demo context even after the user has moved to a live page, which can mix real and sample data in one session.

**Recommended changes.** Use one set of labels across all navigation (for example, "Schedule," "Clients," "Catalog & hours," "Checkout & revenue," "Public booking page"). Show a small "Live" or "Demo" tag on every nav item. Clear the demo context when the user enters a live route.

---

### W12. Checkout and card settlement (inside the live analytics flow)

**What it does.** A staff member records a completed checkout for a visit. The app creates a checkout record in whole cents. If a card is taken, the app starts a Stripe PaymentIntent (`POST /api/payments/intent`), and Stripe later tells the app the outcome through a signed webhook (`POST /api/webhooks/stripe`). The database records each event once, and marks the payment as settled, failed, or refunded. If the paid amount or currency differs from the recorded checkout, the payment is marked failed.

**Why it is built this way.** Money must agree with Stripe, not with what the staff member typed. Recording the event once prevents double counting when Stripe retries. Refusing an unsigned or altered event prevents anyone from marking a payment as paid.

**Gaps.** No card-entry screen exists, so a checkout cannot yet take a card from the device. Refunds, Connect payouts, and subscription billing are not built. The webhook has never received a real Stripe event.

**Recommended changes.** Build the card-entry step as a single, clearly labeled "Take card payment" action on the checkout drawer, with the three states (recorded only, payment started, settled) shown as a progress line. Add a reconciliation view that lists any payment still pending after a set time.

---

## 4. Cross-cutting rules every workflow must follow

1. **Show the source and the time.** Every screen that shows numbers says whether they are live, demo, or recorded, and when they were read.
2. **Never fall back silently to demo data on a live route.** A failed live read shows the last loaded snapshot with a warning, or an empty state with the reason. It never shows sample numbers.
3. **Tenant comes from the signed-in membership, not from the page.** The salon selector on a live page is a filter, not permission.
4. **Money is whole cents, and recorded is not settled.** Keep the categories apart on every money screen.
5. **Explain refusals.** A blocked booking, a rejected payment, or a denied sign-in names the rule that decided it.
6. **Color carries meaning, but never alone.** Pair each alert color with a text label and an icon, so the status is clear without color.

## 5. What to build next, in priority order

1. Apply migrations `0016`–`0019` to the hosted project and run the real Auth and Stripe checks described in `docs/build-status.md`. Until this is done, every "Live" label above depends on local evidence only.
2. Add the care-note flags (bite risk, anxiety, senior care, medical, matted coat) to intake, the timeline, and the online booking form (W5, W6, W9). This is the most visible safety feature for groomers and it reuses colors the product already defines.
3. Add the "Request" booking mode and customer cancel link (W9), so a salon can choose between instant and approved bookings.
4. Add the readiness summary to settings and a first-run progress bar to the command center (W2, W7).
5. Add the card-entry step and reconciliation view to checkout (W12) once Stripe runs against a test account.
6. Label every demo and preview surface consistently and disable their write buttons (W4, W10, W11).
7. Add staff invitations and pet-parent accounts, then remove the PIN login (W3).

---

## 6. Prompts for Codex and UX Pilot

Use these prompts to design or build each workflow. Each one names the route, the job, the required states, and the constraints from this guide. Paste the matching prompt into UX Pilot (design) or Codex (build), and keep the cross-cutting rules in section 4 in the context.

### Shared context prompt (paste first, every time)

> You are designing or building one screen of Pawtrackr, a dark-mode-only web app for pet grooming salons. Use the obsidian palette: page `#0B090E`, secondary surface `#110E14`, cards `#17131C` at about 75% opacity with a 1px white border at 8%, dividers `#2A2334`, primary text `#F4F4F6`, muted text in grays. Use periwinkle `#8B95FF` for primary actions and focus rings, emerald `#10B981` only for money and confirmed status, and the pet-care alert colors only for care warnings: crimson `#F43F5E` bite risk, amber `#F59E0B` matted coat, violet `#A855F7` senior care, cyan `#06B6D4` anxious or extra care, pink `#EC4899` medical. Every alert must pair its color with a text label and an icon. Layouts are data-first, with a 16px phone gutter and no horizontal scroll. Show the data source and time on every number. Never show sample numbers on a live route without a "Sample data" label. Explain every refusal with the rule that decided it. Use whole-cent money. Keep recorded checkout totals separate from settled totals.

### P1. Landing page (`/`)

> Redesign the Pawtrackr landing page as two clearly separated parts. Part one, "How Pawtrackr works," shows the six-stage appointment lifecycle (Requested, Confirmed, Checked in, Grooming, Paid, Follow-up) for a sample dog named Bello, with a three-tab view for Pet Parent, Salon Team, and Owner, and the availability inspector that shows one valid and one blocked booking with the rule that decided each. Part two, "Start," has one primary action above the fold, chosen from: "Create your salon" (when sign-up is live) or "Join the waitlist" (before), with the current status line placed beside the button. Keep the plan cards below. Remove any wording that implies a feature is live when it is a preview.

### P2. Owner sign-up and setup (`/signup`)

> Design the owner sign-up flow in three steps: account (email and password), confirm email, and salon setup (salon name, a URL slug, and a time-zone dropdown with the salon's city preselected by browser guess). After setup, show a readiness checklist with four items: add services, hours, and groomers; open the public booking page; see today's appointments; add clients and pets. Each item shows a check when done and links to its screen. Include a disabled "Invite staff — coming soon" row. Show an error state for an already-provisioned account that explains the one-salon rule.

### P3. Staff sign-in (`/login`)

> Design a two-path sign-in screen. The primary path is "Staff sign in" with email and password and a "Forgot password" link. The secondary path, labeled "Demo access (sample data)," opens the demo command center. Show a clear banner that the demo path does not use real salon data. After sign-in, show a persistent header with the signed-in name, the salon name, and a sign-out button.

### P4. Command center (`/dashboard`)

> Redesign the owner's command center for one salon. Top row: the salon name, its tagline, and its public booking URL with a copy button. Then four cards: today's appointments (count and next visit), today's recorded checkouts (in cents, with a "Recorded, not settled" label), groomers on shift now, and items needing attention (unconfirmed bookings, payments pending over 24 hours, clients with a bite-risk flag). Every card has a "Sample data" or "Live" badge, the source, the as-of time, and a "View live" link when a live counterpart exists. Add the readiness summary from W7 as a collapsible strip.

### P5. Live appointments (`/dashboard/appointments/live`)

> Design the staff schedule for one salon-local day. Desktop and landscape: a timeline with one lane per groomer, appointments as blocks showing the pet, service, and time, with a care-flag icon and label on blocks that have one. Mobile portrait: an agenda list of the same appointments, grouped by time. A groomer filter. A selected-appointment drawer with pet details, care flags, status, and actions (check in, start, finish, move). A "New appointment" form with service, pet, groomer, and a salon-local time, which shows the availability result before saving and explains any refusal with the named rule. Include a visible "as of" time, a CSV export button for the filtered day, and an offline banner that keeps the last loaded day.

### P6. Clients and pets (`/dashboard/clients/live`) and client profile

> Design the client roster and intake. The roster is a table of pet parents and pets with columns for pet name, breed, last visit, weight, and care flags. The intake form has client details, pet details, a structured care-notes section with checkboxes for bite risk, anxiety, senior care, medical, and matted coat (each with its color and label), and a "consent and waiver" checkbox with the date stored. The pet profile shows a dated weight history as a simple table and a line chart, with "Log weight" and each observation's date. Mark any demo profile as "Sample client — not a real record."

### P7. Catalog, hours, groomers, and shifts (`/dashboard/settings/live`)

> Design the owner's setup screen as four sections in order: Services (name, duration, price in dollars entered and stored as cents, tax note), Hours and time zone (per-weekday hours and one time-zone dropdown), Groomers (roster and invite placeholder), and Shifts (a local-date picker, each groomer's shifts or time off, with a plain sentence explaining that a day with no shifts uses salon hours). Put a readiness summary at the top with a check or warning for services, hours, time zone, groomers, and shifts. Each section has a one-line "What this changes" explanation.

### P8. Recorded checkout analytics (`/dashboard/analytics/live`)

> Design the owner's revenue view for the last 7, 30, or 90 UTC days. Top: three money totals on separate cards labeled "Confirmed (settled)," "In progress (payment started)," and "Recorded only (not settled)," each with its own color-independent label. Below: a daily bar chart and an exact-value table, with a CSV export button and a per-groomer filter. Add a "Record checkout" action that opens a drawer taking a visit, amount in cents, and an optional card payment step. Show a clear error if the visit already has a completed checkout. Keep the last loaded snapshot visible with a warning when offline.

### P9. Public booking (`/portal/live/[slug]`)

> Design the public salon page for pet parents. Top: the salon name, its time zone, its hours, and its published services with prices and durations. Then a booking form in four steps: choose a service, choose a date and a time from available slots (30-minute starts), enter your details (name, phone), and tell us about your pet (name, breed, weight, care questions for bite history, anxiety, medical, or senior care). Confirm with a summary and a cancel link. If the salon uses approval mode, show "Requested — the salon will confirm" instead of "Booked." Show a clear message when a slot is taken or the booking limits are reached, with the reason (for example, "You already have 4 upcoming bookings"). Use one design for both the live and demo portals.

### P10. Preview pages (messages, retention, payroll, fleet, operations, import, admin)

> Design one shared preview frame used by every preview page. It has a top banner "Preview — this feature is not connected yet" with a link to the build status page, the page's content with sample data in obviously fake round values, and disabled write buttons with a tooltip that explains they are not connected. Use the same frame for all seven pages so none of them looks live.

### P11. Navigation (top bar, command palette, support widget, demo switcher)

> Design one navigation system used everywhere. Main items: Today (schedule), Clients, Catalog & hours, Checkout & revenue, Public booking page, and More (messages, retention, payroll, fleet, operations, import). Each item shows a small Live or Demo tag. The command palette lists the same items with the same labels. The demo switcher appears only on demo routes and clears its demo context when the user enters a live route, with a short confirmation.

### P12. Checkout and card settlement (checkout drawer)

> Design the checkout drawer for one visit. Steps: review services and the total in dollars (stored as cents), choose "Record checkout only" or "Take card payment." For a card payment, show the three states as a progress line: recorded only, payment started, settled, plus a failed state with the reason and a retry button. Show the reconciliation list for any payment pending over 24 hours. Never show a payment as settled until the server confirms it.

---

## 7. Verification checklist before any workflow is called done

- The screen works at 390 px and 1440 px with no horizontal scroll.
- Every number shows its source and time, and no sample number appears on a live route without a label.
- Every refusal names the rule that refused it.
- Every money figure is whole cents, and recorded and settled totals are separate.
- Keyboard focus is visible and every control has an accessible name.
- The page passes the WCAG AA contrast check, and no status depends on color alone.
- The status claim in the UI matches `docs/build-status.md`.
