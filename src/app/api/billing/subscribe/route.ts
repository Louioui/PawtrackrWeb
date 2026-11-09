import { NextRequest, NextResponse } from 'next/server';
import { SAAS_PLANS } from '@/lib/stripe';
import { requireLocalDemoApi } from '@/lib/demo-boundary';

export async function POST(req: NextRequest) {
  const blocked = requireLocalDemoApi();
  if (blocked) return blocked;
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

    // Preview response only. No Stripe session or tenant is provisioned.
    return NextResponse.json({
      ok: true,
      mode: 'demo_preview',
      bookingPortalUrl: `/portal/${cleanSlug}`,
      dashboardUrl: `/dashboard`,
      business: {
        id: crypto.randomUUID(),
        name: salonName,
        slug: cleanSlug,
        owner_email: ownerEmail,
        subscription_plan: selectedPlan.id,
        monthly_rate: selectedPlan.monthlyPriceDollars,
        subscription_status: 'trialing',
        created_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Subscription provisioning failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
