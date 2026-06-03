'use client';

import { useEffect, useMemo, useState } from 'react';
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

type NotificationPreferences = {
  pushLikeEnabled: boolean;
  pushCommentEnabled: boolean;
  pushReplyEnabled: boolean;
  pushMentionEnabled: boolean;
  pushMessageEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStartMinutes: number;
  quietHoursEndMinutes: number;
  quietHoursTimeZone: string;
};

type PushSubscriptionJSON = {
  endpoint: string;
};

type NotificationGroup = {
  key: string;
  href: string;
  type: NotifT['type'];
  targetType: string | null;
  createdAt: string;
  unread: boolean;
  items: NotifT[];
  actors: NotifT['actor'][];
};

const VERB: Record<NotifT['type'], string> = {
  LIKE: 'liked your',
  COMMENT: 'commented on your post',
  REPLY: 'replied to your comment',
  MENTION: 'mentioned you',
  MESSAGE: 'messaged you',
};

function toTimeInputValue(minutes: number) {
  const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
  const minute = String(minutes % 60).padStart(2, '0');
  return `${hour}:${minute}`;
}

function fromTimeInputValue(value: string) {
  const [hour, minute] = value.split(':').map((part) => parseInt(part, 10));
  return hour * 60 + minute;
}

function actorLabel(actors: NotifT['actor'][]) {
  if (actors.length === 0) return 'Someone';
  if (actors.length === 1) return actors[0].displayName;
  return `${actors[0].displayName} and ${actors.length - 1} others`;
}

function summaryForGroup(group: NotificationGroup) {
  const noun =
    group.type === 'LIKE' && group.targetType === 'POST'
      ? ' post'
      : group.type === 'LIKE' && group.targetType === 'COMMENT'
        ? ' comment'
        : '';

  return `${actorLabel(group.actors)} ${VERB[group.type]}${noun}`;
}

function groupNotifications(items: NotifT[]): NotificationGroup[] {
  const groups: NotificationGroup[] = [];

  for (const item of items) {
    const previous = groups[groups.length - 1];
    const withinWindow =
      previous &&
      new Date(previous.createdAt).getTime() - new Date(item.createdAt).getTime() <= 6 * 60 * 60 * 1000;
    const sameBucket =
      previous &&
      previous.type === item.type &&
      previous.href === item.href &&
      previous.targetType === item.targetType &&
      withinWindow;

    if (!sameBucket) {
      groups.push({
        key: item.id,
        href: item.href,
        type: item.type,
        targetType: item.targetType,
        createdAt: item.createdAt,
        unread: !item.readAt,
        items: [item],
        actors: [item.actor],
      });
      continue;
    }

    previous.items.push(item);
    previous.unread = previous.unread || !item.readAt;
    const hasActor = previous.actors.some((actor) => actor.id === item.actor.id);
    if (!hasActor) previous.actors.push(item.actor);
  }

  return groups;
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
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [preferencesBusy, setPreferencesBusy] = useState(false);
  const [quietStart, setQuietStart] = useState('22:00');
  const [quietEnd, setQuietEnd] = useState('08:00');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPushSupported('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
    if (typeof Notification === 'undefined') return;
    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (!preferences) return;
    setQuietStart(toTimeInputValue(preferences.quietHoursStartMinutes));
    setQuietEnd(toTimeInputValue(preferences.quietHoursEndMinutes));
  }, [preferences]);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
    if (status !== 'authenticated') return;
    Promise.all([
      api<{ notifications: NotifT[] }>('/api/notifications').then((r) => setItems(r.notifications)),
      apiJson('/api/notifications/read-all', {}).then(() => mutate('/api/notifications')).catch(() => {}),
      api<PushConfig>('/api/notifications/push-config')
        .then(async (config) => {
          setPushConfigured(config.enabled && Boolean(config.publicKey));
          if (!config.enabled || !('serviceWorker' in navigator)) {
            setPushSubscribed(false);
            return;
          }
          const registration = await navigator.serviceWorker.register('/sw.js');
          const subscription = await registration.pushManager.getSubscription();
          setPushSubscribed(Boolean(subscription));
        })
        .catch(() => {
          setPushConfigured(false);
        }),
      api<{ preferences: NotificationPreferences }>('/api/notifications/preferences')
        .then((r) => setPreferences(r.preferences))
        .catch(() => {
          setPreferences(null);
        }),
    ]);
  }, [mutate, router, status]);

  const groupedItems = useMemo(() => groupNotifications(items), [items]);

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

  async function updatePreference(patch: Partial<NotificationPreferences>) {
    if (!preferences || preferencesBusy) return;
    const next = { ...preferences, ...patch };
    setPreferences(next);
    setPreferencesBusy(true);

    try {
      const response = await apiJson<{ preferences: NotificationPreferences }>(
        '/api/notifications/preferences',
        patch,
        'PATCH',
      );
      setPreferences(response.preferences);
    } catch {
      setPreferences(preferences);
    } finally {
      setPreferencesBusy(false);
    }
  }

  async function saveQuietHours() {
    if (!preferences) return;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || preferences.quietHoursTimeZone;
    await updatePreference({
      quietHoursEnabled: preferences.quietHoursEnabled,
      quietHoursStartMinutes: fromTimeInputValue(quietStart),
      quietHoursEndMinutes: fromTimeInputValue(quietEnd),
      quietHoursTimeZone: timeZone,
    });
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
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div>
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
                    checked={preferences[key as keyof NotificationPreferences] as boolean}
                    disabled={preferencesBusy}
                    onChange={(e) => updatePreference({ [key]: e.target.checked } as Partial<NotificationPreferences>)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 dark:border-slate-700"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Quiet hours</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Push notifications will pause during these hours in your local timezone.
                </div>
              </div>
              <input
                type="checkbox"
                checked={preferences.quietHoursEnabled}
                disabled={preferencesBusy}
                onChange={(e) => updatePreference({ quietHoursEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 dark:border-slate-700"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-slate-700 dark:text-slate-300">Start</span>
                <input
                  type="time"
                  value={quietStart}
                  onChange={(e) => setQuietStart(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-700 dark:text-slate-300">End</span>
                <input
                  type="time"
                  value={quietEnd}
                  onChange={(e) => setQuietEnd(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
            </div>

            <div className="mt-2 text-xs text-slate-500">
              Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone || preferences.quietHoursTimeZone}
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={saveQuietHours}
                disabled={preferencesBusy}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                {preferencesBusy ? 'Saving...' : 'Save quiet hours'}
              </button>
            </div>
          </div>
        </div>
      )}

      {groupedItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700">
          No activity yet.
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {groupedItems.map((group) => (
            <li key={group.key} className={group.unread ? 'bg-slate-50 dark:bg-slate-800/40' : ''}>
              <Link href={group.href} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800">
                <div className="flex -space-x-2">
                  {group.actors.slice(0, 3).map((actor) => (
                    <img
                      key={actor.id}
                      src={avatarFor(actor)}
                      alt=""
                      className="h-10 w-10 rounded-full border-2 border-white dark:border-slate-900"
                    />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{summaryForGroup(group)}</span>
                    {group.items.length > 1 && (
                      <span className="ml-2 text-xs text-slate-500">{group.items.length} updates</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">{new Date(group.createdAt).toLocaleString()}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
