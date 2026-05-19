'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

const FEATURES = [
  { label: 'Threaded replies', detail: 'Keep discussions tidy and fast to scan.' },
  { label: 'Emoji live chat', detail: 'Low-pressure rooms for real-time reactions.' },
  { label: 'Profiles that feel alive', detail: 'Handles, avatars, bios, and shareable identity.' },
];

const METRICS = [
  { value: 'Google-only', label: 'frictionless access' },
  { value: 'Mobile-first', label: 'clean on every screen' },
  { value: 'Live now', label: 'chat + notifications' },
];

function GoogleButton({ isSigningIn, onClick }: { isSigningIn: boolean; onClick: () => Promise<void> }) {
  return (
    <button
      type="button"
      disabled={isSigningIn}
      onClick={onClick}
      className="flex min-h-12 w-full items-center justify-center gap-3 rounded-full bg-[var(--text)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8a12 12 0 1 1 0-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 24 44a20 20 0 0 0 19.6-23.5z"/>
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z"/>
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.6 5.1A20 20 0 0 0 24 44z"/>
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2c-.4.4 6.6-4.8 6.6-14.3 0-1.3-.1-2.6-.4-3.9z"/>
      </svg>
      <span>{isSigningIn ? 'Redirecting...' : 'Continue with Google'}</span>
    </button>
  );
}

export default function AuthLanding({ mode }: { mode: 'home' | 'login' }) {
  const [isSigningIn, setIsSigningIn] = useState(false);

  async function startGoogleSignIn() {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      await signIn('google', { callbackUrl: '/feed' });
    } catch {
      setIsSigningIn(false);
    }
  }

  const copy =
    mode === 'home'
      ? {
          eyebrow: 'Editorial Social',
          title: 'A calmer feed with sharper conversations.',
          body: 'Posts, profiles, emoji chat, and notification-driven replies wrapped in a cleaner, modern reading experience.',
          cardTitle: 'Step into your circle',
        }
      : {
          eyebrow: 'Welcome Back',
          title: 'Pick up the thread without the clutter.',
          body: 'Your feed, chats, and profile history are waiting exactly where you left them. Sign in once and move.',
          cardTitle: 'Sign in to continue',
        };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid w-full gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:gap-8">
        <section className="surface-panel relative overflow-hidden rounded-[32px] p-6 sm:p-8 lg:p-10">
          <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,rgba(91,93,240,0.18),transparent_62%)]" />
          <div className="relative space-y-8">
            <div className="space-y-4">
              <div className="eyebrow">{copy.eyebrow}</div>
              <h1 className="font-display max-w-3xl text-4xl leading-tight text-[var(--text)] sm:text-5xl lg:text-6xl">
                {copy.title}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
                {copy.body}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {METRICS.map((metric) => (
                <div key={metric.label} className="surface-panel-strong rounded-[24px] p-4">
                  <div className="font-display text-2xl text-[var(--text)]">{metric.value}</div>
                  <div className="mt-1 text-sm text-[var(--muted)]">{metric.label}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-3">
              {FEATURES.map((feature, index) => (
                <div key={feature.label} className="surface-panel-strong flex items-start gap-4 rounded-[24px] p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/12 text-sm font-semibold text-[var(--accent)]">
                    0{index + 1}
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--text)] sm:text-base">{feature.label}</h2>
                    <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{feature.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="surface-panel-strong flex flex-col justify-between rounded-[32px] p-6 sm:p-8">
          <div className="space-y-6">
            <div>
              <div className="eyebrow">Modern, mobile, social</div>
              <h2 className="mt-3 font-display text-3xl text-[var(--text)]">{copy.cardTitle}</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                Google is the only way in. No passwords, no extra setup, just your feed and your people.
              </p>
            </div>

            <div className="rounded-[28px] bg-[linear-gradient(135deg,rgba(91,93,240,0.12),rgba(14,165,233,0.08))] p-4">
              <div className="text-sm font-semibold text-[var(--text)]">Inside the product</div>
              <div className="mt-3 space-y-3 text-sm text-[var(--muted)]">
                <div className="flex items-center justify-between rounded-2xl bg-white/60 px-4 py-3 dark:bg-slate-900/50">
                  <span>Profile polish</span>
                  <span className="font-medium text-[var(--text)]">Handles + avatars</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white/60 px-4 py-3 dark:bg-slate-900/50">
                  <span>Conversation flow</span>
                  <span className="font-medium text-[var(--text)]">Threads + reactions</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white/60 px-4 py-3 dark:bg-slate-900/50">
                  <span>Ambient contact</span>
                  <span className="font-medium text-[var(--text)]">Emoji live rooms</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            <GoogleButton isSigningIn={isSigningIn} onClick={startGoogleSignIn} />
            <p className="text-center text-xs leading-5 text-[var(--muted)]">
              By continuing, you land directly in your feed and can start posting immediately.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
