import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../db.js';
import { requireAuth, optionalAuth } from '../auth.js';

const router = Router();

const UPLOADS_ROOT = process.env.UPLOADS_DIR || '/app/uploads';
const POST_DIR = path.join(UPLOADS_ROOT, 'posts');
fs.mkdirSync(POST_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: POST_DIR,
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      const safe = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
      cb(null, `${req.user.id}-${Date.now()}${safe}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error('invalid_image_type'));
    }
    cb(null, true);
  },
});

const CreatePostSchema = z.object({
  body: z.string().min(1).max(2000),
});

const authorSelect = {
  id: true,
  handle: true,
  displayName: true,
  profilePicture: true,
};

async function decoratePosts(posts, viewerId) {
  if (posts.length === 0) return [];
  const ids = posts.map((p) => p.id);

  const [likeCounts, commentCounts, shareCounts, viewerLikes] = await Promise.all([
    prisma.like.groupBy({
      by: ['targetId'],
      where: { targetType: 'POST', targetId: { in: ids } },
      _count: true,
    }),
    prisma.comment.groupBy({
      by: ['postId'],
      where: { postId: { in: ids } },
      _count: true,
    }),
    prisma.share.groupBy({
      by: ['postId'],
      where: { postId: { in: ids } },
      _count: true,
    }),
    viewerId
      ? prisma.like.findMany({
          where: { userId: viewerId, targetType: 'POST', targetId: { in: ids } },
          select: { targetId: true },
        })
      : Promise.resolve([]),
  ]);

  const likeMap = Object.fromEntries(likeCounts.map((r) => [r.targetId, r._count]));
  const commentMap = Object.fromEntries(commentCounts.map((r) => [r.postId, r._count]));
  const shareMap = Object.fromEntries(shareCounts.map((r) => [r.postId, r._count]));
  const likedSet = new Set(viewerLikes.map((r) => r.targetId));

  return posts.map((p) => ({
    ...p,
    likeCount: likeMap[p.id] || 0,
    commentCount: commentMap[p.id] || 0,
    shareCount: shareMap[p.id] || 0,
    likedByMe: likedSet.has(p.id),
  }));
}

router.post('/', requireAuth, upload.single('image'), async (req, res) => {
  const parsed = CreatePostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const imageUrl = req.file ? `/uploads/posts/${req.file.filename}` : null;

  const post = await prisma.post.create({
    data: { authorId: req.user.id, body: parsed.data.body, imageUrl },
    include: { author: { select: authorSelect } },
  });
  const [decorated] = await decoratePosts([post], req.user.id);
  res.status(201).json({ post: decorated });
});

// Trending tags endpoint
router.get('/trending-tags', async (req, res) => {
  const posts = await prisma.post.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
    select: { body: true },
  });
  const counts = {};
  for (const p of posts) {
    const tags = p.body.match(/#[a-zA-Z0-9_]+/g) || [];
    for (const tag of tags) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  const trending = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(x => ({ tag: x[0], count: `${x[1]} posts` }));
  
  res.json({ trending });
});

// Feed: newest first, keyset pagination by createdAt+id.
router.get('/feed', optionalAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const cursor = req.query.cursor ? { id: req.query.cursor } : undefined;
  const type = req.query.type || 'newest';

  let where = {};
  if (type === 'yours' && req.user) {
    where = { authorId: req.user.id };
  }

  // A true 'popular' would require sorting by likeCount, which is complex in prisma without a materialized column.
  // We'll just fetch more and sort them in JS if popular is requested.
  if (type === 'popular') {
    const posts = await prisma.post.findMany({
      take: limit * 2, // fetch extra to find popular ones
      where,
      orderBy: { createdAt: 'desc' },
      include: { author: { select: authorSelect } },
    });
    const decorated = await decoratePosts(posts, req.user?.id);
    decorated.sort((a, b) => (b.likeCount + b.commentCount) - (a.likeCount + a.commentCount));
    
    return res.json({ posts: decorated.slice(0, limit), nextCursor: null });
  }

  const posts = await prisma.post.findMany({
    take: limit,
    skip: cursor ? 1 : 0,
    cursor,
    where,
    orderBy: { createdAt: 'desc' },
    include: { author: { select: authorSelect } },
  });

  const decorated = await decoratePosts(posts, req.user?.id);
  const nextCursor = posts.length === limit ? posts[posts.length - 1].id : null;
  res.json({ posts: decorated, nextCursor });
});

router.get('/sitemap', async (_req, res) => {
  const posts = await prisma.post.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 5000,
    select: {
      id: true,
      updatedAt: true,
    },
  });

  res.json({ posts });
});

router.get('/:id', optionalAuth, async (req, res) => {
  const post = await prisma.post.findUnique({
    where: { id: req.params.id },
    include: { author: { select: authorSelect } },
  });
  if (!post) return res.status(404).json({ error: 'not_found' });
  const [decorated] = await decoratePosts([post], req.user?.id);
  res.json({ post: decorated });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: 'not_found' });
  if (post.authorId !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  await prisma.post.delete({ where: { id: post.id } });
  res.json({ ok: true });
});

const EditPostSchema = z.object({
  body: z.string().min(1).max(2000),
});

router.put('/:id', requireAuth, async (req, res) => {
  const parsed = EditPostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  
  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: 'not_found' });
  if (post.authorId !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  
  const updated = await prisma.post.update({
    where: { id: post.id },
    data: { body: parsed.data.body },
    include: { author: { select: authorSelect } },
  });
  
  const [decorated] = await decoratePosts([updated], req.user.id);
  res.json({ post: decorated });
});

router.post('/:id/share', requireAuth, async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: 'not_found' });
  await prisma.share.create({ data: { userId: req.user.id, postId: post.id } });
  res.json({ url: `/p/${post.id}` });
});

// Comments on a post
const CreateCommentSchema = z.object({
  body: z.string().min(1).max(500),
});

router.post('/:id/comments', requireAuth, async (req, res) => {
  const parsed = CreateCommentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: 'not_found' });

  const comment = await prisma.comment.create({
    data: { postId: post.id, authorId: req.user.id, body: parsed.data.body },
    include: { author: { select: authorSelect } },
  });

  if (post.authorId !== req.user.id) {
    await prisma.notification.create({
      data: {
        userId: post.authorId,
        actorId: req.user.id,
        type: 'COMMENT',
        targetType: 'POST',
        targetId: post.id,
      },
    });
  }
  res.status(201).json({ comment });
});

// Threaded comments: returns top-level + 1 nesting level. Further replies flatten.
router.get('/:id/comments', optionalAuth, async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: 'not_found' });

  const top = await prisma.comment.findMany({
    where: { postId: post.id, parentCommentId: null },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: authorSelect } },
    take: 200,
  });
  const topIds = top.map((c) => c.id);
  const replies = topIds.length
    ? await prisma.comment.findMany({
        where: { parentCommentId: { in: topIds } },
        orderBy: { createdAt: 'asc' },
        include: { author: { select: authorSelect } },
        take: 1000,
      })
    : [];

  const allIds = [...top, ...replies].map((c) => c.id);
  const [likeCounts, viewerLikes] = await Promise.all([
    prisma.like.groupBy({
      by: ['targetId'],
      where: { targetType: 'COMMENT', targetId: { in: allIds } },
      _count: true,
    }),
    req.user
      ? prisma.like.findMany({
          where: { userId: req.user.id, targetType: 'COMMENT', targetId: { in: allIds } },
          select: { targetId: true },
        })
      : Promise.resolve([]),
  ]);
  const likeMap = Object.fromEntries(likeCounts.map((r) => [r.targetId, r._count]));
  const likedSet = new Set(viewerLikes.map((r) => r.targetId));
  const decorate = (c) => ({
    ...c,
    likeCount: likeMap[c.id] || 0,
    likedByMe: likedSet.has(c.id),
  });

  const grouped = top.map((c) => ({
    ...decorate(c),
    replies: replies.filter((r) => r.parentCommentId === c.id).map(decorate),
  }));
  res.json({ comments: grouped });
});

export default router;
