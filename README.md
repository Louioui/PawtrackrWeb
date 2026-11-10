# Pawtrackr Web

Pawtrackr Web is a Next.js prototype for pet grooming salons and mobile groomers. It includes an interactive command center, public booking preview, client profiles, and owner analytics. The current records are illustrative demo data. **This repository is not ready to serve real salon or pet-parent data or charge payments.**

## Run locally

```bash
npm ci
npm run dev
```

The development app uses an on-disk demo ledger in `.pawtrackr-data/`. Set `PAWTRACKR_DEMO_DATA_DIR` to a separate directory for isolated QA. In a production build, the legacy demo APIs for store writes, demo booking, demo checkout, and preview billing return HTTP 503. The separate live staff, public-booking, onboarding, payment-intent, and verified Stripe-webhook routes fail closed when their required configuration is absent.

## Verify

```bash
npm test
npm run typecheck
npm run test:migrations
npm run test:e2e
npm run check:production-env
```

`npm test` checks the app's pure data and math code, production-configuration validator, and static architecture inventory. `test:migrations` applies the SQL to a temporary PostgreSQL database with a minimal Supabase auth/storage fixture and tests selected tenant boundaries. `test:e2e` builds the app and runs browser workflows in Chrome while forcibly replacing any inherited Supabase configuration with a project-ref-shaped `.invalid` host and non-secret test key; use `test:e2e:configured` only when intentionally testing with the current environment. `check:production-env` validates live URLs and credential shapes without printing their values; it is expected to fail until every required deployment secret is supplied. `npm run release:check` combines that configuration gate with the full build, migration, and isolated browser suites. A dedicated Supabase project has the schema and a verified anonymous booking path, but these checks do not establish real Stripe settlement or complete production authorization.

The GitHub Actions workflow runs three independent gates on pushes and pull requests to `Master`: unit/type/build verification, all SQL migrations against an isolated PostgreSQL runtime, and all browser/responsive/offline/accessibility scenarios against a project-ref-shaped `.invalid` Supabase host. CI does not use or mutate the hosted Pawtrackr database.

## What works in the demo

- Salon settings and package catalogs shared by the demo portal and POS.
- Recorded completed checkout totals, UTC daily chart and CSV, period comparisons, weekly target pacing, and explicit source/sync status.
- Client weight history with dated observations, exact values, and mobile checks.
- Local booking and checkout flows with bounded validation, slot-overlap checks, cent-based math, and visible failure states.
- Offline demo snapshot retry and conflict preservation for competing edits.

## Production gates

A dedicated Pawtrackr Supabase project exists with the complete multi-tenant schema (`0001`–`0022` applied to the hosted project and verified in temporary PostgreSQL). Authenticated staff endpoints and views exist for recorded checkout analytics (`/dashboard/analytics/live`), salon-local appointments (`/dashboard/appointments/live`), client/pet intake and weight logging (`/dashboard/clients/live`), and live catalog, operating-hours, groomer, and shift management (`/dashboard/settings/live`). Owner sign-up with salon provisioning (`/signup`), public online booking on `/portal/live/[slug]`, database-enforced availability, and Stripe-verified payment settlement are built. The hosted schema, grants, wrappers, triggers, foreign-key indexes, and advisor state are verified; a temporary hosted salon also proved anonymous availability, successful booking, occupied-window removal, and duplicate-slot rejection through the real Data API before every fixture was deleted. Owner onboarding still needs a real hosted Auth provisioning test, and Stripe has not been exercised. Pet-parent accounts, staff invitations, a card-entry UI, subscription billing, and private photo delivery are still required. The current production API boundary deliberately rejects demo writes while those pieces are absent. See [build status](docs/build-status.md), [production data boundary](docs/production-data-boundary.md), [live appointments design contract](docs/live-appointments-design-contract.md), and [analytics visualization contract](docs/analytics-visualization.md) for the evidence and remaining work.
