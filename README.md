# 🏛️ Pawtrackr Web — Enterprise Multi-Tenant Vertical SaaS for Pet Groomers

Pawtrackr Web is an enterprise-grade, multi-tenant B2B vertical SaaS platform built to outperform legacy competitors (**MoeGo**, **DaySmart Pet**, and **PawLoyalty**) by combining strict **Supabase PostgreSQL Row-Level Security (RLS)** isolation with local-first sub-10ms performance and an obsidian dark-mode Apple Pro aesthetic.

---

## ✨ Core Architectural Pillars

### 1. Strict Multi-Tenant Data Isolation (`business_id` + RLS)
Every tenant table (`businesses`, `business_configs`, `staff_members`, `clients`, `pets`, `visits`, `transactions`, `digital_waivers`, `retail_inventory`, `gift_cards_and_credits`, `staff_shifts`, `intake_questionnaires`, `review_requests`, `audit_logs`) is strictly partitioned by `business_id` (UUID) and enforced at the database layer via PostgreSQL Row-Level Security (`public.current_business_id()`).
- **Core Schema Migration**: `supabase/migrations/0001_multi_tenant_schema.sql`
- **Waivers, Storage Bucket RLS & Payroll RPC Migration**: `supabase/migrations/0002_waivers_storage_and_payroll.sql`
- **50-Point Enterprise Roadmap Migration**: `supabase/migrations/0003_enterprise_50_roadmap.sql`
- **Sequential Migration Verifier**: `scripts/migrate-runner.mjs` (`npm run migrate:check`)
- **Multi-Tenant Seed Data**: `supabase/seed.sql`

### 2. Three Frictionless User Portals
- **🌐 Module A — Public Acquisition & Self-Service Booking (`/` & `/portal/[salon-slug]`)**
  - High-converting B2B SaaS marketing site with a **60-Second Salon Provisioner** (`/`).
  - Custom salon self-booking portals (`/portal/bespoke-grooming` & `/portal/splash-grooming`) driven by each business's JSONB `business_configs`.
- **🖥️ Module B — Business Owner & Staff Command Center (`/dashboard`)**
  - **Unified Calendar**: Handles online self-service bookings and instant front-desk walk-in intake side-by-side.
  - **Sub-10ms Multi-Token Search Engine (`src/lib/search-engine.ts`)**: Simultaneously matches partial dog names, client names, unformatted phone digits, breeds, and behavior tags in `< 1 ms`.
  - **4-Step Atomic POS Checkout (`src/lib/pos-math.ts` & `src/components/AtomicPOSModal.tsx`)**: Pure integer-cent & basis-point financial arithmetic guaranteeing zero floating-point drift and `$0.00 (0¢)` end-of-day drawer reconciliation.
  - **Behavior Auras & Safety Flags (`src/components/BehaviorAuraBadge.tsx`)**: Luminous safety badges (`BITE RISK ALERT`, `MATTED COAT`, `SENIOR SANCTUARY`, `HEART MURMUR`, `DRYER / NOISE SENSITIVE`).
  - **1-Click Legacy Competitor Importer (`/dashboard/import`)**: Zero-downtime migration studio for MoeGo, DaySmart Pet, PawLoyalty, and Square that automatically converts unstructured notes into Pawtrackr Behavior Auras.
  - **Executive Revenue & Upsell Analytics (`/dashboard/analytics`)**: Tracks Average Ticket lift, Spa Add-On Attachment Rate, and No-Show Deposit Recovery.
  - **2-Way Client SMS & Coat Approval Concierge (`/dashboard/messages`)**: Live SMS inbox with 1-tap macros for Matted Coat Demat/Shave Consent (+$25), Hydro-Spa progress updates, and Ready-for-Pickup Contactless Pay links.
  - **Offline-First Service Worker (`public/sw.js`)**: Ensures mobile grooming vans and salons on Android, Windows, iOS, macOS, and ChromeOS remain operational in low-signal driveways.
- **📱 Module C — Client Retention Portal (`/client/[id]`)**
  - Complete grooming visit history & stylist digital report cards.
  - Interactive **Before-and-After Photo Gallery** with side-by-side coat comparison.
  - **Automatic Loyalty Points & Rewards Engine** with instant reward tier redemptions.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run the automated POS math, Sub-10ms search & RLS verification suite
npm test

# 3. Start the development server
npm run dev

# 4. Build for production
npm run build && npm start
```
# PawtrackrWeb
