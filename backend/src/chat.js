// Socket.IO chat with emoji-only validation and Redis adapter for scale.

import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { prisma } from './db.js';
import { redis, subRedis } from './redis.js';

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'dev-secret';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3002';

// Token-bucket rate limit: 30 messages / 10 seconds per user per conversation.
async function rateLimitOk(userId, conversationId) {
  const key = `rl:msg:${userId}:${conversationId}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 10);
  return count <= 30;
}

export function attachChat(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: FRONTEND_URL, credentials: true },
    path: '/socket.io',
  });

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
      socket.join(`conv:${conversationId}`);
      ack?.({ ok: true });
    });

    socket.on('conversation:leave', (conversationId) => {
      socket.leave(`conv:${conversationId}`);
    });

    socket.on('message:send', async ({ conversationId, body }, ack) => {
      if (typeof body !== 'string' || body.length > 500) {
        return ack?.({ ok: false, error: 'invalid_body' });
      }

      const member = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: user.id } },
      });
      if (!member) return ack?.({ ok: false, error: 'forbidden' });

      if (!(await rateLimitOk(user.id, conversationId))) {
        return ack?.({ ok: false, error: 'rate_limited' });
      }

      const message = await prisma.message.create({
        data: { conversationId, senderId: user.id, body },
        include: {
          sender: { select: { id: true, handle: true, displayName: true, profilePicture: true } },
        },
      });

      io.to(`conv:${conversationId}`).emit('message:new', message);

      // Notify the other member if they're not currently looking at the room.
      const others = await prisma.conversationMember.findMany({
        where: { conversationId, userId: { not: user.id } },
        select: { userId: true },
      });
      for (const o of others) {
        io.to(`user:${o.userId}`).emit('notification:new', {
          type: 'MESSAGE',
          conversationId,
          from: message.sender,
          preview: body.slice(0, 32),
        });
      }
      ack?.({ ok: true, message });
    });

    socket.on('typing:start', ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit('typing:start', { userId: user.id });
    });
    socket.on('typing:stop', ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit('typing:stop', { userId: user.id });
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
