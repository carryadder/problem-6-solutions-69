import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProfilePageClient from './ProfilePageClient';
import type { ProfileT } from '@/lib/public-page-types';

const siteUrl = process.env.NEXTAUTH_URL || process.env.FRONTEND_URL || 'http://localhost:3002';
const backendUrl =
  process.env.BACKEND_URL ||
  process.env.PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:4000';

function summarize(text: string, max = 160) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}...`;
}

const getProfile = cache(async (handle: string): Promise<ProfileT | null> => {
  const res = await fetch(`${backendUrl}/api/users/${encodeURIComponent(handle)}`, {
    next: { revalidate: 300 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch profile ${handle}`);
  const data = (await res.json()) as { user: ProfileT };
  return data.user;
});

export async function generateMetadata({
  params,
}: {
  params: { handle: string };
}): Promise<Metadata> {
  const user = await getProfile(params.handle);

  if (!user) {
    return {
      title: 'Profile Not Found',
      robots: { index: false, follow: false },
    };
  }

  const title = `${user.displayName} (@${user.handle})`;
  const description = summarize(
    user.bio || `${user.displayName} on Gather. View profile details and ${user.postCount} public posts.`,
  );
  const url = `${siteUrl}/u/${user.handle}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'profile',
      title,
      description,
      url,
      images: user.profilePicture ? [{ url: user.profilePicture.startsWith('http') ? user.profilePicture : `${siteUrl}${user.profilePicture}` }] : undefined,
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: user.profilePicture ? [user.profilePicture.startsWith('http') ? user.profilePicture : `${siteUrl}${user.profilePicture}`] : undefined,
    },
  };
}

export default async function ProfilePage({ params }: { params: { handle: string } }) {
  const user = await getProfile(params.handle);
  if (!user) notFound();
  return <ProfilePageClient handle={params.handle} initialUser={user} />;
}
