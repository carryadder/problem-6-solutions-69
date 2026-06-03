import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';
import { isEmojiOnly } from '../util/emoji.js';
import { getConversationBlockState, usersAreBlocked } from '../relationships.js';

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
    const otherMember = m.conversation.members.find((x) => x.userId !== req.user.id);
    const other = otherMember?.user;
    const last = m.conversation.messages[0] || null;
    return {
      id: m.conversation.id,
      other,
      lastMessage: last,
      lastReadAt: m.lastReadAt,
      otherLastReadAt: otherMember?.lastReadAt || null,
      pushMuted: m.pushMuted,
      wallpaper: m.wallpaper,
      unreadCount:
        m.lastReadAt
          ? m.conversation.messages.filter(
              (message) =>
                message.senderId !== req.user.id &&
                new Date(message.createdAt).getTime() > new Date(m.lastReadAt).getTime(),
            ).length
          : m.conversation.messages.filter((message) => message.senderId !== req.user.id).length,
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

  const blockState = await usersAreBlocked(req.user.id, other.id);
  if (blockState.blocked) return res.status(403).json({ error: 'blocked' });

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

  const otherMember = member.conversation.members.find((x) => x.userId !== req.user.id) || null;
  const other = otherMember?.user || null;
  const blockState = other ? await usersAreBlocked(req.user.id, other.id) : { blockedByMe: false, hasBlockedMe: false };

  res.json({
    conversation: {
      id: member.conversationId,
      other,
      lastReadAt: member.lastReadAt,
      otherLastReadAt: otherMember?.lastReadAt || null,
      pushMuted: member.pushMuted,
      wallpaper: member.wallpaper,
      blockedByMe: blockState.blockedByMe,
      hasBlockedMe: blockState.hasBlockedMe,
    },
  });
});

const PreferencesSchema = z.object({
  pushMuted: z.boolean().optional(),
  wallpaper: z.enum(['aurora', 'midnight', 'sunset', 'mint', 'graphite']).optional(),
});

router.patch('/:id/preferences', requireAuth, async (req, res) => {
  const parsed = PreferencesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const member = await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId: req.params.id, userId: req.user.id } },
    data: parsed.data,
    select: { pushMuted: true, wallpaper: true },
  }).catch(() => null);

  if (!member) return res.status(403).json({ error: 'forbidden' });

  res.json({ preferences: member });
});

const ReportSchema = z.object({
  reason: z.string().min(3).max(80),
  details: z.string().max(500).optional().or(z.literal('')),
});

router.post('/:id/report', requireAuth, async (req, res) => {
  const parsed = ReportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: req.params.id, userId: req.user.id } },
    include: {
      conversation: {
        include: {
          members: { select: { userId: true } },
        },
      },
    },
  });
  if (!member) return res.status(403).json({ error: 'forbidden' });

  const otherUserId = member.conversation.members.find((conversationMember) => conversationMember.userId !== req.user.id)?.userId;
  if (!otherUserId) return res.status(400).json({ error: 'invalid_conversation' });

  await prisma.userReport.create({
    data: {
      reporterId: req.user.id,
      reportedUserId: otherUserId,
      conversationId: req.params.id,
      reason: parsed.data.reason.trim(),
      details: parsed.data.details?.trim() || null,
    },
  });

  res.status(201).json({ ok: true });
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

  const blockState = await getConversationBlockState(req.params.id, req.user.id);
  if (blockState.blockedByMe || blockState.hasBlockedMe) {
    return res.status(403).json({ error: 'blocked' });
  }

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
