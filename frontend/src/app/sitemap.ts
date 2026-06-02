import type { MetadataRoute } from 'next';

const siteUrl =
  process.env.NEXTAUTH_URL ||
  process.env.FRONTEND_URL ||
  'http://localhost:3002';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: `${siteUrl}/`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
  ];
}
