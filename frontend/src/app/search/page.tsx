'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { avatarFor } from '@/lib/avatar';
import { Search, User, FileText } from 'lucide-react';
import Loader from '@/components/Loader';
import { motion, AnimatePresence } from 'framer-motion';

type UserHit = { id: string; handle: string; displayName: string; profilePicture: string | null; bio: string | null };
type PostHit = { id: string; body: string; createdAt: string; author: { id: string; handle: string; displayName: string; profilePicture: string | null } };

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQ = searchParams?.get('q') || '';
  
  const [q, setQ] = useState(initialQ);
  const [type, setType] = useState<'users' | 'posts'>('users');
  const [users, setUsers] = useState<UserHit[]>([]);
  const [posts, setPosts] = useState<PostHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setUsers([]);
      setPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      api<any>(`/api/search?q=${encodeURIComponent(q)}&type=${type}`).then((r) => {
        setUsers(r.users || []);
        setPosts(r.posts || []);
        setLoading(false);
      }).catch(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, type]);

  return (
    <div className="space-y-6">
      <div className="relative group">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-rose-500 transition-colors" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search for people or posts..."
          className="block w-full rounded-[2rem] border border-slate-200/60 bg-white/80 p-4 pl-14 text-sm font-medium shadow-soft backdrop-blur-xl focus:border-rose-500/50 focus:outline-none focus:ring-2 focus:ring-rose-500/50 dark:border-slate-800/60 dark:bg-slate-900/80 transition-all placeholder:text-slate-400"
        />
      </div>

      <div className="flex gap-2 p-1 bg-slate-100/50 dark:bg-slate-800/30 rounded-2xl w-fit">
        <button
          type="button"
          onClick={() => setType('users')}
          className={`relative flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold transition-all ${
            type === 'users' ? 'text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          {type === 'users' && (
            <motion.div layoutId="searchTab" className="absolute inset-0 rounded-xl bg-white shadow-sm dark:bg-slate-700" />
          )}
          <span className="relative z-10 flex items-center gap-2"><User className="h-4 w-4" /> People</span>
        </button>
        <button
          type="button"
          onClick={() => setType('posts')}
          className={`relative flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold transition-all ${
            type === 'posts' ? 'text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          {type === 'posts' && (
            <motion.div layoutId="searchTab" className="absolute inset-0 rounded-xl bg-white shadow-sm dark:bg-slate-700" />
          )}
          <span className="relative z-10 flex items-center gap-2"><FileText className="h-4 w-4" /> Posts</span>
        </button>
      </div>

      <div className="min-h-[300px]">
        {loading ? (
          <div className="flex justify-center p-12">
            <Loader size="md" className="text-slate-300" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {type === 'users' && (
              <motion.ul 
                key="users"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                {users.map((u) => (
                  <motion.li key={u.id} layout>
                    <Link
                      href={`/u/${u.handle}`}
                      className="group flex items-center gap-4 rounded-3xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all hover:border-rose-200 hover:shadow-md dark:border-slate-800/60 dark:bg-slate-900/50 dark:hover:border-rose-900/50"
                    >
                      <img src={avatarFor(u)} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-transparent group-hover:ring-rose-100 transition-all" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-rose-500 transition-colors">{u.displayName}</div>
                        <div className="truncate text-sm font-medium text-slate-500">@{u.handle}</div>
                        {u.bio && <div className="mt-1 truncate text-xs text-slate-600 dark:text-slate-400">{u.bio}</div>}
                      </div>
                      <button className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-900 opacity-0 group-hover:opacity-100 transition-opacity dark:bg-slate-800 dark:text-white">View Profile</button>
                    </Link>
                  </motion.li>
                ))}
                {q && users.length === 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
                    <User className="mb-3 h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-500">No people found for "{q}"</p>
                  </motion.div>
                )}
              </motion.ul>
            )}

            {type === 'posts' && (
              <motion.ul 
                key="posts"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                {posts.map((p) => (
                  <motion.li key={p.id} layout>
                    <Link
                      href={`/p/${p.id}`}
                      className="group block rounded-3xl border border-slate-200/60 bg-white p-5 shadow-sm transition-all hover:border-rose-200 hover:shadow-md dark:border-slate-800/60 dark:bg-slate-900/50 dark:hover:border-rose-900/50"
                    >
                      <div className="mb-3 flex items-center gap-3">
                        <img src={avatarFor(p.author)} alt="" className="h-8 w-8 rounded-full" />
                        <div>
                          <span className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-rose-500 transition-colors">{p.author.displayName}</span>
                          <span className="ml-2 text-xs font-medium text-slate-500">@{p.author.handle}</span>
                        </div>
                      </div>
                      <p className="line-clamp-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{p.body}</p>
                    </Link>
                  </motion.li>
                ))}
                {q && posts.length === 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
                    <FileText className="mb-3 h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-500">No posts found for "{q}"</p>
                  </motion.div>
                )}
              </motion.ul>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center"><Loader size="sm" className="mx-auto text-slate-300" /></div>}>
      <SearchContent />
    </Suspense>
  );
}
