'use client';

import { usePathname } from 'next/navigation';

// The marketing front page has its own header and footer. The app's navigation,
// support widget and demo switcher belong to the product screens, so they are
// left off the front page instead of stacking on top of its header.
export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/') return null;
  return <>{children}</>;
}
