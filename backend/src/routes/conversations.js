import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';
import { isEmojiOnly } from '../util/emoji.js';

const router = Router();

const authorSelect = {
  id: true,
  handle: true,
  displayName: true,
  profilePicture: true,
};

router.get('/', requireAuth, async (req, res) => {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId: req.user.id },
    include: {
      conversation: {
        include: {
          members: { include: { user: { select: authorSelect } } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
  });

  const convs = memberships.map((m) => {
    const other = m.conversation.members.find((x) => x.userId !== req.user.id)?.user;
    const last = m.conversation.messages[0] || null;
    return {
      id: m.conversation.id,
      other,
      lastMessage: last,
      lastReadAt: m.lastReadAt,
      pushMuted: m.pushMuted,
    };
  });

  // Sort by most recent message
  convs.sort((a, b) => {
    const at = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bt = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return bt - at;
  });

  res.json({ conversations: convs });
});

const StartSchema = z.object({ withUserId: z.string().min(1) });

router.post('/', requireAuth, async (req, res) => {
  const parsed = StartSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  if (parsed.data.withUserId === req.user.id) return res.status(400).json({ error: 'self_chat' });

  const other = await prisma.user.findUnique({ where: { id: parsed.data.withUserId } });
  if (!other) return res.status(404).json({ error: 'user_not_found' });

  // Find existing 1:1 conversation
  const existing = await prisma.conversation.findFirst({
    where: {
      AND: [
        { members: { some: { userId: req.user.id } } },
        { members: { some: { userId: other.id } } },
      ],
    },
  });
  if (existing) return res.json({ conversation: existing });

  const conv = await prisma.conversation.create({
    data: {
      members: {
        create: [{ userId: req.user.id }, { userId: other.id }],
      },
    },
  });
  res.status(201).json({ conversation: conv });
});

router.get('/:id', requireAuth, async (req, res) => {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: req.params.id, userId: req.user.id } },
    include: {
      conversation: {
        include: {
          members: { include: { user: { select: authorSelect } } },
        },
      },
    },
  });
  if (!member) return res.status(403).json({ error: 'forbidden' });

  const other = member.conversation.members.find((x) => x.userId !== req.user.id)?.user || null;

  res.json({
    conversation: {
      id: member.conversationId,
      other,
      lastReadAt: member.lastReadAt,
      pushMuted: member.pushMuted,
    },
  });
});

const PreferencesSchema = z.object({
  pushMuted: z.boolean(),
});

router.patch('/:id/preferences', requireAuth, async (req, res) => {
  const parsed = PreferencesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const member = await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId: req.params.id, userId: req.user.id } },
    data: { pushMuted: parsed.data.pushMuted },
    select: { pushMuted: true },
  }).catch(() => null);

  if (!member) return res.status(403).json({ error: 'forbidden' });

  res.json({ preferences: member });
});

router.get('/:id/messages', requireAuth, async (req, res) => {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: req.params.id, userId: req.user.id } },
  });
  if (!member) return res.status(403).json({ error: 'forbidden' });

  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const cursor = req.query.cursor ? { id: req.query.cursor } : undefined;

  const messages = await prisma.message.findMany({
    where: { conversationId: req.params.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: cursor ? 1 : 0,
    cursor,
    include: { sender: { select: authorSelect } },
  });
  const nextCursor = messages.length === limit ? messages[messages.length - 1].id : null;
  res.json({ messages: messages.reverse(), nextCursor });
});

const SendSchema = z.object({ body: z.string().min(1).max(500) });

router.post('/:id/messages', requireAuth, async (req, res) => {
  const parsed = SendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  if (!isEmojiOnly(parsed.data.body)) return res.status(400).json({ error: 'emoji_only' });

  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: req.params.id, userId: req.user.id } },
  });
  if (!member) return res.status(403).json({ error: 'forbidden' });

  const message = await prisma.message.create({
    data: {
      conversationId: req.params.id,
      senderId: req.user.id,
      body: parsed.data.body,
    },
    include: { sender: { select: authorSelect } },
  });
  res.status(201).json({ message });
});

router.post('/:id/read', requireAuth, async (req, res) => {
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId: req.params.id, userId: req.user.id } },
    data: { lastReadAt: new Date() },
  });
  res.json({ ok: true });
});

export default router;
