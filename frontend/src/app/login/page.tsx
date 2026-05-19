'use client';

import { signIn } from 'next-auth/react';
import { motion } from 'framer-motion';
import { useState } from 'react';

export default function LoginPage() {
  const [isSigningIn, setIsSigningIn] = useState(false);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-noise">
      {/* Soft gradient background elements */}
      <div className="absolute top-1/4 left-1/4 -z-10 h-96 w-96 rounded-full bg-rose-200/50 mix-blend-multiply blur-3xl dark:bg-rose-900/20 dark:mix-blend-lighten" />
      <div className="absolute top-1/3 right-1/4 -z-10 h-96 w-96 rounded-full bg-amber-200/50 mix-blend-multiply blur-3xl dark:bg-amber-900/20 dark:mix-blend-lighten" />
      <div className="absolute bottom-1/4 left-1/3 -z-10 h-96 w-96 rounded-full bg-blue-200/50 mix-blend-multiply blur-3xl dark:bg-blue-900/20 dark:mix-blend-lighten" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="z-10 flex w-full max-w-md flex-col items-center gap-8 rounded-3xl border border-slate-200/60 bg-white/60 p-10 backdrop-blur-2xl shadow-soft-lg dark:border-slate-800/60 dark:bg-slate-950/60"
      >
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md dark:bg-white dark:text-slate-900">
            <span className="text-3xl">✨</span>
          </div>
          <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Welcome back</h1>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Google is the only way in. We don't store passwords.
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          disabled={isSigningIn}
          onClick={() => {
            setIsSigningIn(true);
            signIn('google', { callbackUrl: '/feed' }).catch(() => setIsSigningIn(false));
          }}
          className="group flex w-full items-center justify-center gap-3 rounded-full bg-white px-6 py-4 text-sm font-bold text-slate-900 shadow-md ring-1 ring-slate-200/50 transition-all hover:bg-slate-50 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70 dark:bg-slate-900 dark:text-white dark:ring-slate-800 dark:hover:bg-slate-800"
        >
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden className="transition-transform group-hover:scale-110">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8a12 12 0 1 1 0-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 24 44a20 20 0 0 0 19.6-23.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.6 5.1A20 20 0 0 0 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2c-.4.4 6.6-4.8 6.6-14.3 0-1.3-.1-2.6-.4-3.9z"/>
          </svg>
          {isSigningIn ? 'Signing in...' : 'Continue with Google'}
        </motion.button>
      </motion.div>
    </main>
  );
}
