'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { api, apiJson } from '@/lib/api';
import { avatarFor } from '@/lib/avatar';
import { getSocket } from '@/lib/socket';
import { Archive, ArchiveRestore, BellOff, Briefcase, ChevronRight, MessageCircle, Star, Users } from 'lucide-react';
import Loader from '@/components/Loader';

type ConvT = {
  id: string;
  other: { id: string; handle: string; displayName: string; profilePicture: string | null };
  lastMessage: { body: string; audioUrl?: string | null; imageUrl?: string | null; createdAt: string; senderId?: string } | null;
  lastReadAt: string | null;
  otherLastReadAt: string | null;
  pushMuted: boolean;
  wallpaper: 'aurora' | 'midnight' | 'sunset' | 'mint' | 'graphite';
  archivedAt: string | null;
  folder: 'inbox' | 'friends' | 'work' | 'saved';
  unreadCount: number;
};

function chatPreview(conversation: ConvT, meId?: string) {
  if (!conversation.lastMessage) return 'No messages yet';
  const prefix = conversation.lastMessage.senderId && meId && conversation.lastMessage.senderId === meId ? 'You: ' : '';
  if (conversation.lastMessage.imageUrl) return 'Photo';
  if (conversation.lastMessage.audioUrl) return `${prefix}Voice note`;
  return `${prefix}${conversation.lastMessage.body || 'Message'}`;
}

function formatRelative(iso: string | null | undefined) {
  if (!iso) return '';
  const date = new Date(iso);
  const diffHours = (Date.now() - date.getTime()) / 36e5;
  if (diffHours < 24) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diffHours < 24 * 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const FOLDERS: Array<{ id: ConvT['folder']; label: string; icon: typeof Users }> = [
  { id: 'inbox', label: 'Inbox', icon: MessageCircle },
  { id: 'friends', label: 'Friends', icon: Users },
  { id: 'work', label: 'Work', icon: Briefcase },
  { id: 'saved', label: 'Saved', icon: Star },
];

import { motion } from 'framer-motion';

export default function ChatListPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const [convs, setConvs] = useState<ConvT[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [folderFilter, setFolderFilter] = useState<ConvT['folder']>('inbox');
  const [typingByConversation, setTypingByConversation] = useState<Record<string, string>>({});

  const meId = (session as any)?.userId;

  async function refreshConversations() {
    const res = await api<{ conversations: ConvT[] }>('/api/conversations');
    setConvs(res.conversations);
  }

  async function updateConversation(id: string, patch: { archived?: boolean; folder?: ConvT['folder'] }) {
    const previous = convs;
    setConvs((current) =>
      current.map((conversation) =>
        conversation.id === id
          ? {
              ...conversation,
              ...(patch.archived !== undefined
                ? { archivedAt: patch.archived ? new Date().toISOString() : null }
                : {}),
              ...(patch.folder ? { folder: patch.folder } : {}),
            }
          : conversation,
      ),
    );

    try {
      const response = await apiJson<{ preferences: { archivedAt: string | null; folder: ConvT['folder'] } }>(
        `/api/conversations/${id}/preferences`,
        {
          ...(patch.archived !== undefined ? { archived: patch.archived } : {}),
          ...(patch.folder ? { folder: patch.folder } : {}),
        },
        'PATCH',
      );
      setConvs((current) =>
        current.map((conversation) =>
          conversation.id === id
            ? { ...conversation, archivedAt: response.preferences.archivedAt, folder: response.preferences.folder }
            : conversation,
        ),
      );
    } catch {
      setConvs(previous);
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
    if (status === 'authenticated') {
      refreshConversations();
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let active = true;
    let cleanup: (() => void) | undefined;

    getSocket()
      .then((socket) => {
        if (!active) return;

        const onConversationUpdate = () => {
          refreshConversations().catch(() => {});
        };

        const onTyping = ({ conversationId, displayName, isTyping }: { conversationId: string; displayName: string; isTyping: boolean }) => {
          setTypingByConversation((current) => {
            if (!isTyping) {
              const next = { ...current };
              delete next[conversationId];
              return next;
            }
            return { ...current, [conversationId]: displayName };
          });
        };

        socket.on('conversation:update', onConversationUpdate);
        socket.on('conversation:typing', onTyping);
        cleanup = () => {
          socket.off('conversation:update', onConversationUpdate);
          socket.off('conversation:typing', onTyping);
        };
      })
      .catch(() => {});

    return () => {
      active = false;
      cleanup?.();
    };
  }, [status]);

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader size="md" className="text-slate-400" />
      </div>
    );
  }

  const filteredConversations = convs.filter((conversation) => {
    const archived = Boolean(conversation.archivedAt);
    if (showArchived !== archived) return false;
    return conversation.folder === folderFilter;
  });

  return (
    <div className="space-y-5">
      <motion.div 
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-end justify-between gap-3"
      >
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-gradient-to-br from-fuchsia-500 via-rose-500 to-orange-400 text-white shadow-lg shadow-rose-500/30">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Messages</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Glide between your conversations.</p>
            </div>
          </div>
        </div>
        <div className="hidden rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/70 dark:text-slate-400 sm:block">
          {filteredConversations.length} visible
        </div>
      </motion.div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowArchived(false)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${!showArchived ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900' : 'bg-white/80 text-slate-600 shadow-sm backdrop-blur dark:bg-slate-900/80 dark:text-slate-300'}`}
        >
          Inbox
        </button>
        <button
          type="button"
          onClick={() => setShowArchived(true)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${showArchived ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900' : 'bg-white/80 text-slate-600 shadow-sm backdrop-blur dark:bg-slate-900/80 dark:text-slate-300'}`}
        >
          Archived
        </button>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {FOLDERS.map((folder) => {
          const Icon = folder.icon;
          const active = folderFilter === folder.id;
          return (
            <button
              key={folder.id}
              type="button"
              onClick={() => setFolderFilter(folder.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${active ? 'bg-gradient-to-r from-fuchsia-500 via-rose-500 to-orange-400 text-white shadow-lg shadow-rose-500/20' : 'bg-white/80 text-slate-600 shadow-sm backdrop-blur dark:bg-slate-900/80 dark:text-slate-300'}`}
            >
              <Icon className="h-4 w-4" />
              <span>{folder.label}</span>
            </button>
          );
        })}
      </div>

      {filteredConversations.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center rounded-[32px] border border-dashed border-slate-300/80 bg-white/65 p-10 text-center shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/30"
        >
          <MessageCircle className="mb-4 h-12 w-12 text-slate-300 dark:text-slate-600" />
          <h3 className="mb-2 text-lg font-bold text-slate-900 dark:text-slate-100">No conversations</h3>
          <p className="text-[15px] font-medium text-slate-500">{showArchived ? 'No archived chats in this folder yet.' : 'Open someone\'s profile and tap Message to start chatting.'}</p>
        </motion.div>
      ) : (
        <ul className="space-y-3">
          {filteredConversations.map((c, i) => (
            <motion.li 
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div className="group rounded-[30px] border border-slate-200/70 bg-white/80 px-4 py-4 shadow-soft backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800/70 dark:bg-slate-900/60">
                <div className="flex items-start gap-3">
                  <Link href={`/chat/${c.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                    <div className="rounded-full bg-gradient-to-br from-fuchsia-500 via-rose-500 to-orange-400 p-[2px] shadow-sm">
                      <img src={avatarFor(c.other)} alt="" className="h-12 w-12 rounded-full object-cover bg-white dark:bg-slate-950" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                      <div className="truncate text-[15px] font-bold text-slate-900 dark:text-slate-100">{c.other.displayName}</div>
                      {c.pushMuted && <BellOff className="h-4 w-4 text-slate-400" />}
                      <span className="truncate text-xs text-slate-400 dark:text-slate-500">{formatRelative(c.lastMessage?.createdAt)}</span>
                    </div>
                    <div className="mt-1 truncate text-[14px] font-medium text-slate-500">
                      {typingByConversation[c.id] ? (
                        <span className="text-emerald-600 dark:text-emerald-400">{typingByConversation[c.id]} is typing...</span>
                      ) : (
                        chatPreview(c, meId)
                      )}
                    </div>
                  </div>
                </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-end gap-2">
                      {c.unreadCount > 0 && (
                        <span className="rounded-full bg-gradient-to-r from-fuchsia-500 to-orange-400 px-2 py-1 text-[10px] font-bold text-white shadow-sm">
                          {c.unreadCount}
                        </span>
                      )}
                      <ChevronRight className="h-5 w-5 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-400" />
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800/70">
                  <span className="mr-auto rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {c.folder}
                  </span>
                    <button
                      type="button"
                      onClick={() => void updateConversation(c.id, { archived: !c.archivedAt })}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      {c.archivedAt ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                    </button>
                    {FOLDERS.filter((folder) => folder.id !== c.folder).slice(0, 2).map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => void updateConversation(c.id, { folder: folder.id })}
                        className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        {folder.label}
                      </button>
                    ))}
                  </div>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

