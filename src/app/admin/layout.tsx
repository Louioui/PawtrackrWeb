import { notFound } from 'next/navigation';
import { handleAdminRequest } from '@/lib/admin-guard';

/**
 * Root layout for the founder super-admin command panel.
 *
 * The founder command panel is a demo surface with no sign-in yet. It must not
 * be reachable from a deployed site until platform-owner access exists.
 *
 * @param props - Layout component properties including child nodes.
 * @returns The rendered child components when allowed, or terminates via `notFound()`.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const result = handleAdminRequest();
  if (!result.allowed) notFound();
  return children;
}
