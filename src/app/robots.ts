import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pawtrackr.live';
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/portal', '/portal/*'],
      disallow: ['/dashboard/*', '/admin/*', '/api/*'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
