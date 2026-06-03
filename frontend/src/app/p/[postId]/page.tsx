import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PostDetailPageClient from './PostDetailPageClient';
import type { CommentT, PostT } from '@/lib/public-page-types';

const siteUrl = process.env.NEXTAUTH_URL || process.env.FRONTEND_URL || 'https://qanda.space';
const backendUrl =
  process.env.BACKEND_URL ||
  process.env.PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:4000';

function summarize(text: string, max = 160) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}...`;
}

const getPost = cache(async (postId: string): Promise<PostT | null> => {
  const res = await fetch(`${backendUrl}/api/posts/${encodeURIComponent(postId)}`, {
    next: { revalidate: 300 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch post ${postId}`);
  const data = (await res.json()) as { post: PostT };
  return data.post;
});

const getComments = cache(async (postId: string): Promise<CommentT[]> => {
  const res = await fetch(`${backendUrl}/api/posts/${encodeURIComponent(postId)}/comments`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { comments: CommentT[] };
  return data.comments;
});

export async function generateMetadata({
  params,
}: {
  params: { postId: string };
}): Promise<Metadata> {
  const post = await getPost(params.postId);

  if (!post) {
    return {
      title: 'Post Not Found',
      robots: { index: false, follow: false },
    };
  }

  const title = `Q&A Solution by ${post.author.displayName} (@${post.author.handle}) | QandA`;
  const description = summarize(post.body);
  const url = `${siteUrl}/p/${post.id}`;
  const image = post.imageUrl ? (post.imageUrl.startsWith('http') ? post.imageUrl : `${siteUrl}${post.imageUrl}`) : undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title,
      description,
      url,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function PostDetailPage({ params }: { params: { postId: string } }) {
  const [post, comments] = await Promise.all([getPost(params.postId), getComments(params.postId)]);
  if (!post) notFound();
  return <PostDetailPageClient postId={params.postId} initialPost={post} initialComments={comments} />;
}
