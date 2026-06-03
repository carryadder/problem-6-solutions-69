'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import { api, apiJson } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { avatarFor } from '@/lib/avatar';
import EmojiPicker from '@/components/EmojiPicker';
import {
  ArrowLeft,
  Bell,
  BellOff,
  MessageSquare,
  Palette,
  ShieldAlert,
  ShieldBan,
  Smile,
  Flag,
} from 'lucide-react';

type Sender = { id: string; handle: string; displayName: string; profilePicture: string | null };
type MessageT = { id: string; conversationId: string; senderId: string; body: string; createdAt: string; sender: Sender };
type WallpaperId = 'aurora' | 'midnight' | 'sunset' | 'mint' | 'graphite';
type ConversationT = {
  id: string;
  other: Sender | null;
  lastReadAt: string | null;
  otherLastReadAt: string | null;
  pushMuted: boolean;
  wallpaper: WallpaperId;
  blockedByMe: boolean;
  hasBlockedMe: boolean;
};

const WALLPAPERS: Array<{
  id: WallpaperId;
  label: string;
  shell: string;
  overlay: string;
  bubble: string;
}> = [
  {
    id: 'aurora',
    label: 'Aurora',
    shell: 'from-[#f8e8ff] via-[#eef4ff] to-[#dcf6ef] dark:from-[#1f1630] dark:via-[#0f1e2d] dark:to-[#0f2b23]',
    overlay: 'bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.18),transparent_34%)]',
    bubble: 'bg-white/70 dark:bg-slate-900/45',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    shell: 'from-[#dfe7ff] via-[#bcc8ff] to-[#96a3ff] dark:from-[#0b1020] dark:via-[#121a34] dark:to-[#1d2342]',
    overlay: 'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_28%),radial-gradient(circle_at_bottom,rgba(99,102,241,0.28),transparent_32%)]',
    bubble: 'bg-white/65 dark:bg-slate-950/50',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    shell: 'from-[#ffe0c7] via-[#ffd0da] to-[#f9d7ff] dark:from-[#2d1a18] dark:via-[#3b1d29] dark:to-[#2a1730]',
    overlay: 'bg-[radial-gradient(circle_at_top_right,rgba(251,146,60,0.22),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(244,114,182,0.22),transparent_32%)]',
    bubble: 'bg-white/72 dark:bg-slate-900/42',
  },
  {
    id: 'mint',
    label: 'Mint',
    shell: 'from-[#dffaf1] via-[#eafffb] to-[#f8fffe] dark:from-[#0f211d] dark:via-[#102b26] dark:to-[#15302b]',
    overlay: 'bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(45,212,191,0.16),transparent_30%)]',
    bubble: 'bg-white/75 dark:bg-slate-900/40',
  },
  {
    id: 'graphite',
    label: 'Graphite',
    shell: 'from-[#eceff5] via-[#d8dce7] to-[#c8cfdb] dark:from-[#0d1118] dark:via-[#161b24] dark:to-[#1d2430]',
    overlay: 'bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(71,85,105,0.16),transparent_34%)]',
    bubble: 'bg-white/68 dark:bg-slate-900/48',
  },
];

const REPORT_REASONS = ['Spam', 'Harassment', 'Impersonation', 'Abuse', 'Other'];

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function statusLabel(conversation: ConversationT | null, typingName: string | null) {
  if (!conversation) return 'Loading conversation';
  if (conversation.hasBlockedMe) return 'This contact blocked you';
  if (conversation.blockedByMe) return 'You blocked this contact';
  if (typingName) return `${typingName} is typing...`;
  if (conversation.pushMuted) return 'Push notifications muted';
  return 'Private end-to-end vibe';
}

export default function ChatThreadPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { status, data: session } = useSession();
  const [messages, setMessages] = useState<MessageT[]>([]);
  const [conversation, setConversation] = useState<ConversationT | null>(null);
  const [draft, setDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [muteBusy, setMuteBusy] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [appearanceBusy, setAppearanceBusy] = useState(false);
  const [typingName, setTypingName] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedTypingRef = useRef(false);
  const meId = (session as any)?.userId;

  const wallpaper = WALLPAPERS.find((item) => item.id === conversation?.wallpaper) || WALLPAPERS[0];

  const lastOwnMessage = useMemo(() => {
    const ownMessages = messages.filter((message) => message.senderId === meId);
    return ownMessages[ownMessages.length - 1] || null;
  }, [meId, messages]);

  const otherSeenLatestOwnMessage = Boolean(
    lastOwnMessage &&
      conversation?.otherLastReadAt &&
      new Date(conversation.otherLastReadAt).getTime() >= new Date(lastOwnMessage.createdAt).getTime(),
  );

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;

    setLoading(true);
    Promise.all([
      api<{ messages: MessageT[] }>(`/api/conversations/${params.id}/messages`),
      api<{ conversation: ConversationT }>(`/api/conversations/${params.id}`),
    ])
      .then(([messagesRes, conversationRes]) => {
        if (cancelled) return;
        setMessages(messagesRes.messages);
        setConversation(conversationRes.conversation);
        setLoading(false);
      })
      .catch((requestError: Error) => {
        if (cancelled) return;
        setError(requestError.message.includes('blocked') ? 'This conversation is unavailable.' : 'Could not load conversation.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.id, status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let activeSocket: Socket | null = null;
    let cancelled = false;
    let onNewMessage: ((message: MessageT) => void) | null = null;
    let onTypingStart: ((payload: { displayName?: string }) => void) | null = null;
    let onTypingStop: (() => void) | null = null;
    let onReadUpdate: ((payload: { userId: string; at: string }) => void) | null = null;

    getSocket()
      .then((socket) => {
        if (cancelled) return;
        activeSocket = socket;
        socketRef.current = socket;

        onNewMessage = (message: MessageT) => {
          if (message.conversationId !== params.id) return;
          setMessages((prev) => (prev.some((existing) => existing.id === message.id) ? prev : [...prev, message]));
        };

        onTypingStart = ({ displayName }: { displayName?: string }) => {
          setTypingName(displayName || 'Someone');
        };

        onTypingStop = () => {
          setTypingName(null);
        };

        onReadUpdate = ({ userId, at }: { userId: string; at: string }) => {
          if (userId === meId) return;
          setConversation((prev) => (prev ? { ...prev, otherLastReadAt: at } : prev));
        };

        socket.emit('conversation:join', params.id, (ack: { ok?: boolean; error?: string }) => {
          if (!ack?.ok && ack?.error === 'blocked') {
            setConversation((prev) =>
              prev ? { ...prev, hasBlockedMe: true } : prev,
            );
            setError('This conversation is unavailable because one of you is blocked.');
          }
        });

        socket.on('message:new', onNewMessage);
        socket.on('typing:start', onTypingStart);
        socket.on('typing:stop', onTypingStop);
        socket.on('read:update', onReadUpdate);
      })
      .catch(() => {
        setError('Realtime chat is unavailable right now.');
      });

    return () => {
      cancelled = true;
      setTypingName(null);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (startedTypingRef.current) socketRef.current?.emit('typing:stop', { conversationId: params.id });
      startedTypingRef.current = false;
      if (activeSocket) {
        activeSocket.emit('conversation:leave', params.id);
        if (onNewMessage) activeSocket.off('message:new', onNewMessage);
        if (onTypingStart) activeSocket.off('typing:start', onTypingStart);
        if (onTypingStop) activeSocket.off('typing:stop', onTypingStop);
        if (onReadUpdate) activeSocket.off('read:update', onReadUpdate);
      }
    };
  }, [meId, params.id, status]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    if (!conversation?.blockedByMe && !conversation?.hasBlockedMe && messages.length > 0) {
      socketRef.current?.emit('read:update', { conversationId: params.id });
    }
  }, [conversation?.blockedByMe, conversation?.hasBlockedMe, messages.length, params.id]);

  useEffect(() => {
    if (!socketRef.current || conversation?.blockedByMe || conversation?.hasBlockedMe) return;

    if (!draft.trim()) {
      if (startedTypingRef.current) {
        socketRef.current.emit('typing:stop', { conversationId: params.id });
        startedTypingRef.current = false;
      }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      return;
    }

    if (!startedTypingRef.current) {
      socketRef.current.emit('typing:start', { conversationId: params.id });
      startedTypingRef.current = true;
    }

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socketRef.current?.emit('typing:stop', { conversationId: params.id });
      startedTypingRef.current = false;
    }, 1500);
  }, [conversation?.blockedByMe, conversation?.hasBlockedMe, draft, params.id]);

  async function send() {
    const body = draft.trim();
    if (!body || sending || conversation?.blockedByMe || conversation?.hasBlockedMe) return;

    setSending(true);
    setError(null);
    socketRef.current?.emit('typing:stop', { conversationId: params.id });
    startedTypingRef.current = false;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);

    socketRef.current?.emit('message:send', { conversationId: params.id, body }, (ack: any) => {
      setSending(false);
      if (!ack?.ok) {
        if (ack?.error === 'emoji_only') setError('Only emoji are allowed in chat.');
        else if (ack?.error === 'rate_limited') setError('Slow down a bit.');
        else if (ack?.error === 'blocked') setError('You cannot message this person because one of you is blocked.');
        else setError('Could not send.');
        return;
      }

      setDraft('');
      setTypingName(null);
    });
  }

  async function toggleMute() {
    if (!conversation || muteBusy) return;
    setMuteBusy(true);
    const nextMuted = !conversation.pushMuted;
    setConversation({ ...conversation, pushMuted: nextMuted });

    try {
      const res = await apiJson<{ preferences: { pushMuted: boolean; wallpaper: WallpaperId } }>(
        `/api/conversations/${params.id}/preferences`,
        { pushMuted: nextMuted },
        'PATCH',
      );
      setConversation((prev) => (prev ? { ...prev, pushMuted: res.preferences.pushMuted, wallpaper: res.preferences.wallpaper } : prev));
    } catch {
      setConversation(conversation);
    } finally {
      setMuteBusy(false);
    }
  }

  async function setWallpaper(nextWallpaper: WallpaperId) {
    if (!conversation || appearanceBusy || conversation.wallpaper === nextWallpaper) return;
    setAppearanceBusy(true);
    setConversation({ ...conversation, wallpaper: nextWallpaper });

    try {
      const res = await apiJson<{ preferences: { pushMuted: boolean; wallpaper: WallpaperId } }>(
        `/api/conversations/${params.id}/preferences`,
        { wallpaper: nextWallpaper },
        'PATCH',
      );
      setConversation((prev) => (prev ? { ...prev, wallpaper: res.preferences.wallpaper, pushMuted: res.preferences.pushMuted } : prev));
    } catch {
      setConversation(conversation);
    } finally {
      setAppearanceBusy(false);
    }
  }

  async function toggleBlock() {
    if (!conversation?.other || blockBusy) return;
    setBlockBusy(true);

    try {
      if (conversation.blockedByMe) {
        await apiJson(`/api/users/${conversation.other.handle}/block`, {}, 'DELETE');
        setConversation({ ...conversation, blockedByMe: false });
        setError(null);
      } else {
        await apiJson(`/api/users/${conversation.other.handle}/block`, {});
        setConversation({ ...conversation, blockedByMe: true });
        setError('You blocked this contact. Messaging is disabled until you unblock them.');
      }
    } catch {
      setError('Could not update block state.');
    } finally {
      setBlockBusy(false);
    }
  }

  async function submitReport() {
    if (reportBusy || !reportReason.trim()) return;
    setReportBusy(true);
    setReportMessage(null);

    try {
      await apiJson(`/api/conversations/${params.id}/report`, {
        reason: reportReason,
        details: reportDetails,
      });
      setReportOpen(false);
      setReportDetails('');
      setReportMessage('Report submitted. Thanks for helping keep chats safe.');
    } catch {
      setReportMessage('Could not submit report.');
    } finally {
      setReportBusy(false);
    }
  }

  const other = conversation?.other || messages.find((message) => message.senderId !== meId)?.sender || null;
  const composerDisabled = Boolean(conversation?.blockedByMe || conversation?.hasBlockedMe);

  return (
    <div className={`absolute inset-x-0 top-0 bottom-[calc(60px+env(safe-area-inset-bottom,0px))] z-10 overflow-hidden rounded-none bg-gradient-to-br ${wallpaper.shell} md:static md:h-[calc(100vh-8rem)] md:rounded-[32px] md:border md:border-white/50 md:shadow-[0_24px_80px_rgba(15,23,42,0.12)] dark:md:border-white/10`}>
      <div className={`pointer-events-none absolute inset-0 ${wallpaper.overlay}`} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.24)_0%,transparent_28%,transparent_72%,rgba(255,255,255,0.18)_100%)] dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.05)_0%,transparent_28%,transparent_72%,rgba(255,255,255,0.03)_100%)]" />

      <div className="relative flex h-full flex-col gap-3 p-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] md:p-4">
        <header className="rounded-[28px] border border-white/60 bg-white/70 p-3 shadow-lg shadow-slate-900/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/55 dark:shadow-black/20">
          <div className="flex items-start gap-3">
            <Link href="/chat" className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-slate-500 shadow-sm transition-colors hover:text-slate-900 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:text-white">
              <ArrowLeft className="h-4 w-4" />
            </Link>

            <div className="min-w-0 flex-1">
              {other ? (
                <Link href={`/u/${other.handle}`} className="flex min-w-0 items-center gap-3">
                  <img src={avatarFor(other)} alt="" className="h-11 w-11 rounded-2xl object-cover ring-2 ring-white/70 dark:ring-slate-900/70" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-900 dark:text-white">{other.displayName}</div>
                    <div className={`truncate text-xs ${typingName ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                      {statusLabel(conversation, typingName)}
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="text-sm font-semibold text-slate-500">Preparing chat...</div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {conversation && (
                <button
                  type="button"
                  onClick={toggleMute}
                  disabled={muteBusy}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:text-white"
                >
                  {conversation.pushMuted ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                  <span>{conversation.pushMuted ? 'Unmute' : 'Mute'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setAppearanceOpen((value) => !value)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:text-white"
              >
                <Palette className="h-3.5 w-3.5" />
                <span>Style</span>
              </button>
            </div>
          </div>

          {appearanceOpen && (
            <div className="mt-3 space-y-3 rounded-3xl border border-white/60 bg-white/75 p-3 dark:border-white/10 dark:bg-slate-950/60">
              <div className="flex flex-wrap gap-2">
                {WALLPAPERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setWallpaper(item.id)}
                    disabled={appearanceBusy}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${conversation?.wallpaper === item.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white/80 text-slate-600 dark:bg-slate-900/70 dark:text-slate-300'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {other && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={toggleBlock}
                    disabled={blockBusy}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${conversation?.blockedByMe ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300'}`}
                  >
                    <ShieldBan className="h-3.5 w-3.5" />
                    <span>{conversation?.blockedByMe ? 'Unblock contact' : 'Block contact'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportOpen((value) => !value)}
                    className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                  >
                    <Flag className="h-3.5 w-3.5" />
                    <span>Report</span>
                  </button>
                </div>
              )}

              {reportOpen && (
                <div className="space-y-3 rounded-3xl border border-amber-200/70 bg-amber-50/80 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">Report conversation</div>
                  <select
                    value={reportReason}
                    onChange={(event) => setReportReason(event.target.value)}
                    className="w-full rounded-2xl border border-amber-200/80 bg-white px-3 py-2 text-sm dark:border-amber-900/40 dark:bg-slate-950"
                  >
                    {REPORT_REASONS.map((reason) => (
                      <option key={reason} value={reason}>{reason}</option>
                    ))}
                  </select>
                  <textarea
                    value={reportDetails}
                    onChange={(event) => setReportDetails(event.target.value.slice(0, 500))}
                    rows={3}
                    placeholder="Share any context that helps moderation review this faster."
                    className="w-full rounded-2xl border border-amber-200/80 bg-white px-3 py-2 text-sm dark:border-amber-900/40 dark:bg-slate-950"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-amber-700/80 dark:text-amber-300/70">{reportDetails.length}/500</div>
                    <button
                      type="button"
                      onClick={submitReport}
                      disabled={reportBusy}
                      className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>{reportBusy ? 'Submitting...' : 'Submit report'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </header>

        {reportMessage && (
          <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/85 px-4 py-3 text-sm text-emerald-700 shadow-sm dark:border-emerald-900/30 dark:bg-emerald-950/25 dark:text-emerald-300">
            {reportMessage}
          </div>
        )}

        <div ref={scrollRef} className={`relative flex-1 overflow-y-auto rounded-[32px] border border-white/50 ${wallpaper.bubble} p-4 shadow-inner backdrop-blur-sm dark:border-white/10`}>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent,rgba(255,255,255,0.14))] dark:bg-[linear-gradient(transparent,rgba(255,255,255,0.02))]" />
          <div className="relative flex min-h-full flex-col gap-3">
            {loading && (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading messages...</div>
            )}

            {!loading && messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-slate-500">
                <div className="mb-4 rounded-full bg-white/70 p-5 shadow-sm dark:bg-slate-900/60">
                  <MessageSquare className="h-10 w-10 opacity-40" />
                </div>
                <p className="text-sm font-medium">No messages yet. Drop the first emoji wave.</p>
              </div>
            )}

            {messages.map((message, index) => {
              const currentUserId = (session as any)?.userId || (session as any)?.user?.id || (session as any)?.sub;
              const isMe = !!(currentUserId && message.sender.id === currentUserId);
              const previous = messages[index - 1];
              const next = messages[index + 1];
              const startsGroup = !previous || previous.sender.id !== message.sender.id || formatDay(previous.createdAt) !== formatDay(message.createdAt);
              const endsGroup = !next || next.sender.id !== message.sender.id;
              const showDay = !previous || formatDay(previous.createdAt) !== formatDay(message.createdAt);
              const isLastOwnMessage = lastOwnMessage?.id === message.id;

              return (
                <div key={message.id} className="space-y-2">
                  {showDay && (
                    <div className="flex justify-center">
                      <div className="rounded-full bg-white/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-sm dark:bg-slate-900/65 dark:text-slate-400">
                        {formatDay(message.createdAt)}
                      </div>
                    </div>
                  )}

                  <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex max-w-[88%] items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                      {!isMe && (
                        <div className="w-9 shrink-0">
                          {startsGroup ? (
                            <Link href={`/u/${message.sender.handle}`}>
                              <img src={avatarFor(message.sender)} alt="" className="h-9 w-9 rounded-2xl object-cover ring-2 ring-white/70 dark:ring-slate-900/70" />
                            </Link>
                          ) : (
                            <div className="w-9" />
                          )}
                        </div>
                      )}

                      <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        {!isMe && startsGroup && (
                          <span className="mb-1 ml-2 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500/80">
                            {message.sender.displayName}
                          </span>
                        )}

                        <div
                          className={`rounded-[24px] px-4 py-3 text-[15px] leading-relaxed shadow-sm ${
                            isMe
                              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                              : 'border border-white/60 bg-white/86 text-slate-900 dark:border-white/10 dark:bg-slate-900/78 dark:text-slate-100'
                          } ${isMe ? (endsGroup ? 'rounded-br-md' : 'rounded-br-2xl') : endsGroup ? 'rounded-bl-md' : 'rounded-bl-2xl'}`}
                        >
                          <div>{message.body}</div>
                          <div className={`mt-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] ${isMe ? 'justify-end text-white/60 dark:text-slate-500' : 'justify-start text-slate-500 dark:text-slate-400'}`}>
                            <span>{formatTime(message.createdAt)}</span>
                            {isMe && isLastOwnMessage && (
                              <span>{otherSeenLatestOwnMessage ? 'Seen' : 'Delivered'}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {typingName && !composerDisabled && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm dark:border-white/10 dark:bg-slate-900/75 dark:text-slate-300">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:0.3s]" />
                  </span>
                  <span>{typingName} is typing…</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200/70 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-sm dark:border-rose-900/30 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="rounded-[28px] border border-white/60 bg-white/78 p-2 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/72">
          {composerDisabled && (
            <div className="mb-2 rounded-2xl bg-slate-100/80 px-4 py-3 text-sm text-slate-600 dark:bg-slate-900/80 dark:text-slate-300">
              {conversation?.blockedByMe
                ? 'You blocked this contact. Unblock them to start chatting again.'
                : 'This contact blocked you. You can still view the thread, but sending is disabled.'}
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setPickerOpen((value) => !value)}
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                aria-label="Emoji picker"
              >
                <Smile className="h-5 w-5" />
              </button>
              {pickerOpen && (
                <div className="absolute bottom-full left-0 z-50 mb-2">
                  <EmojiPicker onPick={(emoji) => { setDraft((value) => (value + emoji).slice(0, 500)); setPickerOpen(false); }} />
                </div>
              )}
            </div>

            <div className="flex-1 rounded-[26px] bg-slate-100/80 px-4 py-2 dark:bg-slate-800/80">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value.slice(0, 500))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={composerDisabled ? 'Messaging unavailable' : 'Send a mood in emoji only…'}
                rows={1}
                disabled={composerDisabled}
                className="max-h-32 min-h-[28px] w-full resize-none bg-transparent text-[15px] leading-6 text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed dark:text-slate-100"
              />
            </div>

            <button
              type="button"
              onClick={() => void send()}
              disabled={!draft.trim() || sending || composerDisabled}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.02] disabled:pointer-events-none disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              <span>{sending ? 'Sending...' : 'Send'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
