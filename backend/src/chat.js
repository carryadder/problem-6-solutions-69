// Socket.IO chat with emoji-only validation and Redis adapter for scale.

import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { prisma } from './db.js';
import { redis, subRedis } from './redis.js';
import { sendPushNotification } from './push.js';
import { getConversationBlockState } from './relationships.js';
import { isEmojiOnly } from './util/emoji.js';

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'dev-secret';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3002';
let ioInstance = null;

const authorSelect = {
  id: true,
  handle: true,
  displayName: true,
  profilePicture: true,
};

export const chatMessageInclude = {
  sender: { select: authorSelect },
  replyTo: {
    select: {
      id: true,
      body: true,
      audioUrl: true,
      editedAt: true,
      deletedForEveryoneAt: true,
      sender: { select: authorSelect },
    },
  },
  forwardedFromMessage: {
    select: {
      id: true,
      body: true,
      audioUrl: true,
      editedAt: true,
      deletedForEveryoneAt: true,
      sender: { select: authorSelect },
    },
  },
  reactions: {
    select: {
      userId: true,
      emoji: true,
      createdAt: true,
    },
  },
};

function messagePreview(message) {
  if (message.audioUrl) return 'Voice note';
  if (message.body) return message.body;
  return 'New message';
}

export function emitUserNotification(userId, payload) {
  ioInstance?.to(`user:${userId}`).emit('notification:new', payload);
  void sendPushNotification(userId, payload);
}

export function emitConversationEvent(conversationId, event, payload) {
  ioInstance?.to(`conv:${conversationId}`).emit(event, payload);
}

// Token-bucket rate limit: 30 messages / 10 seconds per user per conversation.
async function rateLimitOk(userId, conversationId) {
  const key = `rl:msg:${userId}:${conversationId}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 10);
  return count <= 30;
}

export async function createConversationMessage({
  conversationId,
  senderId,
  body = '',
  audioUrl = null,
  replyToId = null,
  forwardedFromMessageId = null,
}) {
  return prisma.message.create({
    data: {
      conversationId,
      senderId,
      body,
      audioUrl,
      replyToId,
      forwardedFromMessageId,
    },
    include: chatMessageInclude,
  });
}

export async function loadConversationMessage(messageId) {
  return prisma.message.findUnique({
    where: { id: messageId },
    include: chatMessageInclude,
  });
}

export async function broadcastConversationMessage(message) {
  emitConversationEvent(message.conversationId, 'message:new', message);

  const others = await prisma.conversationMember.findMany({
    where: { conversationId: message.conversationId, userId: { not: message.senderId } },
    select: { userId: true },
  });

  for (const other of others) {
    const notification = await prisma.notification.create({
      data: {
        userId: other.userId,
        actorId: message.senderId,
        type: 'MESSAGE',
        targetType: 'CONVERSATION',
        targetId: message.conversationId,
      },
    });

    emitUserNotification(other.userId, {
      id: notification.id,
      type: notification.type,
      targetType: notification.targetType,
      targetId: notification.targetId,
      createdAt: notification.createdAt,
      actor: message.sender,
      preview: messagePreview(message).slice(0, 120),
      href: `/chat/${message.conversationId}`,
    });
  }
}

export async function updateMessageReactions(messageId) {
  const message = await loadConversationMessage(messageId);
  if (!message) return null;
  emitConversationEvent(message.conversationId, 'message:reaction:update', {
    messageId,
    reactions: message.reactions,
  });
  return message;
}

export function attachChat(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: FRONTEND_URL, credentials: true },
    path: '/socket.io',
  });
  ioInstance = io;

  io.adapter(createAdapter(redis, subRedis));

  io.use(async (socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers.authorization || '').replace(/^Bearer /, '');
    if (!token) return next(new Error('unauthenticated'));
    try {
      const payload = jwt.verify(token, NEXTAUTH_SECRET);
      const userId = payload.sub || payload.userId;
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return next(new Error('user_not_found'));
      socket.data.user = user;
      next();
    } catch {
      next(new Error('invalid_token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);

    socket.on('conversation:join', async (conversationId, ack) => {
      const member = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: user.id } },
      });
      if (!member) return ack?.({ ok: false, error: 'forbidden' });
      const blockState = await getConversationBlockState(conversationId, user.id);
      if (blockState.blockedByMe || blockState.hasBlockedMe) {
        return ack?.({ ok: false, error: 'blocked' });
      }
      socket.join(`conv:${conversationId}`);
      ack?.({ ok: true });
    });

    socket.on('conversation:leave', (conversationId) => {
      socket.leave(`conv:${conversationId}`);
    });

    socket.on('message:send', async ({ conversationId, body, replyToId, forwardedFromMessageId }, ack) => {
      if (typeof body !== 'string' || body.length > 500) {
        return ack?.({ ok: false, error: 'invalid_body' });
      }
      if (!body.trim()) {
        return ack?.({ ok: false, error: 'invalid_body' });
      }
      if (!isEmojiOnly(body)) {
        return ack?.({ ok: false, error: 'emoji_only' });
      }

      const member = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: user.id } },
      });
      if (!member) return ack?.({ ok: false, error: 'forbidden' });

      const blockState = await getConversationBlockState(conversationId, user.id);
      if (blockState.blockedByMe || blockState.hasBlockedMe) {
        return ack?.({ ok: false, error: 'blocked' });
      }

      if (!(await rateLimitOk(user.id, conversationId))) {
        return ack?.({ ok: false, error: 'rate_limited' });
      }

      const message = await createConversationMessage({
        conversationId,
        senderId: user.id,
        body,
        replyToId: replyToId || null,
        forwardedFromMessageId: forwardedFromMessageId || null,
      });

      await broadcastConversationMessage(message);
      ack?.({ ok: true, message });
    });

    socket.on('typing:start', async ({ conversationId }) => {
      const blockState = await getConversationBlockState(conversationId, user.id);
      if (blockState.blockedByMe || blockState.hasBlockedMe) return;
      socket.to(`conv:${conversationId}`).emit('typing:start', {
        userId: user.id,
        displayName: user.displayName,
      });
    });

    socket.on('typing:stop', async ({ conversationId }) => {
      const blockState = await getConversationBlockState(conversationId, user.id);
      if (blockState.blockedByMe || blockState.hasBlockedMe) return;
      socket.to(`conv:${conversationId}`).emit('typing:stop', {
        userId: user.id,
      });
    });

    socket.on('read:update', async ({ conversationId }) => {
      await prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId: user.id } },
        data: { lastReadAt: new Date() },
      });
      socket.to(`conv:${conversationId}`).emit('read:update', { userId: user.id, at: new Date() });
    });
  });

  return io;
}
