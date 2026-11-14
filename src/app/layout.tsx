import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TopNav } from '@/components/TopNav';
import { SupportAndTourWidget } from '@/components/SupportAndTourWidget';
import { DemoSwitcherBar } from '@/components/DemoSwitcherBar';

export const viewport: Viewport = {
  themeColor: '#0B090E',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://pawtrackr.live'),
  title: 'Pawtrackr — The All-In-One Pet Grooming Platform',
  description:
    'Modern cloud operating system for pet salons, mobile groomers, and pet parents. Real-time scheduling, client portals, and atomic POS checkout.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Pawtrackr',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: 'Pawtrackr — The All-In-One Pet Grooming Platform',
    description:
      'Modern cloud operating system for pet salons, mobile groomers, and pet parents. Real-time scheduling, client portals, and atomic POS checkout.',
    type: 'website',
    siteName: 'Pawtrackr',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pawtrackr — The All-In-One Pet Grooming Platform',
    description:
      'Modern cloud operating system for pet salons, mobile groomers, and pet parents. Real-time scheduling, client portals, and atomic POS checkout.',
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
