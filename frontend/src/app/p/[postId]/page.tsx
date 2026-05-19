'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, apiJson } from '@/lib/api';
import PostCard, { PostT } from '@/components/PostCard';
import { avatarFor } from '@/lib/avatar';
import { Heart, Reply, MessageSquare } from 'lucide-react';

type CommentT = {
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

function CommentRow({
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
        {showReply && (
          <div className="mt-3 flex gap-2">
            <input
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value.slice(0, 500))}
              placeholder="Write a reply…"
              className="flex-1 rounded-full border-0 bg-slate-100 px-4 py-2 text-[14px] focus:ring-2 focus:ring-slate-200 dark:bg-slate-800/80 dark:focus:ring-slate-700"
            />
            <button
              type="button"
              onClick={postReply}
              className="rounded-full bg-slate-900 px-4 py-2 text-[14px] font-bold text-white transition-transform hover:scale-105 dark:bg-white dark:text-slate-900"
            >
              Reply
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PostDetailPage() {
  const params = useParams<{ postId: string }>();
  const [post, setPost] = useState<PostT | null>(null);
  const [comments, setComments] = useState<CommentT[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ post: PostT }>(`/api/posts/${params.postId}`).then((r) => setPost(r.post)).catch(() => setPost(null));
    api<{ comments: CommentT[] }>(`/api/posts/${params.postId}/comments`).then((r) =>
      setComments(r.comments),
    );
  }, [params.postId]);

  async function postComment() {
    if (busy || body.trim().length === 0) return;
    setBusy(true);
    try {
      const { comment } = await apiJson<{ comment: CommentT }>(
        `/api/posts/${params.postId}/comments`,
        { body },
      );
      setComments((prev) => [...prev, { ...comment, likeCount: 0, likedByMe: false, replies: [] }]);
      setBody('');
      setPost((p) => (p ? { ...p, commentCount: p.commentCount + 1 } : p));
    } finally {
      setBusy(false);
    }
  }

  if (!post) return <div className="p-12 text-center text-[15px] font-medium text-slate-500">Loading…</div>;

  return (
    <div className="space-y-6">
      <PostCard post={post} onChange={setPost} onDelete={() => window.location.href = '/feed'} />

      <div className="space-y-6 rounded-3xl border border-slate-200/60 bg-white p-6 shadow-soft dark:border-slate-800/60 dark:bg-slate-900/50">
        <div className="flex gap-3">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 500))}
            placeholder="Add a comment…"
            className="flex-1 rounded-full border border-slate-200/60 bg-slate-50 px-5 py-3 text-[15px] transition-colors focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-slate-100 dark:border-slate-700/60 dark:bg-slate-800/50 dark:focus:border-slate-600 dark:focus:bg-slate-800 dark:focus:ring-slate-800/50"
          />
          <button
            type="button"
            onClick={postComment}
            disabled={busy || body.trim().length === 0}
            className="rounded-full bg-slate-900 px-6 py-3 text-[15px] font-bold text-white transition-all hover:scale-105 disabled:pointer-events-none disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            Post
          </button>
        </div>

        {comments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-slate-500">
            <MessageSquare className="mb-2 h-8 w-8 opacity-20" />
            <p className="text-[14px] font-medium">No comments yet. Be the first to reply!</p>
          </div>
        )}

        <div className="space-y-8">
          {comments.map((c) => (
            <div key={c.id} className="space-y-4">
              <CommentRow
                c={c}
                onChange={(nc) =>
                  setComments((prev) => prev.map((x) => (x.id === nc.id ? { ...nc, replies: x.replies } : x)))
                }
                onReply={(reply) =>
                  setComments((prev) =>
                    prev.map((x) =>
                      x.id === c.id ? { ...x, replies: [...(x.replies || []), reply] } : x,
                    ),
                  )
                }
              />
              {c.replies && c.replies.length > 0 && (
                <div className="ml-14 space-y-4 border-l-2 border-slate-100 pl-4 dark:border-slate-800/60">
                  {c.replies.map((r) => (
                    <CommentRow
                      key={r.id}
                      c={r}
                      onChange={(nr) =>
                        setComments((prev) =>
                          prev.map((x) =>
                            x.id === c.id
                              ? { ...x, replies: x.replies!.map((y) => (y.id === nr.id ? nr : y)) }
                              : x,
                          ),
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
