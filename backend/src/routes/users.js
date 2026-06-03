import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { prisma } from '../db.js';
import { requireAuth, requireInternal, optionalAuth } from '../auth.js';
import { generateUniqueHandle, isValidHandle } from '../util/handle.js';
import { usersAreBlocked } from '../relationships.js';

const router = Router();

const UPLOADS_ROOT = process.env.UPLOADS_DIR || '/app/uploads';
const AVATAR_DIR = path.join(UPLOADS_ROOT, 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: AVATAR_DIR,
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      const safe = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
      cb(null, `${req.user.id}-${Date.now()}${safe}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      return cb(new Error('invalid_image_type'));
    }
    cb(null, true);
  },
});

// Server-to-server: NextAuth callback creates / fetches the user on login.
const SyncSchema = z.object({
  googleId: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1).max(80),
});

router.post('/sync', requireInternal, async (req, res) => {
  const parsed = SyncSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const { googleId, email, displayName } = parsed.data;
  console.log(`[auth] Syncing user from Google: ${email}`);

  let user = await prisma.user.findUnique({ where: { googleId } });
  if (user) {
    console.log(`[auth] User found: ${user.handle}`);
    return res.json({ user });
  }

  // Try to claim existing email row (in case user record exists without googleId)
  user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    user = await prisma.user.update({ where: { id: user.id }, data: { googleId } });
    return res.json({ user });
  }

  const handle = await generateUniqueHandle(email.split('@')[0] || displayName);
  console.log(`[auth] Creating new user: ${handle}`);
  user = await prisma.user.create({
    data: { googleId, email, displayName: displayName.slice(0, 40), handle },
  });
  res.status(201).json({ user });
});

// Current user
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

const UpdateMeSchema = z.object({
  displayName: z.string().min(1).max(40).optional(),
  handle: z.string().min(3).max(20).optional(),
  bio: z.string().max(160).nullable().optional(),
  setupComplete: z.boolean().optional(),
});

router.patch('/me', requireAuth, async (req, res) => {
  const parsed = UpdateMeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const data = { ...parsed.data };
  if (data.handle !== undefined) {
    if (!isValidHandle(data.handle)) return res.status(400).json({ error: 'invalid_handle' });
    if (data.handle !== req.user.handle) {
      const taken = await prisma.user.findUnique({ where: { handle: data.handle } });
      if (taken) return res.status(409).json({ error: 'handle_taken' });
    }
  }

  const user = await prisma.user.update({ where: { id: req.user.id }, data });
  res.json({ user });
});

router.post('/me/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  const url = `/uploads/avatars/${req.file.filename}`;
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { profilePicture: url },
  });
  res.json({ user });
});

router.delete('/me/avatar', requireAuth, async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { profilePicture: null },
  });
  res.json({ user });
});

// Suggested users
router.get('/suggested', optionalAuth, async (req, res) => {
  // Simple implementation: fetch random recently active users.
  const users = await prisma.user.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      handle: true,
      displayName: true,
      profilePicture: true,
    },
    where: req.user ? { id: { not: req.user.id } } : undefined,
  });
  
  res.json({ users });
});

router.get('/sitemap', async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 5000,
    select: {
      handle: true,
      updatedAt: true,
    },
  });

  res.json({ users });
});

// Public profile by handle. counts: followers & following are reserved for a
// future phase, for now we return post + share counts.
router.get('/:handle', optionalAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { handle: req.params.handle },
    select: {
      id: true,
      handle: true,
      displayName: true,
      bio: true,
      profilePicture: true,
      createdAt: true,
    },
  });
  if (!user) return res.status(404).json({ error: 'not_found' });

  const [postCount] = await Promise.all([prisma.post.count({ where: { authorId: user.id } })]);

  let blockedByMe = false;
  let hasBlockedMe = false;
  if (req.user?.id) {
    const blockState = await usersAreBlocked(req.user.id, user.id);
    blockedByMe = blockState.blockedByMe;
    hasBlockedMe = blockState.hasBlockedMe;
  }

  res.json({ user: { ...user, postCount, blockedByMe, hasBlockedMe } });
});

router.post('/:handle/block', requireAuth, async (req, res) => {
  const target = await prisma.user.findUnique({ where: { handle: req.params.handle } });
  if (!target) return res.status(404).json({ error: 'not_found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'cannot_block_self' });

  await prisma.userBlock.upsert({
    where: {
      blockerId_blockedUserId: {
        blockerId: req.user.id,
        blockedUserId: target.id,
      },
    },
    update: {},
    create: {
      blockerId: req.user.id,
      blockedUserId: target.id,
    },
  });

  res.json({ ok: true, blocked: true });
});

router.delete('/:handle/block', requireAuth, async (req, res) => {
  const target = await prisma.user.findUnique({ where: { handle: req.params.handle } });
  if (!target) return res.status(404).json({ error: 'not_found' });

  await prisma.userBlock.deleteMany({
    where: {
      blockerId: req.user.id,
      blockedUserId: target.id,
    },
  });

  res.json({ ok: true, blocked: false });
});


// Share a profile — server records the event; client copies the URL.
router.post('/:handle/share', requireAuth, async (req, res) => {
  const target = await prisma.user.findUnique({ where: { handle: req.params.handle } });
  if (!target) return res.status(404).json({ error: 'not_found' });
  await prisma.share.create({
    data: { userId: req.user.id, targetUserId: target.id },
  });
  res.json({ url: `/u/${target.handle}` });
});

export default router;
