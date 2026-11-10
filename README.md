# Pawtrackr Web

Pawtrackr Web is a Next.js prototype for pet grooming salons and mobile groomers. It includes an interactive command center, public booking preview, client profiles, and owner analytics. The current records are illustrative demo data. **This repository is not ready to serve real salon or pet-parent data or charge payments.**

## Run locally

```bash
npm ci
npm run dev
```

The development app uses an on-disk demo ledger in `.pawtrackr-data/`. Set `PAWTRACKR_DEMO_DATA_DIR` to a separate directory for isolated QA. In a production build, the demo APIs for store writes, booking, checkout, billing, and Stripe webhooks return HTTP 503. The UI remains a demo preview.

## Verify

```bash
npm test
npm run typecheck
npm run test:migrations
npm run test:e2e
```

`npm test` checks the app's pure data and math code plus a static architecture inventory. `test:migrations` applies the SQL to a temporary local PostgreSQL database with a minimal Supabase auth/storage fixture and tests selected tenant boundaries. `test:e2e` builds the app and runs browser workflows in Chrome. A dedicated Supabase project now has the schema, but these checks do not establish real payment settlement or complete production authorization.

## What works in the demo

- Salon settings and package catalogs shared by the demo portal and POS.
- Recorded completed checkout totals, UTC daily chart and CSV, period comparisons, weekly target pacing, and explicit source/sync status.
- Client weight history with dated observations, exact values, and mobile checks.
- Local booking and checkout flows with bounded validation, slot-overlap checks, cent-based math, and visible failure states.
- Offline demo snapshot retry and conflict preservation for competing edits.

## Production gates

A dedicated Pawtrackr Supabase project exists with the multi-tenant schema (`0001`–`0015` applied to the hosted project; `0001`–`0019` in `supabase/migrations/` verified in local PostgreSQL). Authenticated staff endpoints and views exist for recorded checkout analytics (`/dashboard/analytics/live`), UTC daily appointments (`/dashboard/appointments/live`), client/pet intake and weight logging (`/dashboard/clients/live`), and live catalog, operating-hours, and groomer management (`/dashboard/settings/live`); Owner sign-up with salon provisioning (`/signup`), public online booking on `/portal/live/[slug]`, a salon-local staff calendar, and Stripe-verified payment settlement are built and verified locally, but migrations `0016`–`0019` are not applied to the hosted project and those flows have not been run against real Auth or Stripe. Pet-parent accounts, staff invitations, a card-entry UI, and private photo delivery are still required. The current production API boundary deliberately rejects demo writes while those pieces are absent. See [build status](docs/build-status.md), [production data boundary](docs/production-data-boundary.md), [live appointments design contract](docs/live-appointments-design-contract.md), and [analytics visualization contract](docs/analytics-visualization.md) for the evidence and remaining work.
