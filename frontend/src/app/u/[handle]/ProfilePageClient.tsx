'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, apiJson } from '@/lib/api';
import { avatarFor } from '@/lib/avatar';
import { useSession, signOut } from 'next-auth/react';
import type { ProfileT } from '@/lib/public-page-types';

export default function ProfilePageClient({
  handle,
  initialUser,
}: {
  handle: string;
  initialUser: ProfileT;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [user, setUser] = useState<ProfileT | null>(initialUser);
  const [error, setError] = useState(false);
  const [shared, setShared] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);

  useEffect(() => {
    api<{ user: ProfileT }>(`/api/users/${handle}`)
      .then((r) => {
        setUser(r.user);
        setError(false);
      })
      .catch(() => setError(true));
  }, [handle]);

  async function startChat() {
    if (!user) return;
    setActionMessage(null);
    try {
      const { conversation } = await apiJson<{ conversation: { id: string } }>(
        '/api/conversations',
        { withUserId: user.id },
      );
      router.push(`/chat/${conversation.id}`);
    } catch (e: any) {
      if ((e.message || '').includes('blocked')) {
        setActionMessage('Chat is unavailable because one of you is blocked.');
      }
    }
  }

  async function shareProfile() {
    if (!user) return;
    try {
      const { url } = await apiJson<{ url: string }>(`/api/users/${user.handle}/share`, {});
      const full = `${window.location.origin}${url}`;
      if (navigator.share) {
        await navigator.share({ url: full, title: `@${user.handle} on Gather` });
      } else {
        await navigator.clipboard.writeText(full);
      }
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      // ignore
    }
  }

  async function toggleBlock() {
    if (!user || blockBusy) return;
    setBlockBusy(true);
    setActionMessage(null);
    const nextBlocked = !user.blockedByMe;

    try {
      if (nextBlocked) {
        await apiJson(`/api/users/${user.handle}/block`, {});
      } else {
        await apiJson(`/api/users/${user.handle}/block`, {}, 'DELETE');
      }
      setUser({ ...user, blockedByMe: nextBlocked });
      if (nextBlocked) setActionMessage('User blocked. Messaging is disabled until you unblock them.');
    } catch {
      setActionMessage('Could not update block state.');
    } finally {
      setBlockBusy(false);
    }
  }

  if (error) return <div className="p-6 text-center text-slate-500">User not found.</div>;
  if (!user) return <div className="p-6 text-center text-slate-500">Loading...</div>;

  const isMe = (session as any)?.handle === user.handle;

  const avatarUrl = avatarFor(user);
  const fullAvatarUrl = avatarUrl
    ? avatarUrl.startsWith('http')
      ? avatarUrl
      : `https://qanda.space${avatarUrl}`
    : undefined;

  const schema = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "mainEntity": {
      "@type": "Person",
      "name": user.displayName,
      "additionalName": user.handle,
      "description": user.bio || undefined,
      "image": fullAvatarUrl,
      "interactionStatistic": [
        {
          "@type": "InteractionCounter",
          "interactionType": "https://schema.org/WriteAction",
          "userInteractionCount": user.postCount
        }
      ]
    }
  };

  return (
    <div className="space-y-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <img src={avatarFor(user)} alt="" className="h-24 w-24 rounded-full" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold">{user.displayName}</h1>
            <div className="text-sm text-slate-500">@{user.handle}</div>
            {user.bio && <p className="mt-2 whitespace-pre-wrap text-sm">{user.bio}</p>}
            <div className="mt-2 text-xs text-slate-500">{user.postCount} posts</div>
            {actionMessage && <div className="mt-2 text-xs text-rose-600 dark:text-rose-400">{actionMessage}</div>}
            {user.hasBlockedMe && <div className="mt-2 text-xs text-rose-600 dark:text-rose-400">This user blocked you.</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            {isMe ? (
              <button
                type="button"
                onClick={() => router.push('/settings/profile')}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                Edit profile
              </button>
            ) : (
              <button
                type="button"
                onClick={startChat}
                disabled={Boolean(user.blockedByMe || user.hasBlockedMe)}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                Message
              </button>
            )}
            {!isMe && (
              <button
                type="button"
                onClick={toggleBlock}
                disabled={blockBusy}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                {user.blockedByMe ? 'Unblock' : 'Block'}
              </button>
            )}
            <button
              type="button"
              onClick={shareProfile}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
            >
              {shared ? 'Copied!' : 'Share'}
            </button>
            {isMe && (
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/' })}
                className="rounded-full border border-rose-200 bg-rose-50/50 text-rose-600 px-4 py-2 text-sm dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-400 hover:bg-rose-100/50 dark:hover:bg-rose-950/40 transition-colors"
              >
                Log out
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
