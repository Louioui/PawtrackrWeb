import { NextRequest, NextResponse } from 'next/server';
import { SAAS_PLANS, stripe } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      salonName,
      slug,
      ownerEmail,
      planId = 'salon_pro',
    }: {
      salonName: string;
      slug: string;
      ownerEmail: string;
      planId: 'solo_van' | 'salon_pro';
    } = body;

    if (!salonName || !slug || !ownerEmail) {
      return NextResponse.json(
        { error: 'salonName, slug, and ownerEmail are required.' },
        { status: 400 }
      );
    }

    const cleanSlug = slug
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '');

    const selectedPlan = SAAS_PLANS[planId] ?? SAAS_PLANS.salon_pro;

    // If Stripe is configured with live/test keys, create Checkout Session + Connect onboarding
    if (stripe) {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: ownerEmail,
        line_items: [
          {
            price: selectedPlan.stripePriceId,
            quantity: 1,
          },
        ],
        metadata: {
          salon_name: salonName,
          salon_slug: cleanSlug,
          plan_id: selectedPlan.id,
        },
        success_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/dashboard?tenant=${cleanSlug}&onboarded=1`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/?canceled=1`,
      });

      return NextResponse.json({
        ok: true,
        mode: 'stripe_live',
        checkoutUrl: session.url,
        business: {
          id: crypto.randomUUID(),
          name: salonName,
          slug: cleanSlug,
          owner_email: ownerEmail,
          subscription_plan: selectedPlan.id,
          subscription_status: 'active',
        },
      });
    }

    // Instant local-first B2B tenant provisioning
    return NextResponse.json({
      ok: true,
      mode: 'instant_provisioned',
      bookingPortalUrl: `/portal/${cleanSlug}`,
      dashboardUrl: `/dashboard`,
      business: {
        id: crypto.randomUUID(),
        name: salonName,
        slug: cleanSlug,
        owner_email: ownerEmail,
        subscription_plan: selectedPlan.id,
        monthly_rate: selectedPlan.monthlyPriceDollars,
        subscription_status: 'active',
        created_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Subscription provisioning failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
