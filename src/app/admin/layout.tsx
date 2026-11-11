import { notFound } from 'next/navigation';

// The founder command panel is a demo surface with no sign-in yet. It must not
// be reachable from a deployed site until platform-owner access exists.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return children;
}
