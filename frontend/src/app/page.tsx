"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export default function HomePage() {
  const { status } = useSession();
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace("/feed");
  }, [status, router]);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-noise">
      {/* Soft gradient background elements */}
      <div className="absolute top-1/4 left-1/4 -z-10 h-96 w-96 rounded-full bg-rose-200/50 mix-blend-multiply blur-3xl dark:bg-rose-900/20 dark:mix-blend-lighten" />
      <div className="absolute top-1/3 right-1/4 -z-10 h-96 w-96 rounded-full bg-amber-200/50 mix-blend-multiply blur-3xl dark:bg-amber-900/20 dark:mix-blend-lighten" />
      <div className="absolute bottom-1/4 left-1/3 -z-10 h-96 w-96 rounded-full bg-blue-200/50 mix-blend-multiply blur-3xl dark:bg-blue-900/20 dark:mix-blend-lighten" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="z-10 mx-auto flex max-w-6xl flex-col items-center gap-20 p-6 pt-32 text-center"
      >
        <div className="space-y-8">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-white shadow-soft-lg dark:bg-slate-900 dark:shadow-none dark:border dark:border-slate-800"
          >
            <span className="text-4xl">✨</span>
          </motion.div>
          <h1 className="text-6xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-7xl lg:text-8xl">
            Gather{" "}
            <span className="text-slate-400 dark:text-slate-500">around.</span>
          </h1>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-400 md:text-xl">
            A quiet corner of the internet for meaningful connections. No ads,
            no algorithmic noise, just you and your people.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              disabled={isSigningIn}
              onClick={() => {
                setIsSigningIn(true);
                signIn("google", { callbackUrl: "/feed" }).catch(() =>
                  setIsSigningIn(false),
                );
              }}
              className="group flex items-center gap-3 rounded-full bg-slate-900 px-8 py-4 text-base font-bold text-white shadow-xl transition-all hover:bg-slate-800 hover:shadow-2xl disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 48 48"
                aria-hidden
                className="transition-transform group-hover:scale-110"
              >
                <path
                  fill="#FFC107"
                  d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8a12 12 0 1 1 0-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 24 44a20 20 0 0 0 19.6-23.5z"
                />
                <path
                  fill="#FF3D00"
                  d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z"
                />
                <path
                  fill="#4CAF50"
                  d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.6 5.1A20 20 0 0 0 24 44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2c-.4.4 6.6-4.8 6.6-14.3 0-1.3-.1-2.6-.4-3.9z"
                />
              </svg>
              {isSigningIn ? "Signing in..." : "Get Started for Free"}
            </motion.button>
            <button className="px-8 py-4 text-sm font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
              Learn how it works
            </button>
          </div>
        </div>

        {/* Feature Cards Section */}
        <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-3">
          {[
            {
              title: "Rich Conversations",
              desc: "Share stories, photos, and ideas in a focused environment.",
              icon: "💬",
              color: "bg-rose-50 dark:bg-rose-950/20",
            },
            {
              title: "Privacy First",
              desc: "Your data is yours. We never sell your information or track you.",
              icon: "🛡️",
              color: "bg-blue-50 dark:bg-blue-950/20",
            },
            {
              title: "Emoji Chats",
              desc: "Express yourself with a unique emoji-only messaging system.",
              icon: "🎭",
              color: "bg-amber-50 dark:bg-amber-950/20",
            },
          ].map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.2, duration: 0.6 }}
              className={`flex flex-col items-start gap-4 rounded-[40px] p-8 text-left shadow-soft ${feature.color}`}
            >
              <div className="text-3xl">{feature.icon}</div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {feature.title}
              </h3>
              <p className="text-[15px] font-medium leading-relaxed text-slate-600 dark:text-slate-400">
                {feature.desc}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Interactive Stats / Social Proof */}
        <div className="flex flex-wrap justify-center gap-12 border-y border-slate-200/60 py-12 dark:border-slate-800/60 w-full">
          {[
            { label: "Daily Interactions", value: "50k+" },
            { label: "Active Communities", value: "1,200+" },
            { label: "Photos Shared", value: "250k+" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {stat.value}
              </div>
              <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        <footer className="pb-12 text-sm font-medium text-slate-400">
          Built with love for the open web.
        </footer>
      </motion.div>
    </main>
  );
}
