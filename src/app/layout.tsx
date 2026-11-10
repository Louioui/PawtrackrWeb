import type { Metadata } from 'next';
import './globals.css';
import { TopNav } from '@/components/TopNav';
import { SupportAndTourWidget } from '@/components/SupportAndTourWidget';
import { DemoSwitcherBar } from '@/components/DemoSwitcherBar';

export const metadata: Metadata = {
  title: 'Pawtrackr Web — Pet Grooming Workspace Demo',
  description:
    'Explore Pawtrackr’s pet grooming dashboard demo, booking flow, client portal, and checkout analytics.',
  manifest: '/manifest.json',
  openGraph: {
    title: 'Pawtrackr Web — Pet Grooming Workspace Demo',
    description:
      'Preview the Pawtrackr grooming dashboard, client portal, booking flow, and checkout analytics with sample data.',
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
