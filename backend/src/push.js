import webpush from 'web-push';
import { prisma } from './db.js';
import { redis } from './redis.js';

const PUSH_VAPID_PUBLIC_KEY = process.env.PUSH_VAPID_PUBLIC_KEY || '';
const PUSH_VAPID_PRIVATE_KEY = process.env.PUSH_VAPID_PRIVATE_KEY || '';
const PUSH_VAPID_SUBJECT = process.env.PUSH_VAPID_SUBJECT || 'mailto:admin@localhost';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3002';

const pushConfigured = Boolean(PUSH_VAPID_PUBLIC_KEY && PUSH_VAPID_PRIVATE_KEY);

if (pushConfigured) {
  webpush.setVapidDetails(PUSH_VAPID_SUBJECT, PUSH_VAPID_PUBLIC_KEY, PUSH_VAPID_PRIVATE_KEY);
}

function titleForNotification(notification) {
  switch (notification.type) {
    case 'LIKE':
      return `${notification.actor.displayName} liked your ${notification.targetType === 'COMMENT' ? 'comment' : 'post'}`;
    case 'COMMENT':
      return `${notification.actor.displayName} commented on your post`;
    case 'REPLY':
      return `${notification.actor.displayName} replied to your comment`;
    case 'MENTION':
      return `${notification.actor.displayName} mentioned you`;
    case 'MESSAGE':
      return `${notification.actor.displayName} sent you a message`;
    default:
      return 'New activity on Gather';
  }
}

function bodyForNotification(notification) {
  if (notification.preview) return notification.preview;
  if (notification.type === 'LIKE') return 'Open Gather to view the activity.';
  return 'Open Gather to view the update.';
}

function normalizeUrl(url) {
  if (!url) return `${FRONTEND_URL}/notifications`;
  return url.startsWith('http') ? url : `${FRONTEND_URL}${url}`;
}

function iconForNotification(notification) {
  if (!notification.actor?.profilePicture) return `${FRONTEND_URL}/avatars/avatar-01.svg`;
  return notification.actor.profilePicture.startsWith('http')
    ? notification.actor.profilePicture
    : `${FRONTEND_URL}${notification.actor.profilePicture}`;
}

function pushPreferenceEnabled(user, type) {
  switch (type) {
    case 'LIKE':
      return user.pushLikeEnabled;
    case 'COMMENT':
      return user.pushCommentEnabled;
    case 'REPLY':
      return user.pushReplyEnabled;
    case 'MENTION':
      return user.pushMentionEnabled;
    case 'MESSAGE':
      return user.pushMessageEnabled;
    default:
      return true;
  }
}

function throttleWindowSeconds(type) {
  switch (type) {
    case 'LIKE':
      return 120;
    case 'COMMENT':
    case 'REPLY':
      return 45;
    case 'MESSAGE':
      return 30;
    default:
      return 60;
  }
}

function throttleKey(userId, notification) {
  const target = notification.href || `${notification.targetType || 'none'}:${notification.targetId || 'none'}`;
  const actor = notification.actor?.id || 'unknown';
  return `push:notify:${userId}:${notification.type}:${actor}:${target}`;
}

async function shouldSendPushNotification(userId, notification) {
  const key = throttleKey(userId, notification);
  const created = await redis.set(key, '1', 'EX', throttleWindowSeconds(notification.type), 'NX');
  return created === 'OK';
}

export function isPushConfigured() {
  return pushConfigured;
}

export function getPushPublicKey() {
  return PUSH_VAPID_PUBLIC_KEY || null;
}

export async function sendPushNotification(userId, notification) {
  if (!pushConfigured) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      pushLikeEnabled: true,
      pushCommentEnabled: true,
      pushReplyEnabled: true,
      pushMentionEnabled: true,
      pushMessageEnabled: true,
    },
  });

  if (!user || !pushPreferenceEnabled(user, notification.type)) return;
  if (!(await shouldSendPushNotification(userId, notification))) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { endpoint: true, p256dh: true, auth: true },
  });

  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    title: titleForNotification(notification),
    body: bodyForNotification(notification),
    url: normalizeUrl(notification.href),
    tag: notification.id,
    icon: iconForNotification(notification),
  });

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
        );
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await prisma.pushSubscription.deleteMany({
            where: { endpoint: subscription.endpoint },
          });
          return;
        }
        console.error('[push] send failed', error?.statusCode || error?.message || error);
      }
    }),
  );
}
