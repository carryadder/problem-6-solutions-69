import type { MetadataRoute } from 'next';

const siteUrl =
  process.env.NEXTAUTH_URL ||
  process.env.FRONTEND_URL ||
  'https://qanda.space';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/u/', '/p/'],
        disallow: ['/api/', '/chat/', '/feed', '/login', '/notifications', '/search', '/settings/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
