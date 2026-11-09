import React from 'react';
import Link from 'next/link';
import { ArrowRight, Globe, MapPin, ShieldCheck, Star } from 'lucide-react';
import { BUSINESSES, BUSINESS_CONFIGS } from '@/lib/mock-tenant-data';

export default function PortalDirectoryPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-periwinkle-500/35 bg-periwinkle-500/10 px-3.5 py-1 text-xs font-semibold text-periwinkle-300">
          <Globe className="h-3.5 w-3.5" />
          Multi-Tenant Self-Booking Directory
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold text-white">
          Select Your Grooming Salon or Mobile Van
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Each business operates on an isolated <code className="text-emerald-300">business_id</code>{' '}
          tenant with its own custom JSONB service catalog and pricing.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        {BUSINESSES.map((biz) => {
          const cfg = BUSINESS_CONFIGS[biz.id];
          return (
            <Link
              key={biz.id}
              href={`/portal/${biz.slug}`}
              className="glass-card-interactive flex flex-col justify-between p-6"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-periwinkle-300">
                    pawtrackr.live/{biz.slug}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {cfg.custom_settings.rating} ({cfg.custom_settings.reviewCount})
                  </span>
                </div>

                <h2 className="mt-3 text-2xl font-bold text-white">
                  {biz.name}
                </h2>
                <p className="mt-1 text-xs text-zinc-300">
                  {cfg.custom_settings.tagline}
                </p>

                <div className="mt-4 flex items-center gap-1.5 text-xs text-zinc-400">
                  <MapPin className="h-3.5 w-3.5 text-periwinkle-400" />
                  <span>{cfg.custom_settings.address}</span>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {cfg.custom_settings.packages.slice(0, 3).map((pkg) => (
                    <span
                      key={pkg.id}
                      className="rounded-lg border border-white/[0.08] bg-obsidian-900/80 px-2.5 py-1 text-[11px] text-zinc-300"
                    >
                      {pkg.name} (${pkg.price})
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-white/[0.08] pt-4 text-xs font-bold text-emerald-400">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  Instant Online Booking Open
                </span>
                <span className="inline-flex items-center gap-1 text-periwinkle-300">
                  Book Appointment <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
