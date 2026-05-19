"use client";

import { useRef, useState } from "react";
import { apiUpload } from "@/lib/api";
import type { PostT } from "./PostCard";
import { Image as ImageIcon, Send, X } from "lucide-react";
import { motion } from "framer-motion";

export default function Composer({
  onCreate,
}: {
  onCreate: (post: PostT) => void;
}) {
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (busy) return;
    if (body.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("body", body);
      if (file) fd.append("image", file);
      const { post } = await apiUpload<{ post: PostT }>("/api/posts", fd);
      onCreate(post);
      setBody("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: any) {
      setError(e.message || "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mb-4 overflow-hidden rounded-xl sm:rounded-3xl border border-slate-200/60 bg-white p-1 sm:p-2 shadow-soft transition-all focus-within:border-slate-300 focus-within:shadow-soft-lg dark:border-slate-800/60 dark:bg-slate-900/50 dark:focus-within:border-slate-700"
    >
      <div className="p-2 sm:p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 2000))}
          rows={3}
          placeholder="Describe the problem you're facing..."
          className="block w-full resize-none bg-transparent text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 dark:text-slate-100"
        />
        {file && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
            <ImageIcon className="h-5 w-5 text-slate-400" />
            <span className="truncate font-medium">{file.name}</span>
            <button
              type="button"
              className="ml-auto rounded-full p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700"
              onClick={() => {
                setFile(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {error && (
          <div className="mt-2 text-sm font-medium text-rose-600">{error}</div>
        )}
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 dark:bg-slate-800/30">
        <label className="flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200/50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200">
          <ImageIcon className="h-5 w-5" />
          <span>Attachment</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <div className="flex items-center gap-4">
          <span className="text-xs font-medium text-slate-400">
            {body.length}/2000
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={busy || body.trim().length === 0}
            className="flex items-center gap-2 rounded-full bg-slate-900 px-3 sm:px-5 py-1.5 sm:py-2 text-sm font-bold text-white shadow-md transition-all hover:scale-105 disabled:pointer-events-none disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            <span>{busy ? "Asking…" : "Ask Question"}</span>
            {!busy && <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
