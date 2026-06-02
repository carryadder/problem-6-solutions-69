import type { MetadataRoute } from 'next';

const siteUrl =
  process.env.NEXTAUTH_URL ||
  process.env.FRONTEND_URL ||
  'http://localhost:3002';

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
