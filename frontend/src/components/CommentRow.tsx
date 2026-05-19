'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiJson } from '@/lib/api';
import { avatarFor } from '@/lib/avatar';
import { Heart, Reply } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export type CommentT = {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  parentCommentId: string | null;
  author: { id: string; handle: string; displayName: string; profilePicture: string | null };
  likeCount: number;
  likedByMe: boolean;
  replies?: CommentT[];
};

export function CommentRow({
  c,
  onChange,
  onReply,
}: {
  c: CommentT;
  onChange: (c: CommentT) => void;
  onReply?: (c: CommentT) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [replyBody, setReplyBody] = useState('');

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !c.likedByMe;
    const optim = { ...c, likedByMe: next, likeCount: c.likeCount + (next ? 1 : -1) };
    onChange(optim);
    try {
      const res = await apiJson<{ count: number }>(
        '/api/likes',
        { targetType: 'COMMENT', targetId: c.id },
        next ? 'POST' : 'DELETE',
      );
      onChange({ ...optim, likeCount: res.count });
    } catch {
      onChange(c);
    } finally {
      setBusy(false);
    }
  }

  async function postReply() {
    if (replyBody.trim().length === 0) return;
    try {
      const { comment } = await apiJson<{ comment: CommentT }>(`/api/comments/${c.id}/replies`, {
        body: replyBody,
      });
      onReply?.({ ...comment, likeCount: 0, likedByMe: false });
      setReplyBody('');
      setShowReply(false);
    } catch {/* ignore */}
  }

  return (
    <div className="flex gap-4">
      <Link href={`/u/${c.author.handle}`} className="shrink-0">
        <img src={avatarFor(c.author)} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-transparent hover:ring-rose-100 dark:hover:ring-rose-900/30 transition-all" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="rounded-3xl rounded-tl-sm bg-slate-50 px-5 py-3.5 dark:bg-slate-800/40">
          <Link href={`/u/${c.author.handle}`} className="text-[14px] font-bold text-slate-900 hover:underline dark:text-slate-100">
            {c.author.displayName}
          </Link>
          <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
            {c.body}
          </p>
        </div>
        <div className="mt-2 ml-2 flex items-center gap-4 text-[13px] font-semibold text-slate-500">
          <button
            type="button"
            onClick={toggle}
            className={`flex items-center gap-1.5 transition-colors ${c.likedByMe ? 'text-rose-600 dark:text-rose-500' : 'hover:text-rose-600 dark:hover:text-rose-400'}`}
          >
            <Heart className={`h-4 w-4 ${c.likedByMe ? 'fill-current' : ''}`} />
            <span>{c.likeCount > 0 ? c.likeCount : 'Like'}</span>
          </button>
          {onReply && (
            <button type="button" onClick={() => setShowReply((v) => !v)} className="flex items-center gap-1.5 hover:text-slate-700 dark:hover:text-slate-300">
              <Reply className="h-4 w-4" />
              <span>Reply</span>
            </button>
          )}
        </div>
        <AnimatePresence>
          {showReply && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 flex gap-2 overflow-hidden"
            >
              <input
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value.slice(0, 500))}
                placeholder="Write a reply…"
                autoFocus
                className="flex-1 rounded-full border border-slate-200/60 bg-white px-4 py-2 text-[14px] shadow-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-500 dark:border-slate-700/60 dark:bg-slate-800/80 dark:focus:border-rose-500 outline-none transition-all"
              />
              <button
                type="button"
                onClick={postReply}
                disabled={!replyBody.trim()}
                className="rounded-full bg-slate-900 px-4 py-2 text-[14px] font-bold text-white transition-all hover:scale-105 disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                Reply
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
