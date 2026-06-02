import type { MetadataRoute } from 'next';

const siteUrl =
  process.env.NEXTAUTH_URL ||
  process.env.FRONTEND_URL ||
  'http://localhost:3002';
const backendUrl =
  process.env.BACKEND_URL ||
  process.env.PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:4000';

type SitemapUser = {
  handle: string;
  updatedAt: string;
};

type SitemapPost = {
  id: string;
  updatedAt: string;
};

export const revalidate = 3600;
export const dynamic = 'force-dynamic';

async function getSitemapUsers(): Promise<SitemapUser[]> {
  try {
    const res = await fetch(`${backendUrl}/api/users/sitemap`, {
      next: { revalidate },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { users: SitemapUser[] };
    return data.users;
  } catch {
    return [];
  }
}

async function getSitemapPosts(): Promise<SitemapPost[]> {
  try {
    const res = await fetch(`${backendUrl}/api/posts/sitemap`, {
      next: { revalidate },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { posts: SitemapPost[] };
    return data.posts;
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [users, posts] = await Promise.all([getSitemapUsers(), getSitemapPosts()]);

  return [
    {
      url: `${siteUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    ...users.map((user) => ({
      url: `${siteUrl}/u/${user.handle}`,
      lastModified: new Date(user.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...posts.map((post) => ({
      url: `${siteUrl}/p/${post.id}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
