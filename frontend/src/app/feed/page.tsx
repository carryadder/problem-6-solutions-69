"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Composer from "@/components/Composer";
import PostCard, { PostT } from "@/components/PostCard";
import Loader from "@/components/Loader";

import { Sparkles, Flame, Zap, User, Inbox } from "lucide-react";

export default function FeedPage() {
  const { status } = useSession();
  const router = useRouter();
  const [posts, setPosts] = useState<PostT[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [feedType, setFeedType] = useState<"newest" | "popular" | "yours">(
    "newest",
  );

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  async function load(initial = false, type = feedType) {
    if ((loading || done) && !initial) return;
    setLoading(true);
    try {
      const url = `/api/posts/feed?type=${type}${cursor && !initial ? `&cursor=${cursor}` : ""}`;
      const res = await api<{ posts: PostT[]; nextCursor: string | null }>(url);
      setPosts((prev) => (initial ? res.posts : [...prev, ...res.posts]));
      setCursor(res.nextCursor);
      if (!res.nextCursor) setDone(true);
      else setDone(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === "authenticated") load(true, feedType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, feedType]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader size="md" className="text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome / Discover Section */}
      <div className="overflow-hidden rounded-xl sm:rounded-[40px] bg-slate-900 p-4 sm:p-8 text-white shadow-xl dark:bg-white dark:text-slate-900">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-lg sm:text-2xl font-bold">Good to see you!</h2>
          <Sparkles className="h-6 w-6 text-rose-500" />
        </div>
        <p className="mb-4 sm:mb-6 text-sm font-medium text-slate-400 dark:text-slate-500">
          Here's what's happening in your circles today.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { label: "Popular", value: "popular", icon: Flame },
            { label: "Newest", value: "newest", icon: Zap },
            { label: "Yours", value: "yours", icon: User },
          ].map((tab) => {
            const active = feedType === tab.value;
            const Icon = tab.icon;
            return (
              <button
                key={tab.label}
                onClick={() => {
                  setFeedType(tab.value as any);
                  setCursor(null);
                  setPosts([]);
                }}
                className={`flex flex-col items-center gap-2 rounded-xl sm:rounded-3xl p-3 sm:p-4 transition-all ${
                  active
                    ? "bg-rose-500 text-white shadow-lg dark:bg-rose-600"
                    : "bg-white/10 hover:bg-white/20 dark:bg-slate-100 dark:hover:bg-slate-200 text-slate-300 dark:text-slate-600"
                }`}
              >
                <Icon className={`h-6 w-6 ${active ? "scale-110" : ""}`} />
                <span
                  className={`text-xs font-bold ${active ? "text-white" : ""}`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Composer
        onCreate={(p) =>
          feedType === "newest" || feedType === "yours"
            ? setPosts((prev) => [p, ...prev])
            : undefined
        }
      />
      {posts.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/50 p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/20">
          <div className="mb-4 rounded-full bg-slate-100 p-4 dark:bg-slate-800">
            <Inbox className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="mb-2 text-lg font-bold text-slate-900 dark:text-slate-100">
            It's quiet in here
          </h3>
          <p className="text-sm font-medium text-slate-500">
            No posts found for this view.
          </p>
        </div>
      )}
      <div className="space-y-6">
        {posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            onChange={(np) =>
              setPosts((prev) => prev.map((x) => (x.id === np.id ? np : x)))
            }
            onDelete={(id) =>
              setPosts((prev) => prev.filter((x) => x.id !== id))
            }
          />
        ))}
      </div>
      {!done && (
        <div className="pt-4 pb-12 text-center">
          <button
            type="button"
            onClick={() => load(false)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:shadow-md disabled:pointer-events-none disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/80"
          >
            {loading ? (
              <>
                <Loader size="xs" />
                <span>Loading…</span>
              </>
            ) : (
              "Load older posts"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
