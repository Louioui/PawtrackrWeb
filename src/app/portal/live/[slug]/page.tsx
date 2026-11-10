import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicBookingClient, parsePublicCatalog, parsePublicSalon } from '@/lib/public-booking';
import BookingForm, { BookableService } from './BookingForm';

export const dynamic = 'force-dynamic';

const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

export default async function LiveSalonCatalogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) notFound();
  const client = getPublicBookingClient();
  if (!client) return <main className="mx-auto max-w-4xl px-4 py-12"><p role="alert" className="glass-card p-6 text-amber-200">The live catalog is unavailable.</p></main>;
  const [directory, catalog] = await Promise.all([
    client.from('booking_business_directory').select('id,name,slug,city_state').eq('slug', slug).maybeSingle(),
    client.from('booking_service_catalog').select('slug,packages,addons,operating_hours,time_zone').eq('slug', slug).maybeSingle(),
  ]);
  if (directory.error || catalog.error) return <main className="mx-auto max-w-4xl px-4 py-12"><p role="alert" className="glass-card p-6 text-amber-200">The live catalog is unavailable.</p></main>;
  const salon = parsePublicSalon(directory.data);
  if (!salon || !catalog.data) notFound();
  const services = parsePublicCatalog(catalog.data);
  // Online booking needs a service the database can price and time, plus a zone
  // and hours to place it in. Anything less stays a read-only catalog.
  const bookable: BookableService[] = services.packages.flatMap((item) =>
    item.id && item.price !== null && item.durationMinutes !== null
      ? [{ id: item.id, name: item.name, price: item.price, durationMinutes: item.durationMinutes }] : []);
  const canBook = bookable.length > 0 && services.timeZone !== null && services.operatingHours !== null;

  return <main className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6">
    <Link href="/portal/live" className="text-sm text-periwinkle-300 hover:text-white">← All live salons</Link>
    <header className="mt-7"><p className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">Published service catalog</p><h1 className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">{salon.name}</h1>{salon.city_state && <p className="mt-2 text-sm text-zinc-400">{salon.city_state}</p>}</header>
    <section className="glass-card mt-8 p-5 sm:p-6" aria-labelledby="packages-heading"><h2 id="packages-heading" className="text-xl font-bold text-white">Grooming services</h2>
      {services.packages.length ? <ul className="mt-4 divide-y divide-white/10">{services.packages.map((service, index) => <li key={`${service.name}-${index}`} className="flex flex-wrap justify-between gap-3 py-4"><div><h3 className="font-semibold text-zinc-100">{service.name}</h3>{service.description && <p className="mt-1 text-sm text-zinc-400">{service.description}</p>}{service.durationMinutes && <p className="mt-1 text-xs text-zinc-500">About {service.durationMinutes} minutes</p>}</div>{service.price !== null && <span className="font-mono font-semibold text-white">{money(service.price)}</span>}</li>)}</ul>
        : <p className="mt-4 text-sm text-zinc-400">This salon has not published services yet.</p>}
    </section>
    {services.addons.length > 0 && <section className="glass-card mt-5 p-5 sm:p-6" aria-labelledby="addons-heading"><h2 id="addons-heading" className="text-xl font-bold text-white">Add-ons</h2><ul className="mt-4 divide-y divide-white/10">{services.addons.map((service, index) => <li key={`${service.name}-${index}`} className="flex justify-between gap-3 py-3 text-sm"><span className="text-zinc-200">{service.name}</span>{service.price !== null && <span className="font-mono text-white">{money(service.price)}</span>}</li>)}</ul></section>}
    {services.operatingHours && <p className="mt-5 text-sm text-zinc-400">Published hours: {services.operatingHours.open}–{services.operatingHours.close} {services.timeZone ?? '(time zone unavailable)'}.</p>}
    {canBook && services.timeZone
      ? <BookingForm slug={salon.slug} salonName={salon.name} services={bookable} timeZone={services.timeZone} hours={services.operatingHours} />
      : <p className="glass-card mt-8 p-5 text-sm text-zinc-300">Online booking is not open for this salon yet. Please contact the salon to make an appointment.</p>}
    <p className="mt-7 border-t border-white/10 pt-4 text-xs text-zinc-500">Source: Pawtrackr public booking catalog.</p>
  </main>;
}
