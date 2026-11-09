import type { Metadata } from 'next';
import './globals.css';
import { TopNav } from '@/components/TopNav';
import { SupportAndTourWidget } from '@/components/SupportAndTourWidget';

export const metadata: Metadata = {
  title: 'Pawtrackr Web — Universal Multi-Tenant SaaS for Pet Grooming Salons',
  description:
    'Built to outperform MoeGo, DaySmart Pet, and PawLoyalty across Android, Windows, iOS, macOS, and Web. Multi-tenant Supabase RLS isolation, Sub-10ms Multi-Token Search, Behavior Auras, and 4-Step Atomic POS Checkout.',
  manifest: '/manifest.json',
  openGraph: {
    title: 'Pawtrackr Web — #1 Enterprise Multi-Tenant Pet Grooming OS',
    description:
      'Zero-lag sub-10ms search, 4-step atomic POS checkout, luminous Behavior Auras, and strict PostgreSQL Row-Level Security.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-obsidian-900 bg-obsidian-radial text-zinc-100 selection:bg-periwinkle-500/30 selection:text-periwinkle-200">
        <TopNav />
        <main className="relative">{children}</main>
        <SupportAndTourWidget />
      </body>
    </html>
  );
}
