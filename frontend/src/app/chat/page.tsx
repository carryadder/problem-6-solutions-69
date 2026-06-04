'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { api, apiJson } from '@/lib/api';
import { avatarFor } from '@/lib/avatar';
import { Archive, ArchiveRestore, BellOff, Briefcase, ChevronRight, MessageCircle, Star, Users } from 'lucide-react';
import Loader from '@/components/Loader';

type ConvT = {
  id: string;
  other: { id: string; handle: string; displayName: string; profilePicture: string | null };
  lastMessage: { body: string; audioUrl?: string | null; imageUrl?: string | null; createdAt: string } | null;
  lastReadAt: string | null;
  otherLastReadAt: string | null;
  pushMuted: boolean;
  wallpaper: 'aurora' | 'midnight' | 'sunset' | 'mint' | 'graphite';
  archivedAt: string | null;
  folder: 'inbox' | 'friends' | 'work' | 'saved';
  unreadCount: number;
};

function chatPreview(conversation: ConvT) {
  if (!conversation.lastMessage) return 'No messages yet';
  if (conversation.lastMessage.imageUrl) return 'Photo';
  if (conversation.lastMessage.audioUrl) return 'Voice note';
  return conversation.lastMessage.body || 'Message';
}

const FOLDERS: Array<{ id: ConvT['folder']; label: string; icon: typeof Users }> = [
  { id: 'inbox', label: 'Inbox', icon: MessageCircle },
  { id: 'friends', label: 'Friends', icon: Users },
  { id: 'work', label: 'Work', icon: Briefcase },
  { id: 'saved', label: 'Saved', icon: Star },
];

import { motion } from 'framer-motion';

export default function ChatListPage() {
  const { status } = useSession();
  const router = useRouter();
  const [convs, setConvs] = useState<ConvT[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [folderFilter, setFolderFilter] = useState<ConvT['folder']>('inbox');

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
      api<{ conversations: ConvT[] }>('/api/conversations').then((r) => setConvs(r.conversations));
    }
  }, [status, router]);

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
    <div className="space-y-6">
      <motion.div 
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-3"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
          <MessageCircle className="h-5 w-5" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Chats</h1>
      </motion.div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowArchived(false)}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${!showArchived ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}
        >
          Inbox
        </button>
        <button
          type="button"
          onClick={() => setShowArchived(true)}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${showArchived ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}
        >
          Archived
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FOLDERS.map((folder) => {
          const Icon = folder.icon;
          const active = folderFilter === folder.id;
          return (
            <button
              key={folder.id}
              type="button"
              onClick={() => setFolderFilter(folder.id)}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ${active ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}
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
          className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/50 p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/20"
        >
          <MessageCircle className="mb-4 h-12 w-12 text-slate-300 dark:text-slate-600" />
          <h3 className="mb-2 text-lg font-bold text-slate-900 dark:text-slate-100">No conversations</h3>
          <p className="text-[15px] font-medium text-slate-500">{showArchived ? 'No archived chats in this folder yet.' : 'Open someone\'s profile and tap Message to start chatting.'}</p>
        </motion.div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-soft dark:divide-slate-800/60 dark:border-slate-800/60 dark:bg-slate-900/50">
          {filteredConversations.map((c, i) => (
            <motion.li 
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <Link href={`/chat/${c.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                  <img src={avatarFor(c.other)} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-transparent transition-all group-hover:ring-rose-100 dark:group-hover:ring-rose-900/30" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-[15px] font-bold text-slate-900 dark:text-slate-100">{c.other.displayName}</div>
                      {c.pushMuted && <BellOff className="h-4 w-4 text-slate-400" />}
                    </div>
                    <div className="truncate text-[14px] font-medium text-slate-500">
                      {chatPreview(c)}
                    </div>
                  </div>
                </Link>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    {c.unreadCount > 0 && (
                      <span className="rounded-full bg-slate-900 px-2 py-1 text-[10px] font-bold text-white dark:bg-white dark:text-slate-900">
                        {c.unreadCount}
                      </span>
                    )}
                    <ChevronRight className="h-5 w-5 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-400" />
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void updateConversation(c.id, { archived: !c.archivedAt })}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    >
                      {c.archivedAt ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                    </button>
                    {FOLDERS.filter((folder) => folder.id !== c.folder).slice(0, 2).map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => void updateConversation(c.id, { folder: folder.id })}
                        className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {folder.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

