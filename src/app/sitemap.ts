import { MetadataRoute } from 'next';
import { getPublicBookingClient, parsePublicSalon } from '@/lib/public-booking';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pawtrackr.live';
  const client = getPublicBookingClient();
  const response = client
    ? await client.from('booking_business_directory').select('id,name,slug,city_state')
    : null;
  const salons = (response?.data ?? []).map(parsePublicSalon).filter((salon) => salon !== null);

  return [
    {
      url: baseUrl,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/portal/live`,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/privacy`,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/login`,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/signup`,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    ...salons.map((salon) => ({
      url: `${baseUrl}/portal/live/${salon.slug}`,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
  ];
}
