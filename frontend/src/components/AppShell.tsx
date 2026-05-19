"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { useApi, apiJson } from "@/lib/api";
import { avatarFor } from "@/lib/avatar";
import {
  Home,
  Search,
  MessageCircle,
  Bell,
  User,
  Sun,
  Moon,
  LogOut,
  LogIn,
} from "lucide-react";

import { motion, AnimatePresence } from "framer-motion";

const NAV = [
  { href: "/feed", label: "Feed", icon: Home },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/notifications", label: "Alerts", icon: Bell },
];

function ThemeToggle({ isBottomNav }: { isBottomNav?: boolean }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const sys = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = stored ? stored === "dark" : sys;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  if (isBottomNav) {
    return (
      <motion.button
        whileTap={{ scale: 0.8 }}
        onClick={() => {
          const next = !dark;
          setDark(next);
          document.documentElement.classList.toggle("dark", next);
          localStorage.setItem("theme", next ? "dark" : "light");
        }}
        className="flex flex-col items-center justify-center py-3 text-[10px] font-semibold text-slate-500 transition-colors dark:text-slate-400 w-full"
        aria-label="Toggle theme"
      >
        {dark ? (
          <Moon className="mb-1 h-6 w-6 stroke-2" />
        ) : (
          <Sun className="mb-1 h-6 w-6 stroke-2" />
        )}
        <span>Theme</span>
      </motion.button>
    );
  }

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      type="button"
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
        localStorage.setItem("theme", next ? "dark" : "light");
      }}
      className="flex items-center justify-center rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
      aria-label="Toggle theme"
    >
      {dark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </motion.button>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname() || "/";
  const isAuthPage = pathname === "/login" || pathname === "/";
  const [authPending, setAuthPending] = useState(false);

  async function startGoogleSignIn() {
    if (authPending) return;
    setAuthPending(true);
    try {
      await signIn('google', { callbackUrl: '/feed' });
    } catch {
      setAuthPending(false);
    }
  }

  const { data: meData } = useApi<{ user: any }>(
    status === "authenticated" ? "/api/users/me" : null,
  );
  const me = meData?.user;

  const { data: notifData } = useApi<{ unread: number }>(
    status === "authenticated" ? "/api/notifications" : null,
  );
  const unread = notifData?.unread || 0;

  const { data: trendingData } = useApi<{
    trending: { tag: string; count: string }[];
  }>("/api/posts/trending-tags");
  const trending = trendingData?.trending || [];

  const { data: suggestedData } = useApi<{ users: any[] }>(
    "/api/users/suggested",
  );
  const suggested = suggestedData?.users || [];

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [setupDisplayName, setSetupDisplayName] = useState("");
  const [setupHandle, setSetupHandle] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState("");

  useEffect(() => {
    if (me && me.setupComplete === false && !showOnboarding) {
      setShowOnboarding(true);
      setSetupDisplayName(me.displayName);
      setSetupHandle(me.handle);
    }
  }, [me]);

  async function completeSetup() {
    if (setupBusy) return;
    setSetupBusy(true);
    setSetupError("");
    try {
      await apiJson(
        "/api/users/me",
        {
          displayName: setupDisplayName,
          handle: setupHandle,
          setupComplete: true,
        },
        "PATCH",
      );
      setShowOnboarding(false);
      window.location.reload();
    } catch (e: any) {
      setSetupError(
        e.message || "Error updating profile. Handle may be taken.",
      );
    } finally {
      setSetupBusy(false);
    }
  }

  if (isAuthPage) return <>{children}</>;

  return (
    <>
      <AnimatePresence>
        {showOnboarding && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <h2 className="mb-2 text-2xl font-extrabold">
                Welcome to Social<span className="text-rose-500">.</span>
              </h2>
              <p className="mb-6 text-sm text-slate-500">
                Let's set up your profile so people know who you are!
              </p>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-300">
                    Display Name
                  </label>
                  <input
                    value={setupDisplayName}
                    onChange={(e) => setSetupDisplayName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-slate-800 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-300">
                    Username / Handle
                  </label>
                  <input
                    value={setupHandle}
                    onChange={(e) =>
                      setSetupHandle(
                        e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-slate-800 dark:bg-slate-950"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    Only lowercase letters, numbers, and underscores.
                  </p>
                </div>
                {setupError && (
                  <div className="text-sm font-bold text-red-500">
                    {setupError}
                  </div>
                )}
              </div>

              <button
                onClick={completeSetup}
                disabled={setupBusy || !setupHandle || !setupDisplayName}
                className="mt-8 w-full rounded-full bg-slate-900 py-3.5 text-sm font-bold text-white transition-all hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                {setupBusy ? "Saving..." : "Get Started"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex flex-col md:flex-row h-screen w-full relative md:mx-auto md:max-w-7xl overflow-hidden">
        {/* Left sidebar (large screens only) */}
        <aside className="hidden lg:flex lg:w-72 lg:flex-col lg:fixed lg:inset-y-0 lg:py-6 lg:px-4">
          <div className="flex h-full flex-col rounded-3xl border border-slate-200/60 bg-white/50 backdrop-blur-xl p-4 shadow-soft dark:border-slate-800/60 dark:bg-black/40">
            <Link
              href="/feed"
              className="mb-8 mt-2 px-3 text-2xl font-extrabold tracking-tight"
            >
              Social<span className="text-rose-500">.</span>
            </Link>
            <nav className="flex flex-1 flex-col gap-2">
              {NAV.map((n) => {
                const active = pathname.startsWith(n.href);
                const Icon = n.icon;
                return (
                  <Link key={n.href} href={n.href}>
                    <motion.div
                      whileHover={{ x: 4 }}
                      whileTap={{ scale: 0.98 }}
                      className={`group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                        active
                          ? "bg-slate-900 text-white shadow-md dark:bg-white dark:text-slate-900"
                          : "text-slate-600 hover:bg-white hover:shadow-sm dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-white"
                      }`}
                    >
                      <Icon
                        className={`h-5 w-5 ${active ? "" : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-white"}`}
                      />
                      <span>{n.label}</span>
                      {n.href === "/notifications" && unread > 0 && (
                        <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white shadow-sm">
                          {unread}
                        </span>
                      )}
                    </motion.div>
                  </Link>
                );
              })}
              {me && (
                <Link href={`/u/${me.handle}`}>
                  <motion.div
                    whileHover={{ x: 4 }}
                    whileTap={{ scale: 0.98 }}
                    className={`group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                      pathname.startsWith("/u/")
                        ? "bg-slate-900 text-white shadow-md dark:bg-white dark:text-slate-900"
                        : "text-slate-600 hover:bg-white hover:shadow-sm dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-white"
                    }`}
                  >
                    <img
                      src={avatarFor(me)}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover ring-2 ring-white dark:ring-slate-800"
                    />
                    <span>Profile</span>
                  </motion.div>
                </Link>
              )}
            </nav>
            <div className="mt-4 flex items-center justify-between border-t border-slate-200/60 pt-4 dark:border-slate-800/60">
              <ThemeToggle />
            </div>
          </div>
        </aside>

        {/* Mobile top bar is removed to maximize feed space */}

        <main className="flex-1 overflow-auto pb-24 pt-4 lg:ml-72 lg:py-6 lg:mr-80 flex flex-col">
          {/* Desktop Global Search Bar */}
          <div className="sticky top-0 z-30 hidden md:block mb-6 mx-auto w-full max-w-2xl px-4 pt-2 relative">
            <form action="/search" method="get" className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-rose-500 transition-colors" />
              <input
                name="q"
                placeholder="Search posts or people..."
                className="w-full bg-white/70 dark:bg-black/40 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/60 rounded-full py-3.5 pl-12 pr-4 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500/50 transition-all placeholder:text-slate-500"
              />
            </form>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex lg:hidden items-center">
              {status === "authenticated" ? (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="rounded-xl p-2 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                  aria-label="Sign out"
                >
                  <LogOut className="h-5 w-5" />
                </motion.button>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={startGoogleSignIn}
                  disabled={authPending}
                  className="rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white dark:bg-white dark:text-slate-900"
                >
                  {authPending ? 'Signing in...' : 'Sign in'}
                </motion.button>
              )}
            </div>
          </div>
          <div className="w-full px-2 sm:px-4 mx-auto md:max-w-2xl">
            {children}
          </div>
        </main>

        {/* Desktop Right Sidebar */}
        <aside className="hidden lg:flex lg:w-80 lg:flex-col lg:fixed lg:right-0 lg:inset-y-0 lg:py-6 lg:px-4">
          <div className="flex h-full flex-col gap-6">
            {/* Trending Section */}
            <section className="rounded-3xl border border-slate-200/60 bg-white p-5 shadow-soft dark:border-slate-800/60 dark:bg-black/40">
              <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-400">
                Trending Now
              </h3>
              <div className="space-y-4">
                {trending.length > 0 ? (
                  trending.map((t) => (
                    <div key={t.tag} className="group cursor-pointer">
                      <div className="text-sm font-bold text-slate-900 group-hover:text-rose-500 dark:text-slate-100 transition-colors">
                        {t.tag}
                      </div>
                      <div className="text-xs text-slate-500">{t.count}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">
                    No trending topics yet.
                  </div>
                )}
              </div>
            </section>

            {/* Suggested Follows */}
            <section className="rounded-3xl border border-slate-200/60 bg-white p-5 shadow-soft dark:border-slate-800/60 dark:bg-black/40">
              <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-400">
                Who to Follow
              </h3>
              <div className="space-y-4">
                {suggested.length > 0 ? (
                  suggested.map((u) => (
                    <div key={u.handle} className="flex items-center gap-3">
                      <Link href={`/u/${u.handle}`} className="shrink-0">
                        <img
                          src={avatarFor(u)}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/u/${u.handle}`}
                          className="block truncate text-sm font-bold text-slate-900 hover:underline dark:text-slate-100"
                        >
                          {u.displayName}
                        </Link>
                        <div className="truncate text-xs text-slate-500">
                          @{u.handle}
                        </div>
                      </div>
                      <Link href={`/u/${u.handle}`}>
                        <button className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900">
                          View
                        </button>
                      </Link>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">
                    More suggestions coming soon!
                  </div>
                )}
              </div>
            </section>

            {/* Footer Links */}
            <div className="hidden lg:flex lg:justify-end lg:items-center lg:px-4">
              {status === "authenticated" ? (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="flex items-center gap-2 rounded-xl p-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 transition-colors dark:text-rose-400 dark:hover:bg-rose-950/30"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Sign out</span>
                </motion.button>
              ) : (
                <Link href="/login" className="hidden lg:inline">
                  <button className="rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white dark:bg-white dark:text-slate-900">
                    Sign in
                  </button>
                </Link>
              )}
            </div>
            <footer className="px-4 text-[11px] font-medium text-slate-400">
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <a href="#" className="hover:underline">
                  Privacy
                </a>
                <a href="#" className="hover:underline">
                  Terms
                </a>
                <a href="#" className="hover:underline">
                  Cookies
                </a>
                <span>© 2024 Social Inc.</span>
              </div>
            </footer>
          </div>
        </aside>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200/60 bg-white/90 backdrop-blur-xl pb-safe dark:border-slate-800/60 dark:bg-slate-950/90 md:hidden">
          {NAV.map((n) => {
            const active = pathname.startsWith(n.href);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`relative flex flex-col items-center justify-center py-3 text-[10px] font-semibold transition-colors ${
                  active
                    ? "text-slate-900 dark:text-white"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                <motion.div
                  whileTap={{ scale: 0.8 }}
                  className="flex flex-col items-center"
                >
                  <Icon
                    className={`mb-1 h-6 w-6 ${active ? "stroke-[2.5px]" : "stroke-2"}`}
                  />
                  <span>{n.label}</span>
                  {n.href === "/notifications" && unread > 0 && (
                    <span className="absolute top-2 right-4 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[8px] font-bold text-white">
                      {unread}
                    </span>
                  )}
                </motion.div>
              </Link>
            );
          })}
          <ThemeToggle isBottomNav />
          {me ? (
            <Link
              href={`/u/${me.handle}`}
              className="flex flex-col items-center justify-center py-3 text-[10px] font-semibold text-slate-500 transition-colors dark:text-slate-400"
            >
              <img
                src={avatarFor(me)}
                alt=""
                className="mb-1 h-6 w-6 rounded-full object-cover ring-2 ring-transparent"
              />
              <span>Me</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => signIn("google")}
              className="flex flex-col items-center justify-center py-3 text-[10px] font-semibold text-slate-500 transition-colors dark:text-slate-400"
            >
              <User className="mb-1 h-6 w-6 stroke-2" />
              <span>Sign in</span>
            </button>
          )}
        </nav>
      </div>
    </>
  );
}
