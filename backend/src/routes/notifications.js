import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';
import { getPushPublicKey, isPushConfigured } from '../push.js';

const router = Router();

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const DeletePushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
});

const PushPreferencesSchema = z.object({
  pushLikeEnabled: z.boolean().optional(),
  pushCommentEnabled: z.boolean().optional(),
  pushReplyEnabled: z.boolean().optional(),
  pushMentionEnabled: z.boolean().optional(),
  pushMessageEnabled: z.boolean().optional(),
});

router.get('/preferences', requireAuth, (req, res) => {
  res.json({
    preferences: {
      pushLikeEnabled: req.user.pushLikeEnabled,
      pushCommentEnabled: req.user.pushCommentEnabled,
      pushReplyEnabled: req.user.pushReplyEnabled,
      pushMentionEnabled: req.user.pushMentionEnabled,
      pushMessageEnabled: req.user.pushMessageEnabled,
    },
  });
});

router.patch('/preferences', requireAuth, async (req, res) => {
  const parsed = PushPreferencesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: parsed.data,
    select: {
      pushLikeEnabled: true,
      pushCommentEnabled: true,
      pushReplyEnabled: true,
      pushMentionEnabled: true,
      pushMessageEnabled: true,
    },
  });

  res.json({ preferences: user });
});

router.get('/push-config', requireAuth, (_req, res) => {
  res.json({
    enabled: isPushConfigured(),
    publicKey: getPushPublicKey(),
  });
});

router.post('/push-subscriptions', requireAuth, async (req, res) => {
  if (!isPushConfigured()) {
    return res.status(503).json({ error: 'push_not_configured' });
  }

  const parsed = PushSubscriptionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const { endpoint, keys } = parsed.data;

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: {
      userId: req.user.id,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    create: {
      userId: req.user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  });

  res.json({ ok: true });
});

router.delete('/push-subscriptions', requireAuth, async (req, res) => {
  const parsed = DeletePushSubscriptionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  await prisma.pushSubscription.deleteMany({
    where: {
      userId: req.user.id,
      endpoint: parsed.data.endpoint,
    },
  });

  res.json({ ok: true });
});

router.get('/', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  const items = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      actor: { select: { id: true, handle: true, displayName: true, profilePicture: true } },
    },
  });
  const commentIds = items
    .filter((item) => item.targetType === 'COMMENT' && item.targetId)
    .map((item) => item.targetId);
  const commentTargets = commentIds.length
    ? await prisma.comment.findMany({
        where: { id: { in: commentIds } },
        select: { id: true, postId: true },
      })
    : [];
  const commentTargetMap = Object.fromEntries(commentTargets.map((comment) => [comment.id, comment.postId]));
  const unread = await prisma.notification.count({
    where: { userId: req.user.id, readAt: null },
  });
  const notifications = items.map((item) => ({
    ...item,
    href:
      item.type === 'MESSAGE' && item.targetId
        ? `/chat/${item.targetId}`
        : item.targetType === 'POST' && item.targetId
          ? `/p/${item.targetId}`
          : item.targetType === 'COMMENT' && item.targetId && commentTargetMap[item.targetId]
            ? `/p/${commentTargetMap[item.targetId]}`
            : `/u/${item.actor.handle}`,
  }));
  res.json({ notifications, unread });
});

router.post('/read-all', requireAuth, async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
});

export default router;
