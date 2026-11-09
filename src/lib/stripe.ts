// ============================================================================
// PAWTRACKR WEB — STRIPE CONNECT & STRIPE BILLING ENGINE
// 1. Stripe Billing: $119/mo (Solo/Van) & $149/mo (Multi-Staff Salon) SaaS Plans
// 2. Stripe Connect: POS destination charges with automatic salon payouts
// ============================================================================

import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? '';

export const isStripeConfigured = Boolean(
  stripeSecretKey && !stripeSecretKey.includes('your_stripe_secret')
);

export const stripe = isStripeConfigured
  ? new Stripe(stripeSecretKey, {
      typescript: true,
    })
  : null;

export const SAAS_PLANS = {
  solo_van: {
    id: 'solo_van',
    name: 'Solo Stylist & Mobile Van',
    monthlyPriceDollars: 119,
    annualPriceDollars: 99,
    stripePriceId: process.env.STRIPE_SOLO_PLAN_PRICE_ID ?? 'price_solo_119',
    features: [
      '1 Groomer / Mobile Van Operator',
      'Custom Booking Portal (pawtrackr.live/your-van)',
      'Sub-10ms Multi-Token Client & Pet Search',
      '4-Step Atomic POS & Stripe Terminal Ready',
      'Behavior Auras & Safety Handling Flags',
      'Digital Report Cards & Before/After Gallery',
    ],
  },
  salon_pro: {
    id: 'salon_pro',
    name: 'Multi-Staff Salon Command Suite',
    monthlyPriceDollars: 149,
    annualPriceDollars: 129,
    stripePriceId: process.env.STRIPE_SALON_PLAN_PRICE_ID ?? 'price_salon_149',
    features: [
      'Unlimited Groomers, Bathers & Front-Desk Staff',
      'Unified Multi-Table & Walk-In Command Calendar',
      'Strict Multi-Tenant RLS Data Isolation',
      'Automated Commission & Tip Split Ledgers',
      'Loyalty Points Engine & Automated SMS Retention',
      'End-of-Day Zero-Drift Drawer Reconciliation',
    ],
  },
} as const;
