import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';
import { emitUserNotification } from '../chat.js';

const router = Router();

const ReplySchema = z.object({ body: z.string().min(1).max(500) });

router.post('/:id/replies', requireAuth, async (req, res) => {
  const parsed = ReplySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const parent = await prisma.comment.findUnique({ where: { id: req.params.id } });
  if (!parent) return res.status(404).json({ error: 'not_found' });

  // Flatten: replies to replies attach to the same top-level parent.
  const parentCommentId = parent.parentCommentId || parent.id;

  const reply = await prisma.comment.create({
    data: {
      postId: parent.postId,
      authorId: req.user.id,
      parentCommentId,
      body: parsed.data.body,
    },
    include: { author: { select: { id: true, handle: true, displayName: true, profilePicture: true } } },
  });

  if (parent.authorId !== req.user.id) {
    const notification = await prisma.notification.create({
      data: {
        userId: parent.authorId,
        actorId: req.user.id,
        type: 'REPLY',
        targetType: 'POST',
        targetId: parent.postId,
      },
    });
    emitUserNotification(parent.authorId, {
      id: notification.id,
      type: notification.type,
      targetType: notification.targetType,
      targetId: notification.targetId,
      createdAt: notification.createdAt,
      href: `/p/${parent.postId}`,
      actor: {
        id: req.user.id,
        handle: req.user.handle,
        displayName: req.user.displayName,
        profilePicture: req.user.profilePicture,
      },
      preview: reply.body.slice(0, 120),
    });
  }
  res.status(201).json({ comment: reply });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const c = await prisma.comment.findUnique({ where: { id: req.params.id } });
  if (!c) return res.status(404).json({ error: 'not_found' });
  if (c.authorId !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  await prisma.comment.delete({ where: { id: c.id } });
  res.json({ ok: true });
});

export default router;
