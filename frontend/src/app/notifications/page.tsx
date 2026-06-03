'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { api, apiJson } from '@/lib/api';
import { avatarFor } from '@/lib/avatar';
import { urlBase64ToUint8Array } from '@/lib/push';
import { useSWRConfig } from 'swr';

type NotifT = {
  id: string;
  type: 'LIKE' | 'COMMENT' | 'REPLY' | 'MENTION' | 'MESSAGE';
  targetType: string | null;
  targetId: string | null;
  href: string;
  readAt: string | null;
  createdAt: string;
  actor: { id: string; handle: string; displayName: string; profilePicture: string | null };
};

type PushConfig = {
  enabled: boolean;
  publicKey: string | null;
};

type PushPreferences = {
  pushLikeEnabled: boolean;
  pushCommentEnabled: boolean;
  pushReplyEnabled: boolean;
  pushMentionEnabled: boolean;
  pushMessageEnabled: boolean;
};

type PushSubscriptionJSON = {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

const VERB: Record<NotifT['type'], string> = {
  LIKE: 'liked your',
  COMMENT: 'commented on your post',
  REPLY: 'replied to your comment',
  MENTION: 'mentioned you',
  MESSAGE: 'messaged you',
};

function linkFor(n: NotifT): string {
  if (n.href) return n.href;
  if (n.targetType === 'POST' && n.targetId) return `/p/${n.targetId}`;
  if (n.type === 'MESSAGE' && n.targetId) return `/chat/${n.targetId}`;
  if (n.type === 'MESSAGE') return '/chat';
  return `/u/${n.actor.handle}`;
}

export default function NotificationsPage() {
  const { status } = useSession();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [items, setItems] = useState<NotifT[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [pushSupported, setPushSupported] = useState(false);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [preferences, setPreferences] = useState<PushPreferences | null>(null);
  const [preferencesBusy, setPreferencesBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPushSupported('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
    if (typeof Notification === 'undefined') return;
    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
    if (status !== 'authenticated') return;
    Promise.all([
      api<{ notifications: NotifT[] }>('/api/notifications').then((r) => setItems(r.notifications)),
      apiJson('/api/notifications/read-all', {}).then(() => mutate('/api/notifications')).catch(() => {}),
      api<PushConfig>('/api/notifications/push-config').then(async (config) => {
        setPushConfigured(config.enabled && Boolean(config.publicKey));
        if (!config.enabled || !('serviceWorker' in navigator)) {
          setPushSubscribed(false);
          return;
        }
        const registration = await navigator.serviceWorker.register('/sw.js');
        const subscription = await registration.pushManager.getSubscription();
        setPushSubscribed(Boolean(subscription));
      }).catch(() => {
        setPushConfigured(false);
      }),
      api<{ preferences: PushPreferences }>('/api/notifications/preferences').then((r) => setPreferences(r.preferences)).catch(() => {
        setPreferences(null);
      }),
    ]);
  }, [mutate, router, status]);

  async function enablePushNotifications() {
    if (!pushSupported || pushBusy) return;
    setPushBusy(true);

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== 'granted') return;

      const config = await api<PushConfig>('/api/notifications/push-config');
      setPushConfigured(config.enabled && Boolean(config.publicKey));
      if (!config.enabled || !config.publicKey) return;

      const registration = await navigator.serviceWorker.register('/sw.js');
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey),
        });
      }

      await apiJson('/api/notifications/push-subscriptions', subscription.toJSON());
      setPushSubscribed(true);
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePushNotifications() {
    if (!pushSupported || pushBusy || !('serviceWorker' in navigator)) return;
    setPushBusy(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setPushSubscribed(false);
        return;
      }

      const json = subscription.toJSON() as PushSubscriptionJSON;
      await apiJson('/api/notifications/push-subscriptions', { endpoint: json.endpoint }, 'DELETE');
      await subscription.unsubscribe();
      setPushSubscribed(false);
    } finally {
      setPushBusy(false);
    }
  }

  async function updatePreference(key: keyof PushPreferences, value: boolean) {
    if (!preferences || preferencesBusy) return;
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    setPreferencesBusy(true);

    try {
      const response = await apiJson<{ preferences: PushPreferences }>(
        '/api/notifications/preferences',
        { [key]: value },
        'PATCH',
      );
      setPreferences(response.preferences);
    } catch {
      setPreferences(preferences);
    } finally {
      setPreferencesBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Notifications</h1>
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Push notifications</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {!pushSupported && 'This browser does not support service worker push notifications.'}
              {pushSupported && !pushConfigured && 'Push notifications are not configured on the server yet.'}
              {pushSupported && pushConfigured && notificationPermission === 'denied' && 'Notifications are blocked in this browser. Enable them in browser settings.'}
              {pushSupported && pushConfigured && notificationPermission !== 'denied' && pushSubscribed && 'Push notifications are enabled for this device.'}
              {pushSupported && pushConfigured && notificationPermission !== 'denied' && !pushSubscribed && 'Enable push notifications for messages and activity even when the app is closed.'}
            </div>
          </div>
          {pushSupported && pushConfigured && !pushSubscribed && notificationPermission !== 'denied' && (
            <button
              type="button"
              onClick={enablePushNotifications}
              disabled={pushBusy}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-900"
            >
              {pushBusy ? 'Working...' : 'Enable'}
            </button>
          )}
          {pushSupported && pushConfigured && pushSubscribed && (
            <button
              type="button"
              onClick={disablePushNotifications}
              disabled={pushBusy}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              {pushBusy ? 'Working...' : 'Disable'}
            </button>
          )}
        </div>
      </div>
      {preferences && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Push preferences</div>
          <div className="space-y-3">
            {[
              ['pushLikeEnabled', 'Likes on your posts and comments'],
              ['pushCommentEnabled', 'Comments on your posts'],
              ['pushReplyEnabled', 'Replies to your comments'],
              ['pushMentionEnabled', 'Mentions'],
              ['pushMessageEnabled', 'Direct messages'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-700 dark:text-slate-300">{label}</span>
                <input
                  type="checkbox"
                  checked={preferences[key as keyof PushPreferences]}
                  disabled={preferencesBusy}
                  onChange={(e) => updatePreference(key as keyof PushPreferences, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 dark:border-slate-700"
                />
              </label>
            ))}
          </div>
        </div>
      )}
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700">
          No activity yet.
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {items.map((n) => (
            <li key={n.id} className={n.readAt ? '' : 'bg-slate-50 dark:bg-slate-800/40'}>
              <Link
                href={linkFor(n)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <img src={avatarFor(n.actor)} alt="" className="h-10 w-10 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className="font-semibold">{n.actor.displayName}</span>{' '}
                    <span className="text-slate-600 dark:text-slate-400">{VERB[n.type]}</span>
                    {n.type === 'LIKE' && n.targetType === 'POST' && ' post'}
                    {n.type === 'LIKE' && n.targetType === 'COMMENT' && ' comment'}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
