'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { avatarFor } from '@/lib/avatar';
import EmojiPicker from '@/components/EmojiPicker';
import { ArrowLeft, MessageCircle, MessageSquare, Smile } from 'lucide-react';

type Sender = { id: string; handle: string; displayName: string; profilePicture: string | null };
type MessageT = { id: string; conversationId: string; senderId: string; body: string; createdAt: string; sender: Sender };

export default function ChatThreadPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { status, data: session } = useSession();
  const [messages, setMessages] = useState<MessageT[]>([]);
  const [draft, setDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const meId = (session as any)?.userId;

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    let activeSocket: Socket | null = null;

    setLoading(true);
    api<{ messages: MessageT[] }>(`/api/conversations/${params.id}/messages`).then((r) => {
      if (!cancelled) {
        setMessages(r.messages);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    getSocket().then((s) => {
      if (cancelled) return;
      activeSocket = s;
      socketRef.current = s;
      
      s.emit('conversation:join', params.id, () => {});
      
      // Use named function to ensure we can remove exactly this listener
      const onNewMessage = (m: MessageT) => {
        if (m.conversationId === params.id) {
          setMessages((prev) => {
            // Prevent duplicate messages in UI if they come in via multiple channels
            if (prev.some(msg => msg.id === m.id)) return prev;
            return [...prev, m];
          });
        }
      };

      s.on('message:new', onNewMessage);
      s.on('typing:start', () => setTyping(true));
      s.on('typing:stop', () => setTyping(false));

      // Store cleanup logic
      return () => {
        s.emit('conversation:leave', params.id);
        s.off('message:new', onNewMessage);
        s.off('typing:start');
        s.off('typing:stop');
      };
    });

    return () => {
      cancelled = true;
      if (activeSocket) {
        activeSocket.emit('conversation:leave', params.id);
        activeSocket.off('message:new');
      }
    };
  }, [params.id, status]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    
    setSending(true);
    setError(null);
    
    socketRef.current?.emit(
      'message:send',
      { conversationId: params.id, body },
      (ack: any) => {
        setSending(false);
        if (!ack?.ok) {
          if (ack?.error === 'emoji_only') setError('Only emoji are allowed in chat.');
          else if (ack?.error === 'rate_limited') setError('Slow down a bit.');
          else setError('Could not send.');
        } else {
          setDraft('');
        }
      },
    );
  }

  const other = messages.find((m) => m.senderId !== meId)?.sender;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
      <header className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-black/40">
        <Link href="/chat" className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Link>
        {other && (
          <Link href={`/u/${other.handle}`} className="ml-2 flex items-center gap-2">
            <img src={avatarFor(other)} alt="" className="h-8 w-8 rounded-full object-cover" />
            <span className="text-sm font-semibold">{other.displayName}</span>
          </Link>
        )}
      </header>

      <div
        ref={scrollRef}
        className="flex-1 flex flex-col gap-4 overflow-y-auto rounded-3xl border border-slate-200/60 bg-slate-50/50 p-4 dark:border-slate-800/60 dark:bg-slate-950/50"
      >
        {messages.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center text-slate-400">
            <div className="mb-4 rounded-full bg-slate-100 p-6 dark:bg-slate-900/50">
              <MessageSquare className="h-12 w-12 opacity-20" />
            </div>
            <p className="text-sm font-medium italic">No messages yet — start the conversation</p>
          </div>
        )}
        
        {messages.map((m, i) => {
          // Robust 'isMe' check: try multiple session properties to identify the current user
          const currentUserId = (session as any)?.userId || (session as any)?.user?.id || (session as any)?.sub;
          const isMe = !!(currentUserId && m.sender.id === currentUserId);
          
          const prev = messages[i - 1];
          const isFirstInGroup = !prev || prev.sender.id !== m.sender.id;
          const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          return (
            <div key={m.id} className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex items-end gap-2 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar for the other person (on the left) */}
                {!isMe ? (
                  <div className="w-8 shrink-0">
                    {isFirstInGroup ? (
                      <Link href={`/u/${m.sender.handle}`}>
                        <img src={avatarFor(m.sender)} alt="" className="h-8 w-8 rounded-full object-cover shadow-sm ring-1 ring-slate-200 dark:ring-slate-800" />
                      </Link>
                    ) : <div className="w-8" />}
                  </div>
                ) : null}

                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {/* Name for the other person */}
                  {!isMe && isFirstInGroup && (
                    <span className="mb-1 ml-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                      {m.sender.displayName}
                    </span>
                  )}

                  <div
                    className={`relative rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed shadow-sm transition-all ${
                      isMe
                        ? 'bg-rose-600 text-white rounded-br-none shadow-md shadow-rose-500/20'
                        : 'bg-white text-slate-900 rounded-bl-none dark:bg-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-800'
                    }`}
                  >
                    {m.body}
                    <span className={`mt-1 block text-[9px] font-bold uppercase tracking-tighter opacity-50 ${isMe ? 'text-right' : 'text-left'}`}>
                      {time}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {typing && (
          <div className="flex items-center gap-2 px-10">
            <div className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"></span>
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0.2s]"></span>
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0.4s]"></span>
            </div>
          </div>
        )}
      </div>

      {error && <div className="rounded-md bg-rose-50 p-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">{error}</div>}

      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="rounded-full bg-slate-100 p-2.5 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
            aria-label="Emoji picker"
          >
            <Smile className="h-6 w-6" />
          </button>
          {pickerOpen && (
            <div className="absolute bottom-full left-0 mb-2 z-50">
               <EmojiPicker onPick={(e) => { setDraft((d) => (d + e).slice(0, 500)); setPickerOpen(false); }} />
            </div>
          )}
        </div>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 500))}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a message..."
          className="flex-1 rounded-full bg-slate-50 px-4 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:bg-slate-800"
        />
        <button
          type="button"
          onClick={send}
          disabled={!draft.trim() || sending}
          className="rounded-full bg-slate-900 px-6 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:scale-105 disabled:pointer-events-none disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
