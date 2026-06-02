"use client";

import Link from "next/link";
import { useState } from "react";
import { apiJson } from "@/lib/api";
import { avatarFor } from "@/lib/avatar";
import type { PostT } from "@/lib/public-page-types";
import { Heart, MessageCircle, Share, MoreHorizontal } from "lucide-react";

export type { PostT } from "@/lib/public-page-types";

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { InlineComments } from "./InlineComments";
import { Edit2, Trash2 } from "lucide-react";

export default function PostCard({
  post,
  onChange,
  onDelete,
}: {
  post: PostT;
  onChange?: (p: PostT) => void;
  onDelete?: (id: string) => void;
}) {
  const { data: session } = useSession();
  const isAuthor = (session as any)?.userId === post.author.id;

  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(post.body);

  async function handleEditSave() {
    if (busy || !editBody.trim()) return;
    setBusy(true);
    try {
      const { post: updatedPost } = await apiJson<{ post: PostT }>(
        `/api/posts/${post.id}`,
        { body: editBody },
        "PUT",
      );
      onChange?.(updatedPost);
      setIsEditing(false);
      setShowMenu(false);
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (busy) return;
    if (!confirm("Are you sure you want to delete this post?")) return;
    setBusy(true);
    try {
      await apiJson(`/api/posts/${post.id}`, {}, "DELETE");
      onDelete?.(post.id);
    } catch {
      setBusy(false);
    }
  }

  async function toggleLike() {
    if (busy) return;
    setBusy(true);
    const next = !post.likedByMe;
    const optimistic = {
      ...post,
      likedByMe: next,
      likeCount: post.likeCount + (next ? 1 : -1),
    };
    onChange?.(optimistic);
    try {
      const res = await apiJson<{ count: number }>(
        "/api/likes",
        { targetType: "POST", targetId: post.id },
        next ? "POST" : "DELETE",
      );
      onChange?.({ ...optimistic, likeCount: res.count });
    } catch {
      onChange?.(post);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    try {
      const { url } = await apiJson<{ url: string }>(
        `/api/posts/${post.id}/share`,
        {},
      );
      const full = `${window.location.origin}${url}`;
      if (navigator.share) {
        await navigator.share({ url: full, title: "Post on Social" });
      } else {
        await navigator.clipboard.writeText(full);
      }
      setShared(true);
      setTimeout(() => setShared(false), 2000);
      onChange?.({ ...post, shareCount: post.shareCount + 1 });
    } catch {
      /* ignore */
    }
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      whileHover={{ y: -2 }}
      className="group overflow-hidden rounded-xl sm:rounded-3xl border border-slate-200/60 bg-white p-3 sm:p-5 shadow-soft transition-all hover:border-slate-300 hover:shadow-soft-lg dark:border-slate-800/60 dark:bg-slate-900/50 dark:hover:border-slate-700"
    >
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/u/${post.author.handle}`}>
            <img
              src={avatarFor(post.author)}
              alt=""
              className="h-9 w-9 sm:h-11 sm:w-11 rounded-full object-cover ring-2 ring-transparent transition-all group-hover:ring-rose-100 dark:group-hover:ring-rose-900/30"
            />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={`/u/${post.author.handle}`}
                className="block truncate text-sm sm:text-base font-bold text-slate-900 hover:underline dark:text-slate-100"
              >
                {post.author.displayName}
              </Link>
              <span
                className="flex h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                title="Online"
              />
            </div>
            <div className="text-[12px] sm:text-[13px] font-medium text-slate-500">
              @{post.author.handle} · {timeAgo(post.createdAt)}
            </div>
          </div>
        </div>
        {isAuthor && (
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setShowMenu(!showMenu);
              }}
              className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute right-0 top-full mt-2 w-48 rounded-2xl bg-white shadow-xl ring-1 ring-slate-200/50 dark:bg-slate-800 dark:ring-slate-700/50 z-10 overflow-hidden"
                >
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setIsEditing(true);
                      setShowMenu(false);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <Edit2 className="h-4 w-4" /> Edit Post
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setShowMenu(false);
                      handleDelete();
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 dark:text-red-500 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" /> Delete Post
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </header>

      {isEditing ? (
        <div className="mb-4 space-y-3">
          <textarea
            autoFocus
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[15px] focus:border-rose-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rose-500/10 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-100"
            rows={4}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setEditBody(post.body);
              }}
              className="rounded-full px-5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleEditSave}
              disabled={busy || !editBody.trim() || editBody === post.body}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-bold text-white hover:scale-105 transition-transform disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              Save Changes
            </button>
          </div>
        </div>
      ) : (
        <Link href={`/p/${post.id}`} className="block">
          <p className="whitespace-pre-wrap break-words text-sm sm:text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
            {post.body}
          </p>
          {post.imageUrl && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/60 bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900/80">
              <img
                src={post.imageUrl}
                alt=""
                className="max-h-[32rem] w-full object-cover transition-transform duration-500 hover:scale-105"
              />
            </div>
          )}
        </Link>
      )}
      <footer className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 text-[13px] font-medium text-slate-500 dark:border-slate-800/60">
        <motion.button
          whileTap={{ scale: 0.9 }}
          type="button"
          onClick={toggleLike}
          disabled={busy}
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors hover:bg-rose-50 dark:hover:bg-rose-900/20 ${
            post.likedByMe
              ? "text-rose-600 dark:text-rose-500"
              : "hover:text-rose-600 dark:hover:text-rose-400"
          }`}
        >
          <Heart
            className={`h-5 w-5 ${post.likedByMe ? "fill-current" : ""}`}
          />
          <span>{post.likeCount > 0 ? post.likeCount : "Like"}</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          type="button"
          onClick={() => setShowComments(!showComments)}
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${
            showComments
              ? "text-slate-900 bg-slate-100 dark:bg-slate-800 dark:text-slate-100"
              : "hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <MessageCircle className="h-5 w-5" />
          <span>{post.commentCount > 0 ? post.commentCount : "Solution"}</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          type="button"
          onClick={share}
          className="ml-auto flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <Share className="h-5 w-5" />
          <span>
            {shared
              ? "Copied!"
              : post.shareCount > 0
                ? post.shareCount
                : "Share"}
          </span>
        </motion.button>
      </footer>
      <AnimatePresence>
        {showComments && (
          <InlineComments
            postId={post.id}
            onCommentAdded={() =>
              onChange?.({ ...post, commentCount: post.commentCount + 1 })
            }
          />
        )}
      </AnimatePresence>
    </motion.article>
  );
}
