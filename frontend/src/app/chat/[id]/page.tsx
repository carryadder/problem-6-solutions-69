'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import { api, apiJson, apiUpload } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { avatarFor } from '@/lib/avatar';
import EmojiPicker from '@/components/EmojiPicker';
import {
  ArrowLeft,
  Bell,
  BellOff,
  CheckSquare2,
  Forward,
  ImageIcon,
  ImagePlus,
  MessageSquare,
  Mic,
  MicOff,
  MoreHorizontal,
  Palette,
  Pin,
  Reply,
  Search,
  Send,
  ShieldAlert,
  ShieldBan,
  Smile,
  SquarePen,
  Star,
  Trash2,
  X,
  Flag,
} from 'lucide-react';

type Sender = { id: string; handle: string; displayName: string; profilePicture: string | null };
type MessageReaction = { userId: string; emoji: string; createdAt: string };
type MessagePreview = {
  id: string;
  body: string;
  audioUrl: string | null;
  imageUrl: string | null;
  editedAt: string | null;
  deletedForEveryoneAt: string | null;
  sender: Sender;
};
type MessageT = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  audioUrl: string | null;
  imageUrl: string | null;
  editedAt: string | null;
  deletedForEveryoneAt: string | null;
  createdAt: string;
  sender: Sender;
  replyTo: MessagePreview | null;
  forwardedFromMessage: MessagePreview | null;
  reactions: MessageReaction[];
  starredByMe: boolean;
};
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
  pinnedMessage: MessagePreview | null;
};
type ConversationListItem = {
  id: string;
  other: Sender;
  lastMessage: { body: string; audioUrl?: string | null; imageUrl?: string | null } | null;
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

function formatMessageCount(count: number) {
  return `${count} message${count === 1 ? '' : 's'}`;
}

function formatMediaCount(count: number) {
  return `${count} shared item${count === 1 ? '' : 's'}`;
}

const REACTION_CHOICES = ['\u2764\uFE0F', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F64F}', '\u{1F525}'];

function statusLabel(conversation: ConversationT | null, typingName: string | null) {
  if (!conversation) return 'Loading conversation';
  if (conversation.hasBlockedMe) return 'This contact blocked you';
  if (conversation.blockedByMe) return 'You blocked this contact';
  if (typingName) return `${typingName} is typing...`;
  if (conversation.pushMuted) return 'Push notifications muted';
  return 'Private end-to-end vibe';
}

function messageSnippet(message: MessagePreview | MessageT | null) {
  if (!message) return '';
  if (message.deletedForEveryoneAt) return 'Deleted message';
  if (message.imageUrl) return 'Photo';
  if (message.audioUrl) return 'Voice note';
  return message.body || 'Message';
}

function chatPreview(item: ConversationListItem) {
  if (!item.lastMessage) return 'No messages yet';
  if (item.lastMessage.imageUrl) return 'Photo';
  if (item.lastMessage.audioUrl) return 'Voice note';
  return item.lastMessage.body || 'Message';
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
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [typingName, setTypingName] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);
  const [replyTarget, setReplyTarget] = useState<MessageT | null>(null);
  const [editTarget, setEditTarget] = useState<MessageT | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [forwardSource, setForwardSource] = useState<MessageT | null>(null);
  const [forwardTargets, setForwardTargets] = useState<ConversationListItem[]>([]);
  const [forwardBusy, setForwardBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MessageT[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaItems, setMediaItems] = useState<MessageT[]>([]);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedTypingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const meId = (session as any)?.userId;

  const wallpaper = WALLPAPERS.find((item) => item.id === conversation?.wallpaper) || WALLPAPERS[0];
  const mediaCount = messages.filter((message) => Boolean(message.imageUrl || message.audioUrl)).length;

  const lastOwnMessage = useMemo(() => {
    const ownMessages = messages.filter((message) => message.senderId === meId);
    return ownMessages[ownMessages.length - 1] || null;
  }, [meId, messages]);

  const composerDisabled = Boolean(conversation?.blockedByMe || conversation?.hasBlockedMe);

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
    let onReactionUpdate: ((payload: { messageId: string; reactions: MessageReaction[] }) => void) | null = null;
    let onMessageUpdate: ((payload: { message: MessageT }) => void) | null = null;
    let onPinnedUpdate: ((payload: { pinnedMessage: MessagePreview | null }) => void) | null = null;

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

        onReactionUpdate = ({ messageId, reactions }: { messageId: string; reactions: MessageReaction[] }) => {
          setMessages((prev) =>
            prev.map((message) => (message.id === messageId ? { ...message, reactions } : message)),
          );
        };

        onMessageUpdate = ({ message }: { message: MessageT }) => {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === message.id
                ? {
                    ...message,
                    starredByMe: item.starredByMe,
                  }
                : item,
            ),
          );
        };

        onPinnedUpdate = ({ pinnedMessage }: { pinnedMessage: MessagePreview | null }) => {
          setConversation((prev) => (prev ? { ...prev, pinnedMessage } : prev));
        };

        socket.emit('conversation:join', params.id, (ack: { ok?: boolean; error?: string }) => {
          if (!ack?.ok && ack?.error === 'blocked') {
            setConversation((prev) => (prev ? { ...prev, hasBlockedMe: true } : prev));
            setError('This conversation is unavailable because one of you is blocked.');
          }
        });

        socket.on('message:new', onNewMessage);
        socket.on('typing:start', onTypingStart);
        socket.on('typing:stop', onTypingStop);
        socket.on('read:update', onReadUpdate);
        socket.on('message:reaction:update', onReactionUpdate);
        socket.on('message:update', onMessageUpdate);
        socket.on('conversation:pin', onPinnedUpdate);
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
        if (onReactionUpdate) activeSocket.off('message:reaction:update', onReactionUpdate);
        if (onMessageUpdate) activeSocket.off('message:update', onMessageUpdate);
        if (onPinnedUpdate) activeSocket.off('conversation:pin', onPinnedUpdate);
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
    if (!socketRef.current || composerDisabled) return;

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
  }, [composerDisabled, draft, params.id]);

  useEffect(() => {
    if (!forwardSource) return;
    setForwardTargets([]);
    api<{ conversations: ConversationListItem[] }>('/api/conversations')
      .then((response) => setForwardTargets(response.conversations.filter((item) => item.id !== params.id)))
      .catch(() => setForwardTargets([]));
  }, [forwardSource, params.id]);

  useEffect(() => {
    if (!searchOpen || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearchBusy(true);
    api<{ messages: MessageT[] }>(`/api/conversations/${params.id}/search?q=${encodeURIComponent(searchQuery)}`)
      .then((response) => {
        if (!cancelled) setSearchResults(response.messages);
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearchBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.id, searchOpen, searchQuery]);

  useEffect(() => {
    if (!mediaOpen) return;
    let cancelled = false;
    setMediaBusy(true);
    api<{ messages: MessageT[] }>(`/api/conversations/${params.id}/media`)
      .then((response) => {
        if (!cancelled) setMediaItems(response.messages);
      })
      .catch(() => {
        if (!cancelled) setMediaItems([]);
      })
      .finally(() => {
        if (!cancelled) setMediaBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mediaOpen, params.id]);

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function stopLocalRecording() {
    mediaRecorderRef.current?.stop();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    setIsRecording(false);
    setRecordingSeconds(0);
  }

  function jumpToMessage(messageId: string) {
    const element = document.querySelector(`[data-message-id="${messageId}"]`);
    if (element instanceof HTMLElement) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ring-2', 'ring-rose-400');
      window.setTimeout(() => element.classList.remove('ring-2', 'ring-rose-400'), 1200);
    }
  }

  function toggleSelected(messageId: string) {
    setSelectedIds((current) =>
      current.includes(messageId) ? current.filter((id) => id !== messageId) : [...current, messageId],
    );
  }

  function clearSelection() {
    setSelectionMode(false);
    setSelectedIds([]);
  }

  function clearHoldTimer() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function startHoldAction(messageId: string) {
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      if (selectionMode) {
        toggleSelected(messageId);
      } else {
        setActiveMessageId(messageId);
      }
      holdTimerRef.current = null;
    }, 420);
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending || composerDisabled) return;

    setSending(true);
    setError(null);

    if (editTarget) {
      try {
        const res = await apiJson<{ message: MessageT }>(
          `/api/conversations/${params.id}/messages/${editTarget.id}`,
          { body },
          'PATCH',
        );
        setMessages((prev) => prev.map((message) => (message.id === editTarget.id ? res.message : message)));
        setDraft('');
        setEditTarget(null);
      } catch {
        setError('Could not edit message.');
      } finally {
        setSending(false);
      }
      return;
    }

    socketRef.current?.emit('typing:stop', { conversationId: params.id });
    startedTypingRef.current = false;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);

    socketRef.current?.emit(
      'message:send',
      {
        conversationId: params.id,
        body,
        replyToId: replyTarget?.id || undefined,
      },
      (ack: any) => {
        setSending(false);
        if (!ack?.ok) {
          if (ack?.error === 'rate_limited') setError('Slow down a bit.');
          else if (ack?.error === 'blocked') setError('You cannot message this person because one of you is blocked.');
          else setError('Could not send.');
          return;
        }

        setDraft('');
        setTypingName(null);
        setReplyTarget(null);
      },
    );
  }

  async function applyBulkAction(action: 'star' | 'unstar' | 'delete_me') {
    if (selectedIds.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const res = await apiJson<{ ok: true; messageIds: string[]; action: 'star' | 'unstar' | 'delete_me' }>(
        `/api/conversations/${params.id}/messages/bulk`,
        { action, messageIds: selectedIds },
      );
      if (action === 'delete_me') {
        const deleted = new Set(res.messageIds);
        setMessages((prev) => prev.filter((message) => !deleted.has(message.id)));
      } else {
        const updated = new Set(res.messageIds);
        setMessages((prev) =>
          prev.map((message) =>
            updated.has(message.id)
              ? { ...message, starredByMe: action === 'star' }
              : message,
          ),
        );
      }
      clearSelection();
    } catch {
      setError('Could not apply bulk action.');
    } finally {
      setBulkBusy(false);
    }
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

  async function toggleReaction(messageId: string, emoji: string) {
    try {
      const res = await apiJson<{ reactions: MessageReaction[] }>(
        `/api/conversations/${params.id}/messages/${messageId}/reaction`,
        { emoji },
      );
      setMessages((prev) => prev.map((message) => (message.id === messageId ? { ...message, reactions: res.reactions } : message)));
    } catch {
      setError('Could not update reaction.');
    }
  }

  async function toggleStar(message: MessageT) {
    try {
      if (message.starredByMe) {
        await apiJson(`/api/conversations/${params.id}/messages/${message.id}/star`, {}, 'DELETE');
      } else {
        await apiJson(`/api/conversations/${params.id}/messages/${message.id}/star`, {});
      }
      setMessages((prev) => prev.map((item) => (item.id === message.id ? { ...item, starredByMe: !message.starredByMe } : item)));
    } catch {
      setError('Could not update star.');
    }
  }

  async function deleteMessage(message: MessageT, scope: 'me' | 'everyone') {
    try {
      await apiJson(`/api/conversations/${params.id}/messages/${message.id}/delete`, { scope });
      if (scope === 'me') {
        setMessages((prev) => prev.filter((item) => item.id !== message.id));
        if (replyTarget?.id === message.id) setReplyTarget(null);
      } else {
        setMessages((prev) =>
          prev.map((item) =>
            item.id === message.id
                ? {
                    ...item,
                    body: '',
                    audioUrl: null,
                    imageUrl: null,
                    replyTo: null,
                    forwardedFromMessage: null,
                    deletedForEveryoneAt: new Date().toISOString(),
                  reactions: [],
                }
              : item,
          ),
        );
        if (conversation?.pinnedMessage?.id === message.id) {
          setConversation((prev) => (prev ? { ...prev, pinnedMessage: null } : prev));
        }
      }
    } catch {
      setError('Could not delete message.');
    }
  }

  async function sendImage(file: File) {
    if (composerDisabled || voiceBusy) return;
    setVoiceBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('image', file);
      if (replyTarget) form.append('replyToId', replyTarget.id);
      await apiUpload(`/api/conversations/${params.id}/image`, form);
      setReplyTarget(null);
    } catch {
      setError('Could not send image.');
    } finally {
      setVoiceBusy(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  }

  async function startRecording() {
    if (isRecording || voiceBusy || composerDisabled) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice notes are not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size === 0) return;
        setVoiceBusy(true);
        setError(null);
        try {
          const form = new FormData();
          form.append('audio', blob, 'voice-note.webm');
          if (replyTarget) form.append('replyToId', replyTarget.id);
          await apiUpload(`/api/conversations/${params.id}/voice`, form);
          setReplyTarget(null);
        } catch {
          setError('Could not send voice note.');
        } finally {
          setVoiceBusy(false);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      recordingStreamRef.current = stream;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingSeconds((value) => value + 1);
      }, 1000);
    } catch {
      setError('Microphone access was denied.');
    }
  }

  async function forwardMessage(targetConversationId: string) {
    if (!forwardSource || forwardBusy) return;
    setForwardBusy(true);
    try {
      await apiJson(`/api/conversations/${targetConversationId}/forward`, { messageId: forwardSource.id });
      setForwardSource(null);
      setForwardTargets([]);
    } catch {
      setError('Could not forward message.');
    } finally {
      setForwardBusy(false);
    }
  }

  async function togglePinned(message: MessageT) {
    if (!conversation || pinBusy) return;
    setPinBusy(true);
    try {
      const nextMessageId = conversation.pinnedMessage?.id === message.id ? null : message.id;
      const res = await apiJson<{ pinnedMessage: MessagePreview | null }>(
        `/api/conversations/${params.id}/pin`,
        { messageId: nextMessageId },
        'PATCH',
      );
      setConversation({ ...conversation, pinnedMessage: res.pinnedMessage });
      setActiveMessageId(null);
    } catch {
      setError('Could not update pinned message.');
    } finally {
      setPinBusy(false);
    }
  }

  const other = conversation?.other || messages.find((message) => message.senderId !== meId)?.sender || null;

  return (
    <div className="absolute inset-x-0 top-0 bottom-[calc(60px+env(safe-area-inset-bottom,0px))] z-10 overflow-hidden rounded-none bg-[linear-gradient(135deg,#ffd7bf_0%,#f7c4d3_46%,#eccbff_100%)] md:static md:h-[calc(100vh-8rem)] md:rounded-[34px] md:border md:border-white/60 md:shadow-[0_28px_90px_rgba(244,114,182,0.18)] dark:md:border-white/10 dark:md:shadow-[0_28px_90px_rgba(15,23,42,0.45)]">
      <div className={`pointer-events-none absolute inset-0 ${wallpaper.overlay}`} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.24)_0%,transparent_28%,transparent_72%,rgba(255,255,255,0.18)_100%)] dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.05)_0%,transparent_28%,transparent_72%,rgba(255,255,255,0.03)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.38),transparent_62%)] dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.09),transparent_62%)]" />

      <div className="relative flex h-full flex-col gap-3 p-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] md:p-4">
        <header className="relative z-30 rounded-[30px] border border-white/75 bg-white/62 p-4 shadow-[0_18px_48px_rgba(255,255,255,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/58 dark:shadow-black/20">
          <div className="flex items-start gap-3">
            <Link href="/chat" className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-slate-500 shadow-sm transition-colors hover:text-slate-900 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:text-white">
              <ArrowLeft className="h-4 w-4" />
            </Link>

            <div className="min-w-0 flex-1">
              {other ? (
                <Link href={`/u/${other.handle}`} className="flex min-w-0 items-center gap-3">
                  <div className="relative shrink-0">
                    <img src={avatarFor(other)} alt="" className="h-11 w-11 rounded-2xl object-cover ring-2 ring-white/70 dark:ring-slate-900/70" />
                    <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400 dark:border-slate-950" />
                  </div>
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

            <div className="relative flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSettingsMenuOpen((value) => !value)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200/80 bg-white/88 text-slate-600 transition-colors hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-900/72 dark:text-slate-300 dark:hover:text-white"
                aria-label="Chat options"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>

              {settingsMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-2 shadow-2xl backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/95">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchOpen((value) => !value);
                      setSettingsMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    <Search className="h-4 w-4" />
                    Search chat
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMediaOpen(true);
                      setSettingsMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    <ImageIcon className="h-4 w-4" />
                    Shared media
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectionMode) clearSelection();
                      else setSelectionMode(true);
                      setSettingsMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    <CheckSquare2 className="h-4 w-4" />
                    {selectionMode ? 'Cancel selection' : 'Select messages'}
                  </button>
                  {conversation && (
                    <button
                      type="button"
                      onClick={() => {
                        void toggleMute();
                        setSettingsMenuOpen(false);
                      }}
                      disabled={muteBusy}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-900"
                    >
                      {conversation.pushMuted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                      {conversation.pushMuted ? 'Unmute notifications' : 'Mute notifications'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setAppearanceOpen((value) => !value);
                      setSettingsMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    <Palette className="h-4 w-4" />
                    Chat theme
                  </button>
                  {other && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          void toggleBlock();
                          setSettingsMenuOpen(false);
                        }}
                        disabled={blockBusy}
                        className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-900"
                      >
                        <ShieldBan className="h-4 w-4" />
                        {conversation?.blockedByMe ? 'Unblock user' : 'Block user'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReportOpen((value) => !value);
                          setSettingsMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30"
                      >
                        <Flag className="h-4 w-4" />
                        Report user
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/78 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-900/72 dark:text-slate-300">
              <MessageSquare className="h-3.5 w-3.5" />
              {formatMessageCount(messages.length)}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/78 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-900/72 dark:text-slate-300">
              <ImageIcon className="h-3.5 w-3.5" />
              {formatMediaCount(mediaCount)}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/78 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-900/72 dark:text-slate-300">
              <Palette className="h-3.5 w-3.5" />
              {wallpaper.label}
            </span>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold shadow-sm ${conversation?.pushMuted ? 'border-amber-200/80 bg-amber-50/80 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300' : 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300'}`}>
              {conversation?.pushMuted ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
              {conversation?.pushMuted ? 'Muted' : 'Live alerts'}
            </span>
          </div>

          {searchOpen && (
            <div className="mt-3 rounded-3xl border border-white/60 bg-white/75 p-3 shadow-inner dark:border-white/10 dark:bg-slate-950/60">
              <div className="flex items-center gap-2 rounded-2xl bg-slate-100/80 px-3 py-2 dark:bg-slate-900/80">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search this conversation"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </div>
              {searchQuery && (
                <div className="scrollbar-thin-soft mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                  {searchBusy && <div className="text-sm text-slate-500">Searching...</div>}
                  {!searchBusy && searchResults.length === 0 && <div className="text-sm text-slate-500">No matches found.</div>}
                  {searchResults.map((message) => (
                    <button
                      key={message.id}
                      type="button"
                      onClick={() => {
                        setSearchOpen(false);
                        setSearchQuery('');
                        jumpToMessage(message.id);
                      }}
                      className="block w-full rounded-2xl bg-slate-100/80 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-200 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                      <div className="truncate font-semibold text-slate-900 dark:text-white">{message.sender.displayName}</div>
                      <div className="truncate">{messageSnippet(message)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {conversation?.pinnedMessage && (
            <button
              type="button"
              onClick={() => jumpToMessage(conversation.pinnedMessage!.id)}
              className="mt-3 flex w-full items-center gap-3 rounded-3xl border border-white/60 bg-white/75 px-4 py-3 text-left shadow-sm dark:border-white/10 dark:bg-slate-950/60"
            >
              <Pin className="h-4 w-4 text-rose-500" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Pinned message</div>
                <div className="truncate text-sm text-slate-700 dark:text-slate-300">{messageSnippet(conversation.pinnedMessage)}</div>
              </div>
            </button>
          )}

          {appearanceOpen && (
            <div className="mt-3 space-y-3 rounded-3xl border border-white/60 bg-white/75 p-3 dark:border-white/10 dark:bg-slate-950/60">
              <div className="grid gap-2 sm:grid-cols-2">
                {WALLPAPERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setWallpaper(item.id)}
                    disabled={appearanceBusy}
                    className={`rounded-[22px] border px-3 py-3 text-left text-xs font-semibold transition-colors ${conversation?.wallpaper === item.id ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-white/70 bg-white/80 text-slate-600 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300'}`}
                  >
                    <span className={`mb-2 block h-10 rounded-2xl bg-gradient-to-br ${item.shell}`} />
                    <span className="block">{item.label}</span>
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

        {selectionMode && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/60 bg-white/75 px-4 py-3 text-sm shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/60">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedIds.length} selected</span>
            <button type="button" onClick={() => void applyBulkAction('star')} disabled={bulkBusy || selectedIds.length === 0} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm disabled:opacity-50 dark:bg-slate-900 dark:text-slate-200">Star</button>
            <button type="button" onClick={() => void applyBulkAction('unstar')} disabled={bulkBusy || selectedIds.length === 0} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm disabled:opacity-50 dark:bg-slate-900 dark:text-slate-200">Unstar</button>
            <button type="button" onClick={() => void applyBulkAction('delete_me')} disabled={bulkBusy || selectedIds.length === 0} className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 shadow-sm disabled:opacity-50 dark:bg-rose-950/40 dark:text-rose-300">Delete for me</button>
          </div>
        )}

        <div ref={scrollRef} className={`scrollbar-thin-soft relative flex-1 overflow-y-auto rounded-[34px] border border-white/55 bg-gradient-to-br ${wallpaper.shell} p-4 shadow-inner dark:border-white/10`}>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.2),rgba(255,255,255,0.08))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]" />
          <div className="relative flex min-h-full flex-col gap-3">
            {loading && (
              <div className="flex h-full items-center justify-center">
                <div className="rounded-[28px] border border-white/60 bg-white/75 px-5 py-4 text-sm font-medium text-slate-500 shadow-sm dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-300">
                  Loading messages...
                </div>
              </div>
            )}

            {!loading && messages.length === 0 && (
              <div className="mx-auto flex h-full w-full max-w-md flex-col items-center justify-center rounded-[32px] border border-dashed border-white/70 bg-white/40 px-6 py-10 text-center text-slate-500 dark:border-white/10 dark:bg-slate-950/35 dark:text-slate-300">
                <div className="mb-4 rounded-full bg-white/70 p-5 shadow-sm dark:bg-slate-900/60">
                  <MessageSquare className="h-10 w-10 opacity-40" />
                </div>
                <p className="text-base font-semibold text-slate-700 dark:text-slate-100">No messages yet</p>
                <p className="mt-2 text-sm">Break the silence with a quick hello, a photo, or an emoji wave.</p>
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
              const ownMessageSeen = Boolean(
                isMe &&
                  conversation?.otherLastReadAt &&
                  new Date(conversation.otherLastReadAt).getTime() >= new Date(message.createdAt).getTime(),
              );
              const reactionCounts = message.reactions.reduce<Record<string, number>>((acc, reaction) => {
                acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
                return acc;
              }, {});

              return (
                <div key={message.id} data-message-id={message.id} className="space-y-2 rounded-3xl transition-shadow">
                  {showDay && (
                    <div className="flex justify-center">
                      <div className="rounded-full bg-white/82 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 shadow-sm dark:bg-slate-900/65 dark:text-slate-400">
                        {formatDay(message.createdAt)}
                      </div>
                    </div>
                  )}

                  <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex max-w-[92%] items-end gap-2 sm:max-w-[74%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
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
                        <div className={`flex items-start gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                          <button
                            type="button"
                            onPointerDown={() => {
                              if (!selectionMode) startHoldAction(message.id);
                            }}
                            onPointerUp={clearHoldTimer}
                            onPointerLeave={clearHoldTimer}
                            onPointerCancel={clearHoldTimer}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              if (selectionMode) toggleSelected(message.id);
                              else setActiveMessageId((value) => (value === message.id ? null : message.id));
                            }}
                            onClick={() => {
                              if (selectionMode) toggleSelected(message.id);
                            }}
                            className={`group relative overflow-hidden rounded-[28px] px-5 py-4 text-left text-[15px] leading-relaxed shadow-[0_16px_40px_rgba(15,23,42,0.09)] ${
                              isMe
                                ? 'bg-[linear-gradient(180deg,#27334a_0%,#1f293d_100%)] text-white dark:bg-[linear-gradient(180deg,#f8fafc_0%,#e2e8f0_100%)] dark:text-slate-900'
                                : 'border border-white/70 bg-white/58 text-slate-900 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-100'
                            } ${isMe ? (endsGroup ? 'rounded-br-md' : 'rounded-br-2xl') : endsGroup ? 'rounded-bl-md' : 'rounded-bl-2xl'} ${selectionMode && selectedIds.includes(message.id) ? 'ring-2 ring-rose-400' : ''}`}
                          >
                          <span className={`pointer-events-none absolute inset-x-0 top-0 h-px ${isMe ? 'bg-white/30 dark:bg-slate-400/30' : 'bg-white/90 dark:bg-white/10'}`} />
                          {selectionMode && (
                            <span className="absolute left-3 top-3 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-900/80 dark:text-slate-200">
                              {selectedIds.includes(message.id) ? 'Selected' : 'Tap'}
                            </span>
                          )}
                          {message.starredByMe && (
                            <span className={`absolute right-3 top-3 ${isMe ? 'text-amber-300 dark:text-amber-500' : 'text-amber-500'}`}>
                              <Star className="h-3.5 w-3.5 fill-current" />
                            </span>
                          )}
                          {message.forwardedFromMessage && (
                            <div className={`mb-2 rounded-2xl border px-3 py-2 text-xs ${isMe ? 'border-white/20 bg-white/10 text-white/80 dark:border-slate-300/30 dark:bg-slate-900/10 dark:text-slate-600' : 'border-slate-200/80 bg-slate-100/70 text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300'}`}>
                              Forwarded from {message.forwardedFromMessage.sender.displayName}
                            </div>
                          )}
                          {message.replyTo && (
                            <div className={`mb-2 rounded-2xl border px-3 py-2 text-xs ${isMe ? 'border-white/20 bg-white/10 text-white/80 dark:border-slate-300/30 dark:bg-slate-900/10 dark:text-slate-600' : 'border-slate-200/80 bg-slate-100/70 text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300'}`}>
                              <div className="font-semibold">Replying to {message.replyTo.sender.displayName}</div>
                              <div className="truncate">{messageSnippet(message.replyTo)}</div>
                            </div>
                          )}
                          {message.deletedForEveryoneAt ? (
                            <div className="italic opacity-70">Message deleted</div>
                          ) : (
                            <>
                              {message.imageUrl && (
                                <img
                                  src={message.imageUrl}
                                  alt="Shared in chat"
                                  className="mb-2 max-h-80 w-full rounded-2xl object-cover"
                                />
                              )}
                              {message.body && <div className="whitespace-pre-wrap break-words">{message.body}</div>}
                              {message.audioUrl && (
                                <audio controls className="mt-1 w-full max-w-[260px]">
                                  <source src={message.audioUrl} />
                                </audio>
                              )}
                            </>
                          )}
                          <div className={`mt-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] ${isMe ? 'justify-end text-white/60 dark:text-slate-500' : 'justify-start text-slate-500 dark:text-slate-400'}`}>
                            <span>{formatTime(message.createdAt)}</span>
                            {message.editedAt && <span>Edited</span>}
                            {isMe && (
                              <span>{ownMessageSeen ? 'Seen' : isLastOwnMessage ? 'Delivered' : 'Sent'}</span>
                            )}
                          </div>
                          </button>

                          {!selectionMode && !message.deletedForEveryoneAt && (
                            <button
                              type="button"
                              onClick={() => setActiveMessageId((value) => (value === message.id ? null : message.id))}
                              className="mt-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/80 text-slate-400 shadow-sm transition-colors hover:bg-white hover:text-slate-700 dark:bg-slate-900/70 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200"
                              aria-label="Message options"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        {Object.keys(reactionCounts).length > 0 && (
                          <div className={`mt-1 flex flex-wrap gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                            {Object.entries(reactionCounts).map(([emoji, count]) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => void toggleReaction(message.id, emoji)}
                                className="rounded-full border border-white/70 bg-white/80 px-2 py-1 text-xs shadow-sm dark:border-white/10 dark:bg-slate-900/70"
                              >
                                {emoji} {count}
                              </button>
                            ))}
                          </div>
                        )}

                        {activeMessageId === message.id && !selectionMode && !composerDisabled && !message.deletedForEveryoneAt && (
                          <div className={`mt-2 flex flex-wrap gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className="flex rounded-full bg-white/80 p-1 shadow-sm dark:bg-slate-900/75">
                              {REACTION_CHOICES.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => void toggleReaction(message.id, emoji)}
                                  className="rounded-full px-2 py-1 text-base hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                            <button type="button" onClick={() => { setReplyTarget(message); setActiveMessageId(null); }} className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm dark:bg-slate-900/75 dark:text-slate-300"><Reply className="h-3.5 w-3.5" />Reply</button>
                            <button type="button" onClick={() => { setForwardSource(message); setActiveMessageId(null); }} className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm dark:bg-slate-900/75 dark:text-slate-300"><Forward className="h-3.5 w-3.5" />Forward</button>
                            {isMe && !message.audioUrl && (
                              <button type="button" onClick={() => { setEditTarget(message); setReplyTarget(null); setDraft(message.body); setActiveMessageId(null); }} className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm dark:bg-slate-900/75 dark:text-slate-300"><SquarePen className="h-3.5 w-3.5" />Edit</button>
                            )}
                            <button type="button" onClick={() => void toggleStar(message)} className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm dark:bg-slate-900/75 dark:text-slate-300"><Star className={`h-3.5 w-3.5 ${message.starredByMe ? 'fill-current text-amber-500' : ''}`} />{message.starredByMe ? 'Unstar' : 'Star'}</button>
                            <button type="button" onClick={() => void togglePinned(message)} className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm dark:bg-slate-900/75 dark:text-slate-300"><Pin className="h-3.5 w-3.5" />{conversation?.pinnedMessage?.id === message.id ? 'Unpin' : 'Pin'}</button>
                            <button type="button" onClick={() => void deleteMessage(message, 'me')} className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm dark:bg-slate-900/75 dark:text-slate-300"><Trash2 className="h-3.5 w-3.5" />Delete for me</button>
                            {isMe && (
                              <button type="button" onClick={() => void deleteMessage(message, 'everyone')} className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 shadow-sm dark:bg-rose-950/40 dark:text-rose-300"><Trash2 className="h-3.5 w-3.5" />Delete for everyone</button>
                            )}
                          </div>
                        )}
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
                  <span>{typingName} is typing...</span>
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
          {editTarget && (
            <div className="mb-2 flex items-start justify-between rounded-2xl bg-amber-50/90 px-4 py-3 text-sm dark:bg-amber-950/25">
              <div>
                <div className="font-semibold text-amber-700 dark:text-amber-300">Editing message</div>
                <div className="text-amber-700/80 dark:text-amber-300/80">{messageSnippet(editTarget)}</div>
              </div>
              <button type="button" onClick={() => { setEditTarget(null); setDraft(''); }} className="text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"><X className="h-4 w-4" /></button>
            </div>
          )}
          {replyTarget && (
            <div className="mb-2 flex items-start justify-between rounded-2xl bg-slate-100/80 px-4 py-3 text-sm dark:bg-slate-900/80">
              <div>
                <div className="font-semibold text-slate-700 dark:text-slate-200">Replying to {replyTarget.sender.displayName}</div>
                <div className="text-slate-500 dark:text-slate-400">{messageSnippet(replyTarget)}</div>
              </div>
              <button type="button" onClick={() => setReplyTarget(null)} className="text-slate-500 hover:text-slate-900 dark:hover:text-white"><X className="h-4 w-4" /></button>
            </div>
          )}

          {composerDisabled && (
            <div className="mb-2 rounded-2xl bg-slate-100/80 px-4 py-3 text-sm text-slate-600 dark:bg-slate-900/80 dark:text-slate-300">
              {conversation?.blockedByMe
                ? 'You blocked this contact. Unblock them to start chatting again.'
                : 'This contact blocked you. You can still view the thread, but sending is disabled.'}
            </div>
          )}

          {isRecording && (
            <div className="mb-2 flex items-center justify-between rounded-2xl bg-rose-50/90 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                Recording voice note {recordingSeconds}s
              </div>
              <button type="button" onClick={stopLocalRecording} className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white"><MicOff className="h-3.5 w-3.5" />Stop</button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] sm:items-end">
            <div className="order-2 flex items-center gap-2 sm:order-1 sm:col-span-3">
              <div className="relative">
                <button type="button" onClick={() => setPickerOpen((value) => !value)} className="inline-flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/75 bg-white/82 text-slate-500 shadow-sm transition-colors hover:bg-white hover:text-slate-700 dark:border-white/10 dark:bg-slate-900/72 dark:text-slate-300 dark:hover:bg-slate-900" aria-label="Emoji picker"><Smile className="h-5 w-5" /></button>
                {pickerOpen && (
                  <div className="absolute bottom-full left-0 z-50 mb-2">
                    <EmojiPicker onPick={(emoji) => { setDraft((value) => (value + emoji).slice(0, 500)); setPickerOpen(false); }} />
                  </div>
                )}
              </div>

              <div>
                <button type="button" onClick={() => imageInputRef.current?.click()} disabled={voiceBusy || composerDisabled} className="inline-flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/75 bg-white/82 text-slate-500 shadow-sm transition-colors hover:bg-white hover:text-slate-700 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900/72 dark:text-slate-300 dark:hover:bg-slate-900" aria-label="Send image"><ImagePlus className="h-5 w-5" /></button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void sendImage(file);
                  }}
                />
              </div>

              <button type="button" onClick={() => void startRecording()} disabled={voiceBusy || composerDisabled || isRecording} className="inline-flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/75 bg-white/82 text-slate-500 shadow-sm transition-colors hover:bg-white hover:text-slate-700 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900/72 dark:text-slate-300 dark:hover:bg-slate-900" aria-label="Record voice note"><Mic className="h-5 w-5" /></button>
            </div>

            <div className="order-1 min-w-0 rounded-[30px] border border-white/80 bg-white/72 px-5 py-4 shadow-inner backdrop-blur-md sm:order-2 sm:col-span-1 dark:border-white/10 dark:bg-slate-900/62">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value.slice(0, 500))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={composerDisabled ? 'Messaging unavailable' : 'Type a message...'}
                rows={3}
                disabled={composerDisabled}
                className="max-h-36 min-h-[88px] w-full resize-none bg-transparent text-[15px] leading-6 text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed dark:text-slate-100"
              />
              <div className="mt-3 flex items-end justify-between gap-3 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                <span className="max-w-[18rem]">{composerDisabled ? 'Messaging is paused for this chat.' : 'Enter sends. Shift+Enter adds a new line.'}</span>
                <span className="shrink-0">{draft.length}/500</span>
              </div>
            </div>

            <button type="button" onClick={() => void send()} disabled={!draft.trim() || sending || composerDisabled} className="order-3 inline-flex h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-[linear-gradient(180deg,#7e6d84_0%,#6f6278_100%)] px-6 text-sm font-bold text-white shadow-[0_14px_30px_rgba(111,98,120,0.32)] transition-transform hover:scale-[1.01] disabled:pointer-events-none disabled:opacity-50 sm:w-auto dark:bg-[linear-gradient(180deg,#f8fafc_0%,#e2e8f0_100%)] dark:text-slate-900"><Send className="h-4 w-4" /><span>{editTarget ? 'Save message' : 'Send message'}</span></button>
          </div>
        </div>
      </div>

      {mediaOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-white/20 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">Shared media</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Voice notes and chat media in this conversation.</div>
              </div>
              <button type="button" onClick={() => setMediaOpen(false)} className="text-slate-500 hover:text-slate-900 dark:hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <div className="scrollbar-thin-soft max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              {mediaBusy && <div className="text-sm text-slate-500">Loading shared media...</div>}
              {!mediaBusy && mediaItems.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
                  No shared media yet.
                </div>
              )}
              {mediaItems.map((item) => (
                <div key={item.id} className="rounded-3xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="mb-3 flex items-center gap-3">
                    <img src={avatarFor(item.sender)} alt="" className="h-10 w-10 rounded-2xl object-cover" />
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">{item.sender.displayName}</div>
                      <div className="text-xs text-slate-500">{formatDay(item.createdAt)} at {formatTime(item.createdAt)}</div>
                    </div>
                  </div>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="Shared in chat" className="max-h-[28rem] w-full rounded-2xl object-cover" />
                  ) : item.audioUrl ? (
                    <audio controls className="w-full">
                      <source src={item.audioUrl} />
                    </audio>
                  ) : (
                    <div className="text-sm text-slate-500">{messageSnippet(item)}</div>
                  )}
                  <div className="mt-3 flex justify-end">
                    <button type="button" onClick={() => { setMediaOpen(false); jumpToMessage(item.id); }} className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-slate-900">
                      Jump to message
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {forwardSource && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-white/20 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">Forward message</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Pick a chat to forward this message.</div>
              </div>
              <button type="button" onClick={() => { setForwardSource(null); setForwardTargets([]); }} className="text-slate-500 hover:text-slate-900 dark:hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <div className="mb-4 rounded-2xl bg-slate-100/80 px-4 py-3 text-sm text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
              {messageSnippet(forwardSource)}
            </div>

            <div className="scrollbar-thin-soft max-h-72 space-y-2 overflow-y-auto pr-1">
              {forwardTargets.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void forwardMessage(item.id)}
                  disabled={forwardBusy}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200/70 px-3 py-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/70"
                >
                  <img src={avatarFor(item.other)} alt="" className="h-11 w-11 rounded-2xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-900 dark:text-white">{item.other.displayName}</div>
                    <div className="truncate text-sm text-slate-500 dark:text-slate-400">{chatPreview(item)}</div>
                  </div>
                </button>
              ))}
              {forwardTargets.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
                  No other conversations yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
