'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  CheckCircle2,
  Dog,
  Heart,
  PawPrint,
  Receipt,
  Scissors,
  TriangleAlert,
  Wind,
  BarChart3,
} from 'lucide-react';
import { SAAS_PLANS } from '@/lib/stripe';

// Shared reveal: a section fades up once when it enters the viewport.
// Without JavaScript, or with reduced motion, content is simply visible.
function useReveal() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const elements = document.querySelectorAll<HTMLElement>('[data-reveal]');
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.15 }
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
}

const STEPS = [
  {
    title: 'A pet parent books',
    body: 'Maya picks a time on her phone. No phone call needed.',
  },
  {
    title: 'Your salon sees it on the calendar',
    body: 'The visit lands in the right slot with the right groomer.',
  },
  {
    title: 'The groomer reads the pet’s notes',
    body: 'Allergies, moods, and past cuts are one tap away.',
  },
  {
    title: 'Checkout, then the owner’s report',
    body: 'Checkout always adds up to the cent. The day’s totals are ready.',
  },
];

const STATUS_CYCLE = ['Booked · waiting for arrival', 'Checked in'] as const;

export default function LandingPage() {
  useReveal();
  const [status, setStatus] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const walkthroughRef = useRef<HTMLElement>(null);

  // Hero device: switch the status line every few seconds, unless the user
  // asked for reduced motion.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setStatus((s) => (s + 1) % STATUS_CYCLE.length), 3200);
    return () => window.clearInterval(timer);
  }, []);

  // Walkthrough: scroll position inside the pinned section picks the step.
  useEffect(() => {
    const onScroll = () => {
      const section = walkthroughRef.current;
      if (!section) return;
      const rect = section.getBoundingClientRect();
      const travel = section.offsetHeight - window.innerHeight;
      const progress = Math.min(1, Math.max(0, -rect.top / Math.max(travel, 1)));
      setActiveStep(Math.min(STEPS.length - 1, Math.floor(progress * STEPS.length)));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-obsidian-900 text-zinc-100">
      <style>{`
        [data-reveal] { opacity: 1; transform: none; }
        @media (prefers-reduced-motion: no-preference) {
          [data-reveal] { opacity: 0; transform: translateY(24px); transition: opacity .7s ease, transform .7s ease; }
          [data-reveal].is-in { opacity: 1; transform: none; }
        }
      `}</style>

      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-obsidian-900/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="inline-flex min-h-11 items-center font-heading text-xl font-bold">
            Pawtrackr<span className="text-periwinkle-500">.</span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 text-sm sm:gap-4">
            <a href="#walkthrough" className="hidden min-h-11 items-center px-3 text-white/70 hover:text-white md:inline-flex">How it works</a>
            <a href="#pricing" className="hidden min-h-11 items-center px-3 text-white/70 hover:text-white sm:inline-flex">Pricing</a>
            <Link href="/login" className="inline-flex min-h-11 items-center px-3 text-white/90 underline decoration-white/20 underline-offset-4 hover:text-periwinkle-500">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <div>
        {/* 1. Hero */}
        <section className="relative overflow-hidden pb-14 pt-32 md:pb-[88px] md:pt-40">
          <div aria-hidden="true" className="pointer-events-none absolute -top-24 left-1/2 h-[520px] w-[720px] -translate-x-1/2 rounded-full bg-periwinkle-500/20 blur-[120px]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2 lg:gap-16">
            <div data-reveal>
              <h1 className="font-heading text-[32px] font-bold leading-[1.15] md:text-5xl">
                Run your grooming business in one place.
              </h1>
              <p className="mb-8 mt-5 max-w-[60ch] text-lg text-white/70">
                Pawtrackr is an app that helps pet groomers with booking, pet records, checkout, and reports.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <a
                  href="#walkthrough"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-periwinkle-500 px-7 font-semibold text-obsidian-950 shadow-periwinkle-glow transition hover:brightness-110"
                >
                  See how it works <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </a>
                <div>
                  <Link
                    href="/dashboard"
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-white/20 px-7 text-white transition hover:border-periwinkle-500 hover:text-periwinkle-500 sm:w-auto"
                  >
                    Try the demo
                  </Link>
                  <p className="mt-2 text-center text-sm text-white/55 sm:text-left">Uses sample data</p>
                </div>
              </div>
            </div>

            <div data-reveal className="mx-auto w-full max-w-sm">
              <div
                role="img"
                aria-label={`Sample check-in: Biscuit the dog, status ${STATUS_CYCLE[status]}`}
                className="rounded-[28px] border border-white/10 bg-obsidian-800 p-5 shadow-periwinkle-glow"
              >
                <div className="mb-4 flex items-center justify-between text-sm text-white/60">
                  <span>Today · sample data</span>
                  <PawPrint className="h-4 w-4 text-periwinkle-500" aria-hidden="true" />
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-periwinkle-500/15 text-periwinkle-500">
                      <Dog className="h-7 w-7" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="font-semibold">Biscuit</p>
                      <p className="text-sm text-white/60">Goldendoodle · Full groom</p>
                      <p className="text-sm text-white/60">10:30 am · Owner: Maya</p>
                    </div>
                  </div>
                  <div className="relative mt-4 h-11">
                    {STATUS_CYCLE.map((label, index) => (
                      <div
                        key={label}
                        className={`absolute inset-0 flex items-center justify-center gap-2 rounded-xl border text-sm transition-opacity duration-500 ${
                          index === 0
                            ? 'border-white/15 text-white/70'
                            : 'border-emerald-500/40 bg-emerald-500/15 font-semibold text-emerald-400'
                        } ${status === index ? 'opacity-100' : 'opacity-0'}`}
                      >
                        {index === 1 && <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
                <p className="mt-4 text-sm text-white/55">Notes: nervous around dryers.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Walkthrough: pinned on large screens, stacked on small ones */}
        <section
          id="walkthrough"
          ref={walkthroughRef}
          aria-labelledby="walkthrough-title"
          className="border-y border-white/10 bg-white/[0.015] lg:h-[420vh]"
        >
          <div className="mx-auto max-w-6xl px-5 py-14 lg:sticky lg:top-0 lg:flex lg:h-screen lg:items-center lg:py-0">
            <div className="w-full">
              <h2 id="walkthrough-title" className="mb-8 font-heading text-[28px] font-bold md:mb-10 md:text-4xl">
                From booking to report, in four steps
              </h2>
              <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
                <ol className="space-y-5 md:space-y-6">
                  {STEPS.map((step, index) => (
                    <li
                      key={step.title}
                      className={`flex gap-4 transition-opacity duration-500 ${index <= activeStep ? 'opacity-100' : 'lg:opacity-40'}`}
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-periwinkle-500/50 font-heading font-bold text-periwinkle-500">
                        {index + 1}
                      </span>
                      <div>
                        <h3 className="mb-1 text-xl font-semibold">{step.title}</h3>
                        <p className="max-w-[60ch] text-white/70">{step.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                <div className="relative mx-auto hidden h-[480px] w-full max-w-sm lg:block">
                  {activeStep === 0 && (
                    <Panel label="Pet parent’s phone · sample data">
                      <p className="mb-4 font-heading text-lg">Book Biscuit’s groom</p>
                      <div className="space-y-3 text-sm">
                        <Row label="Service" value="Full groom" />
                        <Row label="Day" value="Saturday" />
                        <Row label="Time" value="10:30 am" highlight />
                      </div>
                      <div className="mt-5 flex min-h-11 items-center justify-center rounded-xl bg-periwinkle-500 font-semibold text-obsidian-950">Book this time</div>
                      <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Booked
                      </p>
                    </Panel>
                  )}
                  {activeStep === 1 && (
                    <Panel label="Salon calendar · Saturday · sample data">
                      <div className="space-y-2 text-sm">
                        <Slot time="9:00" label="Luna · Bath" />
                        <Slot time="10:30" label="Biscuit · Full groom" highlight badge="New" />
                        <Slot time="12:00" label="Max · Nail trim" />
                        <Slot time="1:30" label="Open" open />
                        <Slot time="3:00" label="Daisy · Full groom" />
                      </div>
                    </Panel>
                  )}
                  {activeStep === 2 && (
                    <Panel label="Pet record · sample data">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-periwinkle-500/15 text-periwinkle-500">
                          <Dog className="h-7 w-7" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="font-heading text-lg">Biscuit</p>
                          <p className="text-sm text-white/60">Goldendoodle · 4 years</p>
                        </div>
                      </div>
                      <ul className="space-y-3 text-sm">
                        <Note icon={<TriangleAlert className="h-4 w-4" />} text="Allergic to oatmeal shampoo" />
                        <Note icon={<Wind className="h-4 w-4" />} text="Nervous around dryers" />
                        <Note icon={<Scissors className="h-4 w-4" />} text="Last cut: 2 inch teddy trim" />
                      </ul>
                    </Panel>
                  )}
                  {activeStep === 3 && (
                    <Panel label="Checkout · sample data">
                      <div className="space-y-2 text-sm">
                        <Row label="Full groom" value="$85.00" />
                        <Row label="Nail trim" value="$12.00" />
                        <Row label="Tip" value="$15.00" />
                        <div className="flex justify-between border-t border-white/10 pt-2 font-semibold"><span>Total</span><span>$112.00</span></div>
                      </div>
                      <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-400">
                        <Receipt className="h-4 w-4" aria-hidden="true" /> Paid
                      </p>
                      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                        <p className="mb-1 text-white/55">Owner’s report · today</p>
                        <p>6 pets groomed · $642.00 taken</p>
                      </div>
                    </Panel>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Who it's for */}
        <section aria-labelledby="who-title" className="py-14 md:py-[88px]">
          <div className="mx-auto max-w-6xl px-5">
            <h2 id="who-title" data-reveal className="mb-10 max-w-2xl font-heading text-[28px] font-bold md:text-4xl">
              Made for the whole salon
            </h2>
            <div className="grid gap-5 md:grid-cols-3">
              <Audience icon={<Heart className="h-5 w-5" />} title="Pet parents" body="Book a visit from your phone, any time of day." />
              <Audience icon={<Scissors className="h-5 w-5" />} title="Salon team" body="See your day and every pet’s notes before they arrive." />
              <Audience icon={<BarChart3 className="h-5 w-5" />} title="Owner" body="Your clients stay private to your salon, and your totals add up." />
            </div>
          </div>
        </section>

        {/* 4. Pricing */}
        <section id="pricing" aria-labelledby="pricing-title" className="border-t border-white/10 bg-white/[0.015] py-14 md:py-[88px]">
          <div className="mx-auto max-w-4xl px-5">
            <h2 id="pricing-title" data-reveal className="mb-10 text-center font-heading text-[28px] font-bold md:text-4xl">
              Two simple plans
            </h2>
            <div className="grid gap-5 md:grid-cols-2">
              <Plan
                title="Solo & Mobile Van"
                blurb="For one groomer, in a shop or on the road."
                price={SAAS_PLANS.solo_van.monthlyPriceDollars}
                href="/signup?plan=solo_van"
                cta="Choose Solo"
              />
              <Plan
                title="Multi-Staff Salon"
                blurb="For a team with several groomers."
                price={SAAS_PLANS.salon_pro.monthlyPriceDollars}
                href="/signup?plan=salon_pro"
                cta="Choose Multi-Staff"
              />
            </div>
            <p data-reveal className="mt-6 text-center text-sm text-white/55">
              Prices per month.
            </p>
          </div>
        </section>
      </div>

      <footer className="border-t border-white/10 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-heading text-lg font-bold">Pawtrackr<span className="text-periwinkle-500">.</span></p>
            <p className="mt-1 text-sm text-white/60">Demo uses sample data.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-2">
            <Link href="/login" className="inline-flex min-h-11 items-center px-3 text-white/80 hover:text-periwinkle-500">Sign in</Link>
            <Link href="/signup" className="inline-flex min-h-11 items-center px-3 text-white/80 hover:text-periwinkle-500">Create a salon</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 rounded-[28px] border border-white/10 bg-obsidian-800 p-5">
      <p className="mb-3 text-sm text-white/55">{label}</p>
      {children}
    </div>
  );
}

function Row({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex justify-between rounded-xl border p-3 ${highlight ? 'border-periwinkle-500/50' : 'border-white/10'}`}>
      <span className="text-white/60">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Slot({ time, label, highlight = false, badge, open = false }: { time: string; label: string; highlight?: boolean; badge?: string; open?: boolean }) {
  return (
    <div className="flex gap-3">
      <span className="w-16 text-white/50">{time}</span>
      <div
        className={`flex flex-1 items-center justify-between rounded-lg border p-2.5 ${
          highlight ? 'border-periwinkle-500/50 bg-periwinkle-500/15' : open ? 'border-dashed border-white/15 text-white/40' : 'border-white/10 bg-white/5'
        }`}
      >
        <span>{label}</span>
        {badge && <span className="font-semibold text-emerald-400">{badge}</span>}
      </div>
    </div>
  );
}

function Note({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-2 rounded-xl border border-white/10 p-3">
      <span className="text-periwinkle-500" aria-hidden="true">{icon}</span>
      {text}
    </li>
  );
}

function Audience({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <article data-reveal className="rounded-2xl border border-white/10 bg-obsidian-800 p-6 transition hover:-translate-y-1 hover:border-periwinkle-500/40">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-periwinkle-500/15 text-periwinkle-500" aria-hidden="true">{icon}</div>
      <h3 className="mb-2 text-xl font-semibold">{title}</h3>
      <p className="text-white/70">{body}</p>
    </article>
  );
}

function Plan({ title, blurb, price, href, cta }: { title: string; blurb: string; price: number; href: string; cta: string }) {
  return (
    <article data-reveal className="flex flex-col rounded-2xl border border-white/10 bg-obsidian-800 p-7">
      <h3 className="mb-1 text-xl font-semibold">{title}</h3>
      <p className="mb-5 text-white/70">{blurb}</p>
      <p className="mb-6">
        <span className="font-heading text-4xl font-bold">${price}</span>
        <span className="text-white/60"> / month</span>
      </p>
      <Link href={href} className="mt-auto inline-flex min-h-12 items-center justify-center rounded-full border border-periwinkle-500/60 font-semibold text-periwinkle-500 transition hover:bg-periwinkle-500 hover:text-obsidian-950">
        {cta}
      </Link>
    </article>
  );
}
