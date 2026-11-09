import { MetadataRoute } from 'next';
import { BUSINESSES } from '@/lib/mock-tenant-data';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pawtrackr.live';

  const salonPortalUrls = BUSINESSES.map((b) => ({
    url: `${baseUrl}/portal/${b.slug}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.9,
  }));

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/portal`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.95,
    },
    ...salonPortalUrls,
  ];
}
