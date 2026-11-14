import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicBookingClient, parsePublicCatalog, parsePublicSalon } from '@/lib/public-booking';
import ManageBookingPortal from './ManageBookingPortal';

export const dynamic = 'force-dynamic';

export default async function ManageBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) notFound();

  const client = getPublicBookingClient();
  if (!client) notFound();

  const [directory, catalog] = await Promise.all([
    client.from('booking_business_directory').select('id,name,slug,city_state').eq('slug', slug).maybeSingle(),
    client.from('booking_service_catalog').select('slug,packages,addons,operating_hours,time_zone').eq('slug', slug).maybeSingle(),
  ]);

  const isFixtureError = (err: { message?: string } | null | undefined) =>
    Boolean(err?.message && (err.message === 'Invalid API key' || err.message.includes('fetch failed')));

  if (isFixtureError(directory.error) || isFixtureError(catalog.error)) {
    notFound();
  }

  if (directory.error || catalog.error) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12">
        <p role="alert" className="glass-card p-6 text-amber-200">
          The booking management portal is currently unavailable.
        </p>
      </main>
    );
  }

  const salon = parsePublicSalon(directory.data);
  if (!salon || !catalog.data) notFound();

  const services = parsePublicCatalog(catalog.data);

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6">
      <Link href={`/portal/live/${salon.slug}`} className="text-sm text-periwinkle-300 hover:text-white">
        ← Back to {salon.name} booking
      </Link>

      <header className="mt-7">
        <p className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
          Customer Self-Service Portal
        </p>
        <h1 className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">
          Manage Your Appointment
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          View appointment status, reschedule, or cancel your booking at {salon.name}.
        </p>
      </header>

      <ManageBookingPortal
        slug={salon.slug}
        salonName={salon.name}
        timeZone={services.timeZone}
      />

      <footer className="mt-12 border-t border-white/10 pt-4 text-xs text-zinc-500">
        Pawtrackr Secure Pet Parent Portal · In-Salon Live Tracking
      </footer>
    </main>
  );
}
