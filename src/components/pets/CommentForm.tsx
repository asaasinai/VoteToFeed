"use client";

import { useState } from "react";

export function CommentForm({
  petId,
}: {
  petId: string;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId, text: text.slice(0, 255) }),
      });
      if (res.ok) {
        setText("");
        window.location.reload(); // Refresh to show new comment
      } else {
        const data = await res.json();
        alert(data.error || "Failed to post comment");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment..."
          maxLength={255}
          className="input-field flex-1"
        />
        <button type="submit" disabled={loading} className="btn-primary flex-shrink-0 min-h-[44px]">
          {loading ? "..." : "Post"}
        </button>
      </div>
      <p className="text-xs text-surface-400 text-right">{text.length}/255</p>
    </form>
  );
}
