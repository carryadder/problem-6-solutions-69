'use client';

import { useEffect, useState } from 'react';
import { api, apiJson } from '@/lib/api';
import { MessageSquare } from 'lucide-react';
import Loader from './Loader';
import { motion } from 'framer-motion';
import { CommentRow, CommentT } from './CommentRow';

export function InlineComments({ postId, onCommentAdded }: { postId: string, onCommentAdded: () => void }) {
  const [comments, setComments] = useState<CommentT[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<{ comments: CommentT[] }>(`/api/posts/${postId}/comments`)
      .then((r) => setComments(r.comments))
      .finally(() => setLoading(false));
  }, [postId]);

  async function postComment() {
    if (busy || body.trim().length === 0) return;
    setBusy(true);
    try {
      const { comment } = await apiJson<{ comment: CommentT }>(
        `/api/posts/${postId}/comments`,
        { body },
      );
      setComments((prev) => [...prev, { ...comment, likeCount: 0, likedByMe: false, replies: [] }]);
      setBody('');
      onCommentAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-4 border-t border-slate-100 dark:border-slate-800/60 pt-4"
    >
      <div className="flex gap-3 mb-6">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 500))}
          placeholder="Add a comment…"
          className="flex-1 rounded-full border border-slate-200/60 bg-slate-50 px-5 py-2.5 text-[14px] shadow-inner transition-colors focus:border-rose-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rose-100 dark:border-slate-700/60 dark:bg-slate-800/50 dark:focus:border-rose-900/50 dark:focus:bg-slate-800"
        />
        <button
          type="button"
          onClick={postComment}
          disabled={busy || body.trim().length === 0}
          className="rounded-full bg-slate-900 px-5 py-2.5 text-[14px] font-bold text-white shadow-sm transition-all hover:scale-105 disabled:pointer-events-none disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          Post
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader size="sm" className="text-slate-300" />
        </div>
      ) : comments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-slate-400 dark:text-slate-500">
          <MessageSquare className="mb-2 h-6 w-6 opacity-20" />
          <p className="text-[13px] font-medium">No comments yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {comments.map((c) => (
            <div key={c.id} className="space-y-3">
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
                <div className="ml-12 space-y-3 border-l-2 border-slate-100 pl-4 dark:border-slate-800/60">
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
      )}
    </motion.div>
  );
}
