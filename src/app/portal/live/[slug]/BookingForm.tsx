'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, Clock } from 'lucide-react';
import { PublicBookingConfirmation, parseBookingConfirmation, validatePublicBookingRequest } from '@/lib/public-booking';

export type BookableService = { id: string; name: string; price: number | null; durationMinutes: number | null };

const field = 'mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white';
const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const localDate = (instant: Date, timeZone: string) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(instant).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export default function BookingForm({ slug, salonName, services, timeZone, hours }: {
  slug: string; salonName: string; services: BookableService[]; timeZone: string; hours: { open: string; close: string } | null;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [date, setDate] = useState('');
  const [bounds, setBounds] = useState<{ min: string; max: string } | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotState, setSlotState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [slotMessage, setSlotMessage] = useState('');
  const [asOf, setAsOf] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [petName, setPetName] = useState('');
  const [breed, setBreed] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState<PublicBookingConfirmation | null>(null);
  const requestId = useRef(0);

  const service = services.find((item) => item.id === serviceId) ?? null;
  const timeLabel = useMemo(() => new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }), [timeZone]);
  const dayLabel = useMemo(() => new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), [timeZone]);

  // Dates are the salon's calendar days, not the visitor's. Set after mount so
  // server and browser render the same first paint.
  useEffect(() => {
    const today = new Date();
    const min = localDate(today, timeZone);
    setBounds({ min, max: localDate(new Date(today.getTime() + 89 * 86_400_000), timeZone) });
    setDate(localDate(new Date(today.getTime() + 86_400_000), timeZone));
  }, [timeZone]);

  useEffect(() => {
    if (!serviceId || !date) return;
    const current = ++requestId.current;
    setSlotState('loading'); setSlots(null); setStartsAt(''); setSlotMessage('');
    const query = new URLSearchParams({ slug, package_id: serviceId, date });
    fetch(`/api/public/availability?${query}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as { slots?: unknown; as_of?: unknown; error?: string };
        if (current !== requestId.current) return;
        if (!response.ok || !Array.isArray(body.slots)) throw new Error(body.error ?? 'Available times could not be loaded.');
        setSlots(body.slots.filter((item): item is string => typeof item === 'string'));
        setAsOf(typeof body.as_of === 'string' ? body.as_of : '');
        setSlotState('idle');
      })
      .catch((error: unknown) => {
        if (current !== requestId.current) return;
        setSlotState('error');
        setSlotMessage(error instanceof Error && error.message !== 'Failed to fetch' ? error.message : 'Available times could not be loaded. Check your connection and try again.');
      });
  }, [slug, serviceId, date]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const checked = validatePublicBookingRequest({
      slug, package_id: serviceId, starts_at: startsAt, client_name: clientName, client_phone: phone,
      client_email: email, pet_name: petName, breed,
    });
    if (!checked.ok) { setMessage(checked.error); return; }
    setSubmitting(true); setMessage('');
    try {
      const response = await fetch('/api/public/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(checked.request),
      });
      const body = await response.json() as { booking?: unknown; error?: string };
      const booked = response.ok ? parseBookingConfirmation(body.booking) : null;
      if (!booked) {
        setMessage(body.error ?? 'We could not confirm that booking. It was not saved; please try again.');
        if (response.status === 409) { setStartsAt(''); setSlots((list) => list?.filter((item) => item !== startsAt) ?? null); }
        return;
      }
      setConfirmation(booked);
    } catch {
      setMessage('The connection dropped before we got an answer, so we do not know whether your booking was saved. Please contact the salon before trying again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmation) {
    return <section className="glass-card mt-8 border-emerald-400/30 p-5 sm:p-6" aria-labelledby="confirmed-heading" role="status">
      <div className="flex items-start gap-3">
        <CalendarCheck className="mt-1 h-6 w-6 shrink-0 text-emerald-400" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="confirmed-heading" className="text-xl font-bold text-white">You’re booked at {salonName}</h2>
          <p className="mt-1 text-sm text-zinc-300">Your appointment is confirmed. Save your reference in case you need to change it.</p>
        </div>
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-zinc-400">Reference</dt><dd className="font-mono text-lg font-semibold text-white">{confirmation.reference}</dd></div>
        <div><dt className="text-zinc-400">Service</dt><dd className="text-white">{confirmation.service} · {money(confirmation.price)}</dd></div>
        <div><dt className="text-zinc-400">Date</dt><dd className="text-white">{dayLabel.format(new Date(confirmation.starts_at))}</dd></div>
        <div><dt className="text-zinc-400">Time</dt><dd className="text-white">{timeLabel.format(new Date(confirmation.starts_at))}–{timeLabel.format(new Date(confirmation.ends_at))} <span className="text-zinc-400">({confirmation.time_zone.replaceAll('_', ' ')})</span></dd></div>
      </dl>
      <p className="mt-5 text-xs text-zinc-500">The price shown is for the service you chose. Add-ons, tax, and tip are settled with the salon at checkout. To cancel or reschedule, contact the salon with your reference.</p>
    </section>;
  }

  return <section className="glass-card mt-8 p-5 sm:p-6" aria-labelledby="book-heading">
    <h2 id="book-heading" className="text-xl font-bold text-white">Book an appointment</h2>
    <p className="mt-1 text-sm text-zinc-400">Times are shown in the salon’s time zone ({timeZone.replaceAll('_', ' ')}).</p>
    <form onSubmit={submit} className="mt-5 space-y-6">
      <fieldset>
        <legend className="text-sm font-semibold text-zinc-200">1. Choose a service</legend>
        <div className="mt-2 grid gap-2">
          {services.map((item) => <label key={item.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 ${serviceId === item.id ? 'border-periwinkle-300 bg-periwinkle-400/10' : 'border-white/10 hover:border-white/25'}`}>
            <span className="flex min-w-0 items-center gap-3">
              <input type="radio" name="service" value={item.id} checked={serviceId === item.id} onChange={() => setServiceId(item.id)} className="h-4 w-4 accent-periwinkle-400" />
              <span className="min-w-0"><span className="block font-semibold text-white">{item.name}</span>{item.durationMinutes && <span className="block text-xs text-zinc-400">About {item.durationMinutes} minutes</span>}</span>
            </span>
            {item.price !== null && <span className="shrink-0 font-mono text-sm text-white">{money(item.price)}</span>}
          </label>)}
        </div>
      </fieldset>

      <div>
        <label htmlFor="booking-date" className="text-sm font-semibold text-zinc-200">2. Pick a day</label>
        <input id="booking-date" type="date" required value={date} min={bounds?.min} max={bounds?.max} onChange={(event) => setDate(event.target.value)} className={`${field} sm:max-w-xs`} />
      </div>

      <fieldset aria-live="polite" aria-busy={slotState === 'loading'}>
        <legend className="text-sm font-semibold text-zinc-200">3. Pick a time</legend>
        {slotState === 'loading' && <p className="mt-2 text-sm text-zinc-400">Checking open times…</p>}
        {slotState === 'error' && <p role="alert" className="mt-2 text-sm text-amber-200">{slotMessage}</p>}
        {slotState === 'idle' && slots && slots.length === 0 && <p className="mt-2 rounded-lg border border-white/10 p-3 text-sm text-zinc-300">
          No open times on this day{service?.durationMinutes ? ` for a ${service.durationMinutes}-minute service` : ''}.{hours ? ` The salon’s hours are ${hours.open}–${hours.close}; ` : ' '}the day may be fully booked, the groomers may be off, or it may be too soon to book. Try another day.
        </p>}
        {slotState === 'idle' && slots && slots.length > 0 && <>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((slot) => <button key={slot} type="button" aria-pressed={startsAt === slot} onClick={() => setStartsAt(slot)}
              className={`min-h-11 rounded-lg border text-sm font-semibold ${startsAt === slot ? 'border-periwinkle-300 bg-periwinkle-400 text-obsidian-950' : 'border-white/15 text-white hover:border-periwinkle-300/60'}`}>{timeLabel.format(new Date(slot))}</button>)}
          </div>
          {asOf && <p className="mt-2 flex items-center gap-1 text-xs text-zinc-500"><Clock className="h-3 w-3" aria-hidden="true" />Open times as of {timeLabel.format(new Date(asOf))}. A time can be taken before you finish.</p>}
        </>}
      </fieldset>

      <fieldset disabled={!startsAt} className="space-y-4 disabled:opacity-50">
        <legend className="text-sm font-semibold text-zinc-200">4. Your details</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs text-zinc-300">Your full name<input required maxLength={120} autoComplete="name" value={clientName} onChange={(event) => setClientName(event.target.value)} className={field} /></label>
          <label className="block text-xs text-zinc-300">Mobile phone<input required type="tel" inputMode="tel" autoComplete="tel" maxLength={25} value={phone} onChange={(event) => setPhone(event.target.value)} className={field} /></label>
          <label className="block text-xs text-zinc-300">Email (optional)<input type="email" autoComplete="email" maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} className={field} /></label>
          <label className="block text-xs text-zinc-300">Pet’s name<input required maxLength={80} value={petName} onChange={(event) => setPetName(event.target.value)} className={field} /></label>
          <label className="block text-xs text-zinc-300 sm:col-span-2">Breed<input required maxLength={80} value={breed} onChange={(event) => setBreed(event.target.value)} className={field} placeholder="e.g. Goldendoodle" /></label>
        </div>
      </fieldset>

      {message && <p role="alert" className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">{message}</p>}
      <button type="submit" disabled={!startsAt || submitting} className="min-h-12 w-full rounded-lg bg-periwinkle-400 px-4 text-sm font-bold text-obsidian-950 hover:bg-periwinkle-300 disabled:cursor-not-allowed disabled:opacity-50">
        {submitting ? 'Booking…' : startsAt && service ? `Book ${service.name} at ${timeLabel.format(new Date(startsAt))}` : 'Pick a time to continue'}
      </button>
      <p className="text-xs text-zinc-500">No payment is taken online. We use your phone number only so the salon can reach you about this visit.</p>
    </form>
  </section>;
}
