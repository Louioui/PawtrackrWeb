import type { Metadata } from 'next';
import './globals.css';
import { TopNav } from '@/components/TopNav';
import { SupportAndTourWidget } from '@/components/SupportAndTourWidget';
import { DemoSwitcherBar } from '@/components/DemoSwitcherBar';

export const metadata: Metadata = {
  title: 'Pawtrackr — The All-In-One Pet Grooming Platform',
  description:
    'Modern cloud operating system for pet salons, mobile groomers, and pet parents. Real-time scheduling, client portals, and atomic POS checkout.',
  manifest: '/manifest.json',
  openGraph: {
    title: 'Pawtrackr — The All-In-One Pet Grooming Platform',
    description:
      'Modern cloud operating system for pet salons, mobile groomers, and pet parents. Real-time scheduling, client portals, and atomic POS checkout.',
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
        <DemoSwitcherBar />
      </body>
    </html>
  );
}
