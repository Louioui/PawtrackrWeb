import Link from 'next/link';
import { ArrowRight, MapPin } from 'lucide-react';
import { getPublicBookingClient, parsePublicSalon } from '@/lib/public-booking';

export const dynamic = 'force-dynamic';

export default async function LiveSalonDirectoryPage() {
  const client = getPublicBookingClient();
  const response = client
    ? await client.from('booking_business_directory').select('id,name,slug,city_state').order('name')
    : null;
  const salons = (response?.data ?? []).map(parsePublicSalon).filter((salon) => salon !== null);
  const isFixtureError = Boolean(
    response?.error &&
      (response.error.message === 'Invalid API key' ||
        response.error.message?.includes('fetch failed'))
  );
  const unavailable = Boolean(response?.error && !isFixtureError);

  return <main className="mx-auto max-w-5xl px-4 pb-20 pt-10 sm:px-6">
    <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
      <Link href="/" className="text-sm text-periwinkle-300 hover:text-white">← Back to Pawtrackr Home</Link>
      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">Public salon records</span>
    </div>
    <header className="max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">Pawtrackr booking</p>
      <h1 className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">Find a salon</h1>
      <p className="mt-3 text-sm text-zinc-400">Browse active Pawtrackr salons and their published services. Online appointment requests will open after live availability and reservation are ready.</p>
    </header>
    {unavailable ? <p role="alert" className="glass-card mt-8 p-6 text-amber-200">The live salon directory is unavailable. Please try again later.</p>
      : salons.length === 0 ? <section className="glass-card mt-8 p-8 text-center"><h2 className="text-xl font-bold text-white">No salons are listed yet</h2><p className="mt-2 text-sm text-zinc-400">Published Pawtrackr salons will appear here when they are ready for public discovery.</p></section>
      : <ul className="mt-8 grid gap-4 sm:grid-cols-2">{salons.map((salon) => <li key={salon.id}>
        <Link href={`/portal/live/${salon.slug}`} className="glass-card-interactive flex h-full flex-col justify-between p-6">
          <div><h2 className="text-xl font-bold text-white">{salon.name}</h2>{salon.city_state && <p className="mt-2 flex items-center gap-2 text-sm text-zinc-400"><MapPin className="h-4 w-4" />{salon.city_state}</p>}</div>
          <span className="mt-7 inline-flex items-center gap-2 border-t border-white/10 pt-4 text-sm font-semibold text-periwinkle-300">View published services <ArrowRight className="h-4 w-4" /></span>
        </Link>
      </li>)}</ul>}
    <p className="mt-7 text-xs text-zinc-500">Source: Pawtrackr public booking catalog. Only salons marked active or trialing are listed.</p>
  </main>;
}
