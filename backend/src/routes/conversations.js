import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';
import { isEmojiOnly } from '../util/emoji.js';
import { getConversationBlockState, usersAreBlocked } from '../relationships.js';
import {
  broadcastConversationMessage,
  chatMessageInclude,
  createConversationMessage,
  emitConversationEvent,
  loadConversationMessage,
  updateMessageReactions,
} from '../chat.js';

const router = Router();
const UPLOADS_ROOT = process.env.UPLOADS_DIR || '/app/uploads';
const VOICE_DIR = path.join(UPLOADS_ROOT, 'voice-notes');
fs.mkdirSync(VOICE_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: VOICE_DIR,
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.webm').toLowerCase();
      const safe = ['.webm', '.ogg', '.mp3', '.wav', '.m4a'].includes(ext) ? ext : '.webm';
      cb(null, `${req.user.id}-${Date.now()}${safe}`);
    },
  }),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^audio\//.test(file.mimetype)) return cb(new Error('invalid_audio_type'));
    cb(null, true);
  },
});

const authorSelect = {
  id: true,
  handle: true,
  displayName: true,
  profilePicture: true,
};

async function ensureConversationAccess(conversationId, userId) {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!member) return { ok: false, error: 'forbidden' };

  const blockState = await getConversationBlockState(conversationId, userId);
  if (blockState.blockedByMe || blockState.hasBlockedMe) {
    return { ok: false, error: 'blocked' };
  }

  return { ok: true, member, blockState };
}

async function decorateMessagesForUser(messages, userId) {
  if (messages.length === 0) return [];
  const stars = await prisma.messageStar.findMany({
    where: {
      userId,
      messageId: { in: messages.map((message) => message.id) },
    },
    select: { messageId: true },
  });
  const starredIds = new Set(stars.map((star) => star.messageId));
  return messages.map((message) => ({
    ...message,
    starredByMe: starredIds.has(message.id),
  }));
}

async function decorateMessageForUser(message, userId) {
  if (!message) return null;
  const [decorated] = await decorateMessagesForUser([message], userId);
  return decorated;
}

router.get('/', requireAuth, async (req, res) => {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId: req.user.id },
    include: {
      conversation: {
        include: {
          members: { include: { user: { select: authorSelect } } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          pinnedMessage: {
            include: chatMessageInclude,
          },
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
      pinnedMessage: m.conversation.pinnedMessage,
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
          pinnedMessage: { include: chatMessageInclude },
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
      pinnedMessage: member.conversation.pinnedMessage,
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

const PinSchema = z.object({
  messageId: z.string().min(1).nullable(),
});

router.patch('/:id/pin', requireAuth, async (req, res) => {
  const parsed = PinSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const access = await ensureConversationAccess(req.params.id, req.user.id);
  if (!access.ok) return res.status(403).json({ error: access.error });

  if (parsed.data.messageId) {
    const message = await prisma.message.findUnique({ where: { id: parsed.data.messageId } });
    if (!message || message.conversationId !== req.params.id) {
      return res.status(404).json({ error: 'not_found' });
    }
  }

  const conversation = await prisma.conversation.update({
    where: { id: req.params.id },
    data: { pinnedMessageId: parsed.data.messageId },
    include: { pinnedMessage: { include: chatMessageInclude } },
  });

  emitConversationEvent(req.params.id, 'conversation:pin', {
    pinnedMessage: conversation.pinnedMessage,
  });

  res.json({ pinnedMessage: conversation.pinnedMessage });
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
    where: {
      conversationId: req.params.id,
      hiddenBy: { none: { userId: req.user.id } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: cursor ? 1 : 0,
    cursor,
    include: chatMessageInclude,
  });
  const nextCursor = messages.length === limit ? messages[messages.length - 1].id : null;
  const decorated = await decorateMessagesForUser(messages.reverse(), req.user.id);
  res.json({ messages: decorated, nextCursor });
});

router.get('/:id/search', requireAuth, async (req, res) => {
  const access = await ensureConversationAccess(req.params.id, req.user.id);
  if (!access.ok) return res.status(403).json({ error: access.error });

  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ messages: [] });

  const messages = await prisma.message.findMany({
    where: {
      conversationId: req.params.id,
      hiddenBy: { none: { userId: req.user.id } },
      OR: [
        { body: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: chatMessageInclude,
  });

  const decorated = await decorateMessagesForUser(messages, req.user.id);
  res.json({ messages: decorated });
});

const SendSchema = z.object({
  body: z.string().min(1).max(500),
  replyToId: z.string().min(1).optional(),
});

router.post('/:id/messages', requireAuth, async (req, res) => {
  const parsed = SendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  if (!isEmojiOnly(parsed.data.body)) return res.status(400).json({ error: 'emoji_only' });

  const access = await ensureConversationAccess(req.params.id, req.user.id);
  if (!access.ok) {
    return res.status(access.error === 'forbidden' ? 403 : 403).json({ error: access.error });
  }

  const message = await createConversationMessage({
    conversationId: req.params.id,
    senderId: req.user.id,
    body: parsed.data.body,
    replyToId: parsed.data.replyToId || null,
  });
  await broadcastConversationMessage(message);
  res.status(201).json({ message: await decorateMessageForUser(message, req.user.id) });
});

router.post('/:id/voice', requireAuth, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });

  const access = await ensureConversationAccess(req.params.id, req.user.id);
  if (!access.ok) return res.status(403).json({ error: access.error });

  const message = await createConversationMessage({
    conversationId: req.params.id,
    senderId: req.user.id,
    audioUrl: `/uploads/voice-notes/${req.file.filename}`,
    replyToId: typeof req.body.replyToId === 'string' && req.body.replyToId ? req.body.replyToId : null,
  });
  await broadcastConversationMessage(message);
  res.status(201).json({ message: await decorateMessageForUser(message, req.user.id) });
});

const ReactionSchema = z.object({ emoji: z.string().min(1).max(16) });

const EditSchema = z.object({
  body: z.string().min(1).max(500),
});

router.patch('/:id/messages/:messageId', requireAuth, async (req, res) => {
  const parsed = EditSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  if (!isEmojiOnly(parsed.data.body)) return res.status(400).json({ error: 'emoji_only' });

  const access = await ensureConversationAccess(req.params.id, req.user.id);
  if (!access.ok) return res.status(403).json({ error: access.error });

  const message = await prisma.message.findUnique({ where: { id: req.params.messageId } });
  if (!message || message.conversationId !== req.params.id) return res.status(404).json({ error: 'not_found' });
  if (message.senderId !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  if (message.audioUrl || message.deletedForEveryoneAt) return res.status(400).json({ error: 'not_editable' });

  const updated = await prisma.message.update({
    where: { id: req.params.messageId },
    data: {
      body: parsed.data.body,
      editedAt: new Date(),
    },
    include: chatMessageInclude,
  });

  const decorated = await decorateMessageForUser(updated, req.user.id);
  emitConversationEvent(req.params.id, 'message:update', { message: decorated });
  res.json({ message: decorated });
});

router.post('/:id/messages/:messageId/reaction', requireAuth, async (req, res) => {
  const parsed = ReactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const access = await ensureConversationAccess(req.params.id, req.user.id);
  if (!access.ok) return res.status(403).json({ error: access.error });

  const message = await prisma.message.findUnique({ where: { id: req.params.messageId } });
  if (!message || message.conversationId !== req.params.id) return res.status(404).json({ error: 'not_found' });

  const existing = await prisma.messageReaction.findUnique({
    where: {
      messageId_userId: {
        messageId: req.params.messageId,
        userId: req.user.id,
      },
    },
  });

  if (existing?.emoji === parsed.data.emoji) {
    await prisma.messageReaction.delete({ where: { messageId_userId: { messageId: req.params.messageId, userId: req.user.id } } });
  } else if (existing) {
    await prisma.messageReaction.update({
      where: { messageId_userId: { messageId: req.params.messageId, userId: req.user.id } },
      data: { emoji: parsed.data.emoji },
    });
  } else {
    await prisma.messageReaction.create({
      data: {
        messageId: req.params.messageId,
        userId: req.user.id,
        emoji: parsed.data.emoji,
      },
    });
  }

  const updated = await updateMessageReactions(req.params.messageId);
  res.json({ reactions: updated?.reactions || [] });
});

const BulkSchema = z.object({
  action: z.enum(['star', 'unstar', 'delete_me']),
  messageIds: z.array(z.string().min(1)).min(1).max(100),
});

router.post('/:id/messages/bulk', requireAuth, async (req, res) => {
  const parsed = BulkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const access = await ensureConversationAccess(req.params.id, req.user.id);
  if (!access.ok) return res.status(403).json({ error: access.error });

  const messages = await prisma.message.findMany({
    where: {
      conversationId: req.params.id,
      id: { in: parsed.data.messageIds },
    },
    select: { id: true },
  });
  const validIds = messages.map((message) => message.id);

  if (parsed.data.action === 'star') {
    await prisma.messageStar.createMany({
      data: validIds.map((messageId) => ({ messageId, userId: req.user.id })),
      skipDuplicates: true,
    });
  } else if (parsed.data.action === 'unstar') {
    await prisma.messageStar.deleteMany({
      where: {
        userId: req.user.id,
        messageId: { in: validIds },
      },
    });
  } else if (parsed.data.action === 'delete_me') {
    await prisma.messageHidden.createMany({
      data: validIds.map((messageId) => ({ messageId, userId: req.user.id })),
      skipDuplicates: true,
    });
  }

  res.json({ ok: true, messageIds: validIds, action: parsed.data.action });
});

router.post('/:id/messages/:messageId/star', requireAuth, async (req, res) => {
  const access = await ensureConversationAccess(req.params.id, req.user.id);
  if (!access.ok) return res.status(403).json({ error: access.error });

  const message = await prisma.message.findUnique({ where: { id: req.params.messageId } });
  if (!message || message.conversationId !== req.params.id) return res.status(404).json({ error: 'not_found' });

  await prisma.messageStar.upsert({
    where: { messageId_userId: { messageId: req.params.messageId, userId: req.user.id } },
    update: {},
    create: { messageId: req.params.messageId, userId: req.user.id },
  });

  res.json({ ok: true, starred: true });
});

router.delete('/:id/messages/:messageId/star', requireAuth, async (req, res) => {
  const access = await ensureConversationAccess(req.params.id, req.user.id);
  if (!access.ok) return res.status(403).json({ error: access.error });

  await prisma.messageStar.deleteMany({
    where: { messageId: req.params.messageId, userId: req.user.id },
  });

  res.json({ ok: true, starred: false });
});

const DeleteSchema = z.object({
  scope: z.enum(['me', 'everyone']),
});

router.post('/:id/messages/:messageId/delete', requireAuth, async (req, res) => {
  const parsed = DeleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const access = await ensureConversationAccess(req.params.id, req.user.id);
  if (!access.ok) return res.status(403).json({ error: access.error });

  const message = await prisma.message.findUnique({
    where: { id: req.params.messageId },
    include: chatMessageInclude,
  });
  if (!message || message.conversationId !== req.params.id) return res.status(404).json({ error: 'not_found' });

  if (parsed.data.scope === 'me') {
    await prisma.messageHidden.upsert({
      where: { messageId_userId: { messageId: req.params.messageId, userId: req.user.id } },
      update: {},
      create: { messageId: req.params.messageId, userId: req.user.id },
    });
    return res.json({ ok: true, scope: 'me' });
  }

  if (message.senderId !== req.user.id) return res.status(403).json({ error: 'forbidden' });

  const updated = await prisma.message.update({
    where: { id: req.params.messageId },
    data: {
      body: '',
      audioUrl: null,
      replyToId: null,
      forwardedFromMessageId: null,
      deletedForEveryoneAt: new Date(),
      reactions: { deleteMany: {} },
    },
    include: chatMessageInclude,
  });

  emitConversationEvent(req.params.id, 'message:update', {
    message: { ...updated, starredByMe: false },
  });

  if (updated.id === (await prisma.conversation.findUnique({ where: { id: req.params.id }, select: { pinnedMessageId: true } }))?.pinnedMessageId) {
    await prisma.conversation.update({
      where: { id: req.params.id },
      data: { pinnedMessageId: null },
    });
    emitConversationEvent(req.params.id, 'conversation:pin', { pinnedMessage: null });
  }

  res.json({ ok: true, scope: 'everyone' });
});

router.get('/:id/media', requireAuth, async (req, res) => {
  const access = await ensureConversationAccess(req.params.id, req.user.id);
  if (!access.ok) return res.status(403).json({ error: access.error });

  const messages = await prisma.message.findMany({
    where: {
      conversationId: req.params.id,
      hiddenBy: { none: { userId: req.user.id } },
      deletedForEveryoneAt: null,
      OR: [{ audioUrl: { not: null } }],
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: chatMessageInclude,
  });

  const decorated = await decorateMessagesForUser(messages, req.user.id);
  res.json({ messages: decorated });
});

const ForwardSchema = z.object({ messageId: z.string().min(1) });

router.post('/:id/forward', requireAuth, async (req, res) => {
  const parsed = ForwardSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const access = await ensureConversationAccess(req.params.id, req.user.id);
  if (!access.ok) return res.status(403).json({ error: access.error });

  const sourceMessage = await prisma.message.findUnique({
    where: { id: parsed.data.messageId },
    include: chatMessageInclude,
  });
  if (!sourceMessage) return res.status(404).json({ error: 'not_found' });

  const sourceMembership = await prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId: sourceMessage.conversationId,
        userId: req.user.id,
      },
    },
  });
  if (!sourceMembership) return res.status(403).json({ error: 'forbidden' });

  const forwarded = await createConversationMessage({
    conversationId: req.params.id,
    senderId: req.user.id,
    body: sourceMessage.body,
    audioUrl: sourceMessage.audioUrl,
    forwardedFromMessageId: sourceMessage.id,
  });

  await broadcastConversationMessage(forwarded);
  res.status(201).json({ message: await decorateMessageForUser(forwarded, req.user.id) });
});

router.post('/:id/read', requireAuth, async (req, res) => {
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId: req.params.id, userId: req.user.id } },
    data: { lastReadAt: new Date() },
  });
  res.json({ ok: true });
});

export default router;
