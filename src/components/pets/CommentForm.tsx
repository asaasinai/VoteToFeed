"use client";

import { useRef, useState } from "react";

const EMOJIS = [
  "😍","🐾","🐶","🐱","🐰","🐹","🐻","🦊","🐼","🐨",
  "🐸","🐯","🦁","🐧","🦜","🐠","🐢","🦋","🌟","❤️",
  "🧡","💛","💚","💙","💜","🎉","🙌","👏","😂","😭",
  "😊","😎","🥰","🤩","😅","🙏","👍","🔥","✨","💯",
];

export function CommentForm({
  petId,
  parentId,
  onCancel,
  compact,
}: {
  petId: string;
  parentId?: string;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function insertEmoji(emoji: string) {
    const input = inputRef.current;
    if (!input) {
      setText((prev) => (prev + emoji).slice(0, 255));
      return;
    }
    const start = input.selectionStart ?? text.length;
    const end = input.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + emoji + text.slice(end)).slice(0, 255);
    setText(next);
    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      input.focus();
      const pos = Math.min(start + emoji.length, 255);
      input.setSelectionRange(pos, pos);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId, text: text.slice(0, 255), ...(parentId ? { parentId } : {}) }),
      });
      if (res.ok) {
        setText("");
        setShowEmojis(false);
        window.location.reload();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to post comment");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-1.5">
      <div className="flex gap-2">
        {/* Emoji toggle */}
        <button
          type="button"
          onClick={() => setShowEmojis((v) => !v)}
          title="Add emoji"
          className={`flex-shrink-0 text-lg leading-none rounded-lg border border-surface-200 bg-surface-50 hover:bg-surface-100 transition-colors ${
            compact ? "px-2 py-1.5" : "px-2.5 py-2"
          } ${showEmojis ? "border-brand-400 bg-brand-50" : ""}`}
        >
          😊
        </button>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={parentId ? "Write a reply..." : "Add a comment..."}
          maxLength={255}
          className={`input-field flex-1 ${compact ? "text-sm py-2" : ""}`}
          autoFocus={!!parentId}
        />
        <button type="submit" disabled={loading} className={`btn-primary flex-shrink-0 ${compact ? "text-sm px-3 py-2" : "min-h-[44px]"}`}>
          {loading ? "..." : "Post"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={`btn-ghost flex-shrink-0 ${compact ? "text-sm px-3 py-2" : "min-h-[44px]"}`}>
            Cancel
          </button>
        )}
      </div>

      {/* Emoji picker */}
      {showEmojis && (
        <div className="flex flex-wrap gap-1 p-2 rounded-xl border border-surface-200 bg-white shadow-sm">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => insertEmoji(emoji)}
              className="text-xl leading-none w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-100 transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {!compact && <p className="text-xs text-surface-800 text-right">{text.length}/255</p>}
    </form>
  );
}
