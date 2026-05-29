"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatUserName } from "@/lib/utils";
import { MediaCarousel } from "@/components/shared/MediaCarousel";
import { BuyVotesLink } from "@/components/voting/BuyVotesLink";
import { CreateStoryModal } from "@/components/shared/CreateStoryModal";
import { upload } from "@vercel/blob/client";

/* ─── Types ─── */
type FeedUser = {
  id: string;
  name: string | null;
  image: string | null;
  city: string | null;
  state: string | null;
  followerCount: number;
};

type FeedComment = {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
  likeCount: number;
  isLiked: boolean;
};

type FeedPost = {
  id: string;
  content: string;
  imageUrl: string | null;
  createdAt: string;
  user: FeedUser;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  myReaction: string | null;
  reactions: { HEART: number; HAHA: number; WOW: number };
  isFollowing: boolean;
  isOwnPost: boolean;
  comments: FeedComment[];
};

type FeedPet = {
  id: string;
  name: string;
  type: string;
  breed: string | null;
  bio: string | null;
  photos: string[];
  tags: string[];
  city: string | null;
  state: string | null;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
  totalVotes: number;
  weeklyVotes: number;
  weeklyRank: number | null;
  isNew: boolean;
};

type StoryItem = {
  id: string;
  mediaUrl: string;
  mediaType: string;
  caption: string | null;
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
  isLiked: boolean;
  likeCount: number;
};

type StoryUser = {
  user: { id: string; name: string | null; image: string | null };
  stories: StoryItem[];
  hasUnseen: boolean;
};

/* ─── Feed ranking algorithm ─── */
// Score posts so that: followed users appear first, recent posts rank higher,
// and posts with low engagement get a small boost to encourage interaction.
function rankPosts(posts: FeedPost[]): FeedPost[] {
  const now = Date.now();
  return [...posts].sort((a, b) => {
    const score = (p: FeedPost) => {
      const hoursAgo = (now - new Date(p.createdAt).getTime()) / 3_600_000;
      let s = 0;
      // Followed users always rank highest
      if (p.isFollowing) s += 30;
      // Recency bonus
      if (hoursAgo < 1) s += 20;
      else if (hoursAgo < 6) s += 15;
      else if (hoursAgo < 24) s += 10;
      else if (hoursAgo < 72) s += 5;
      // Underdog boost: fresh posts that still need love
      const totalReactions = p.reactions.HEART + p.reactions.HAHA + p.reactions.WOW;
      if (totalReactions < 3 && p.commentCount < 2 && hoursAgo < 48) s += 6;
      return s;
    };
    return score(b) - score(a);
  });
}

/* ─── Helpers ─── */
function timeAgo(dateStr: string) {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ─── Share Modal ─── */
function ShareModal({ post, onClose }: { post: FeedPost; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/users/${post.user.id}`;
  const shareText = `Check out ${formatUserName(post.user.name)}'s post on VoteToFeed!`;

  function copyLink() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-modal-backdrop" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-modal-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-surface-900">Share Post</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-surface-100 flex items-center justify-center transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 group">
              <div className="w-14 h-14 rounded-2xl bg-black flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </div>
              <span className="text-[11px] font-semibold text-surface-600">X</span>
            </a>
            <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 group">
              <div className="w-14 h-14 rounded-2xl bg-[#1877F2] flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </div>
              <span className="text-[11px] font-semibold text-surface-600">Facebook</span>
            </a>
            <a href={`https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`} target="_blank" rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 group">
              <div className="w-14 h-14 rounded-2xl bg-[#25D366] flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </div>
              <span className="text-[11px] font-semibold text-surface-600">WhatsApp</span>
            </a>
            <button onClick={copyLink} className="flex flex-col items-center gap-2 group">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all shadow-lg ${copied ? "bg-emerald-500" : "bg-surface-700"}`}>
                {copied ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                )}
              </div>
              <span className="text-[11px] font-semibold text-surface-600">{copied ? "Copied!" : "Copy"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Media helpers ─── */
function parseMedia(imageUrl: string | null): string[] {
  if (!imageUrl) return [];
  if (imageUrl.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(imageUrl);
      if (Array.isArray(parsed)) return parsed.filter((u): u is string => typeof u === "string");
    } catch { /* fall through */ }
    return [imageUrl];
  }
  return [imageUrl];
}
function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov|ogg|avi)(\?.*)?$/i.test(url);
}

/* ─── Create Post Modal ─── */
function CreatePostModal({ onClose, onCreated }: { onClose: () => void; onCreated: (post: FeedPost) => void }) {
  const { data: session } = useSession();
  const [content, setContent] = useState("");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const MAX_MEDIA = 3;
  // vvBottom: how many px above the keyboard to push the modal
  // vvMaxH:  max height of the modal so it never overlaps the keyboard
  const [vvBottom, setVvBottom] = useState(0);
  const [vvMaxH, setVvMaxH] = useState<number | null>(null);
  const [showEmojis, setShowEmojis] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const POST_EMOJIS = ["😀","😂","🥰","😍","🤩","😎","🥺","😭","🙏","❤️","🔥","✨","💯","👏","🎉","🐶","🐱","🐾","🐕","🐈","🦴","🐾","🌟","💪","👍","😁","🤣","😊","🥳","💕","💖","🌈","☀️","🍀","🎊","🏆","📸","💌","🤍","🐻"];

  function insertPostEmoji(emoji: string) {
    const ta = textareaRef.current;
    if (!ta) { setContent((p) => p + emoji); return; }
    const start = ta.selectionStart ?? content.length;
    const end = ta.selectionEnd ?? content.length;
    const next = content.slice(0, start) + emoji + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  // visualViewport API — works on iOS 13+, Android Chrome 61+
  // When keyboard opens, visualViewport.height shrinks and offsetTop may change.
  // We use that to push the sheet up exactly to the top of the keyboard.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      const v = vv as VisualViewport;
      // Distance from bottom of visual viewport to bottom of layout viewport
      const bottomGap = window.innerHeight - (v.offsetTop + v.height);
      setVvBottom(Math.max(0, bottomGap));
      setVvMaxH(Math.floor(v.height * 0.92));
    }

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function pickMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadError(null);
    const remaining = MAX_MEDIA - mediaFiles.length;
    const toAdd = files.slice(0, remaining);
    if (files.length > remaining) {
      setUploadError(`Maximum ${MAX_MEDIA} files per post.`);
    }
    setMediaFiles((prev) => [...prev, ...toAdd]);
    setMediaPreviews((prev) => [...prev, ...toAdd.map((f) => URL.createObjectURL(f))]);
    // reset so same file can be picked again
    e.target.value = "";
  }

  function removeMedia(idx: number) {
    URL.revokeObjectURL(mediaPreviews[idx]);
    setMediaFiles((prev) => prev.filter((_, i) => i !== idx));
    setMediaPreviews((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (!content.trim() || !session?.user) return;
    setPosting(true);
    setUploadProgress(0);
    setUploadError(null);
    try {
      const userId = (session.user as { id: string }).id;
      const mediaUrls: string[] = [];

      if (mediaFiles.length > 0) {
        const videoFiles = mediaFiles.filter((f) => f.type.startsWith("video/"));
        const imageFiles = mediaFiles.filter((f) => !f.type.startsWith("video/"));

        // Upload video files via client-side Blob upload (bypass 4.5 MB Vercel limit)
        for (const f of videoFiles) {
          const ext = f.name.split(".").pop()?.toLowerCase() || "mp4";
          const pathname = `videos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          try {
            const tokenRes = await fetch("/api/upload/token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pathname }),
            }).catch(() => null);
            if (tokenRes && tokenRes.ok) {
              const blob = await upload(pathname, f, {
                access: "public",
                handleUploadUrl: "/api/upload/token",
                contentType: f.type || undefined,
                multipart: true,
                onUploadProgress: ({ percentage }) => setUploadProgress(Math.round(percentage)),
              });
              mediaUrls.push(blob.url);
            } else {
              // Fallback for localhost without BLOB_READ_WRITE_TOKEN
              const fd = new FormData();
              fd.append("photos", f);
              const up = await fetch("/api/upload", { method: "POST", body: fd });
              if (up.ok) {
                const { urls } = await up.json();
                mediaUrls.push(...(urls || []));
              }
            }
          } catch {
            setUploadError("Video upload failed. Please try again.");
            setPosting(false);
            return;
          }
        }

        // Upload image files via server route (images are well under 4.5 MB limit)
        if (imageFiles.length > 0) {
          const fd = new FormData();
          imageFiles.forEach((f) => fd.append("photos", f));
          const up = await fetch("/api/upload", { method: "POST", body: fd });
          if (up.ok) {
            const { urls } = await up.json();
            mediaUrls.push(...(urls || []));
          } else {
            const err = await up.json().catch(() => ({}));
            setUploadError(err.error || "Upload failed.");
            setPosting(false);
            return;
          }
        }
      }

      const res = await fetch(`/api/users/${userId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), mediaUrls }),
      });
      if (res.ok) {
        const newPost = await res.json();
        const feedPost: FeedPost = {
          ...newPost,
          user: {
            id: userId,
            name: session.user.name,
            image: session.user.image,
            city: null,
            state: null,
            followerCount: 0,
          },
          likeCount: 0,
          commentCount: 0,
          isLiked: false,
          myReaction: null,
          reactions: { HEART: 0, HAHA: 0, WOW: 0 },
          isFollowing: false,
          isOwnPost: true,
          comments: [],
        };
        onCreated(feedPost);
        onClose();
      }
    } finally {
      setPosting(false);
      setUploadProgress(0);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 animate-modal-backdrop bg-black/50 backdrop-blur-sm sm:flex sm:items-center sm:justify-center"
      onClick={onClose}
    >
      {/* Modal card */}
      <div
        className="fixed inset-x-0 sm:static sm:w-full sm:max-w-lg flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-modal-slide-up"
        style={typeof window !== "undefined" && window.innerWidth < 640
          ? { bottom: `${vvBottom}px`, maxHeight: vvMaxH ? `${vvMaxH}px` : "85svh" }
          : { maxHeight: "min(680px, 90vh)" }
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — always visible at top */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-surface-100 shrink-0">
          <button onClick={onClose} className="text-sm font-semibold text-surface-500 hover:text-surface-700 transition-colors">Cancel</button>
          <h3 className="text-base font-bold text-surface-900">Create Post</h3>
          <button
            onClick={handleSubmit}
            disabled={posting || !content.trim()}
            className="px-4 py-1.5 rounded-full text-sm font-bold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            {posting ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {uploadProgress > 0 && uploadProgress < 100 ? `${uploadProgress}%` : "Posting"}
              </span>
            ) : "Post"}
          </button>
        </div>

        {/* Scrollable compose area */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-brand-100 to-brand-50 flex items-center justify-center flex-shrink-0">
              {session?.user?.image ? (
                <img src={session.user.image} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-brand-600">{(session?.user?.name || "U")[0].toUpperCase()}</span>
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-surface-900 mb-1">{session?.user?.name || "You"}</p>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Share a fun moment, a new photo, or what your pet is up to today! 🐶🐱✨"
                rows={3}
                maxLength={1000}
                className="w-full resize-none text-surface-800 placeholder:text-surface-400 focus:outline-none leading-relaxed"
                style={{ fontSize: '16px' }}
              />
            </div>
          </div>

          {/* Multi-media preview grid */}
          {mediaPreviews.length > 0 && (
            <div className={`mt-3 grid gap-2 ${mediaPreviews.length === 1 ? "grid-cols-1" : mediaPreviews.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
              {mediaPreviews.map((src, idx) => (
                <div key={idx} className="relative rounded-xl overflow-hidden border border-surface-200 bg-black" style={{ aspectRatio: "1/1", maxHeight: mediaPreviews.length === 1 ? "220px" : "160px" }}>
                  {isVideo(mediaFiles[idx]?.name || src) ? (
                    <video src={src} className="w-full h-full object-cover" muted playsInline />
                  ) : (
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  )}
                  {isVideo(mediaFiles[idx]?.name || src) && (
                    <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-bold flex items-center gap-1">
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      Video
                    </div>
                  )}
                  <button
                    onClick={() => removeMedia(idx)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          {uploadError && (
            <p className="mt-2 text-xs text-red-500 font-medium">{uploadError}</p>
          )}

          {/* Emoji picker */}
          {showEmojis && (
            <div className="mt-3 grid grid-cols-8 gap-1 p-3 bg-surface-50 rounded-2xl border border-surface-100">
              {POST_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => insertPostEmoji(e)}
                  className="text-xl leading-none p-1.5 rounded-lg hover:bg-surface-200 transition-colors"
                >{e}</button>
              ))}
            </div>
          )}
        </div>

        {/* Actions bar — pinned at bottom, above iOS safe area */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-surface-100 bg-surface-50/50 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <div className="flex gap-1 items-center">
            <button
              type="button"
              onClick={() => setShowEmojis((v) => !v)}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors text-lg ${showEmojis ? "bg-brand-50 text-brand-500" : "hover:bg-brand-50 text-surface-400 hover:text-brand-500"}`}
              title="Emojis"
            >😊</button>
            {mediaPreviews.length < MAX_MEDIA && (
              <>
                <label className="w-10 h-10 rounded-full hover:bg-brand-50 flex items-center justify-center cursor-pointer transition-colors" title="Add photo">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2EC4B6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={pickMedia} />
                </label>
                <label className="w-10 h-10 rounded-full hover:bg-brand-50 flex items-center justify-center cursor-pointer transition-colors" title="Add video">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2EC4B6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                  <input type="file" accept="video/*" className="hidden" onChange={pickMedia} />
                </label>
              </>
            )}
            {mediaPreviews.length > 0 && (
              <span className="text-xs text-surface-400 ml-1">{mediaPreviews.length}/{MAX_MEDIA}</span>
            )}
          </div>
          <span className="text-xs text-surface-400">{content.length}/1000</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Pet Card (shown inline in feed) ─── */
function PetCard({ pet }: { pet: FeedPet }) {
  const photos = (pet.photos || []).filter(Boolean);
  const location = [pet.city, pet.state].filter(Boolean).join(", ");
  const petEmoji = pet.type === "DOG" ? "🐶" : pet.type === "CAT" ? "🐱" : "🐾";
  const [photoIdx, setPhotoIdx] = useState(0);
  const hasMultiple = photos.length > 1;

  function prevPhoto(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setPhotoIdx((i) => (i - 1 + photos.length) % photos.length);
  }
  function nextPhoto(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setPhotoIdx((i) => (i + 1) % photos.length);
  }

  return (
    <article className="bg-white rounded-2xl border border-brand-100 shadow-sm overflow-hidden hover:shadow-md transition-all">
      {/* Header — owner info */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <Link href={`/users/${pet.user.id}`} className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-brand-100 to-brand-50 flex items-center justify-center flex-shrink-0 ring-2 ring-surface-200/60 group-hover:ring-brand-300 transition-all">
            {pet.user.image ? (
              <img src={pet.user.image} alt={pet.user.name || ""} className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-bold text-brand-600">{(pet.user.name || "?")[0].toUpperCase()}</span>
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-surface-900 group-hover:text-brand-600 transition-colors">
              {formatUserName(pet.user.name)}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-surface-400">
              <span>{petEmoji} Shared their pet</span>
              {location && <><span>·</span><span>📍 {location}</span></>}
            </div>
          </div>
        </Link>
        {pet.isNew && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase tracking-wide">New</span>
        )}
      </div>

      {/* Pet name + bio */}
      <div className="px-5 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base font-extrabold text-surface-900">{pet.name}</span>
          {pet.breed && <span className="text-xs text-surface-400 font-medium">{pet.breed}</span>}
        </div>
        {pet.bio && (
          <p className="text-sm text-surface-700 leading-relaxed">{pet.bio}</p>
        )}
        {pet.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {pet.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded-full text-[11px] bg-brand-50 text-brand-600 font-medium">#{tag}</span>
            ))}
          </div>
        )}
      </div>

      {/* Photo carousel */}
      {photos.length > 0 && (
        <div className="relative group/photo">
          <Link href={`/pets/${pet.id}`} className="block">
            <img src={photos[photoIdx]} alt={pet.name} className="w-full object-cover max-h-80 bg-surface-100 transition-opacity" />
          </Link>
          {hasMultiple && (
            <>
              <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/55 text-white text-[11px] font-semibold backdrop-blur-sm">
                {photoIdx + 1} / {photos.length}
              </div>
              <button onClick={prevPhoto} aria-label="Previous photo" className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/85 hover:bg-white shadow-md flex items-center justify-center text-surface-700 opacity-0 group-hover/photo:opacity-100 transition-opacity active:scale-95">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <button onClick={nextPhoto} aria-label="Next photo" className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/85 hover:bg-white shadow-md flex items-center justify-center text-surface-700 opacity-0 group-hover/photo:opacity-100 transition-opacity active:scale-95">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
              <div className="absolute bottom-2.5 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
                {photos.map((_, idx) => (
                  <span key={idx} className={`h-1.5 rounded-full transition-all ${idx === photoIdx ? "w-5 bg-white" : "w-1.5 bg-white/55"}`} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Footer — votes + CTA */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-surface-100">
        <div className="flex items-center gap-4 text-sm text-surface-500">
          <span className="flex items-center gap-1.5 font-semibold">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#E8453C" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            <span className="text-surface-700">{pet.totalVotes.toLocaleString()} votes</span>
          </span>
          {pet.weeklyRank && pet.weeklyRank <= 10 && (
            <span className="flex items-center gap-1 text-amber-600 font-bold text-xs">🏆 #{pet.weeklyRank} this week</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <BuyVotesLink
            href={`/dashboard?buy=FRIEND&pet=${pet.id}`}
            source="feed_pet_card"
            petId={pet.id}
            petName={pet.name}
            packageTier="FRIEND"
            currentRank={pet.weeklyRank}
            className="px-3 py-1.5 rounded-full text-xs font-bold border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors active:scale-95"
          >
            ⚡ Buy Votes
          </BuyVotesLink>
          <Link href={`/pets/${pet.id}`} className="px-4 py-1.5 rounded-full text-xs font-bold bg-brand-500 text-white hover:bg-brand-600 transition-colors active:scale-95">
            View &amp; Vote
          </Link>
        </div>
      </div>
    </article>
  );
}

/* ─── Expandable post text with "Read more / Show less" ─── */
const CHAR_LIMIT = 300;
function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  if (text.length <= CHAR_LIMIT) {
    return <p className="text-sm text-surface-800 leading-relaxed whitespace-pre-wrap">{text}</p>;
  }
  return (
    <div>
      <p className="text-sm text-surface-800 leading-relaxed whitespace-pre-wrap">
        {expanded ? text : text.slice(0, CHAR_LIMIT).trimEnd() + "…"}
      </p>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-1 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
      >
        {expanded ? "Show less" : "Read more"}
      </button>
    </div>
  );
}

/* ─── Suggested Users (Horizontal Stories Style) ─── */
function SuggestedUsers() {
  const [users, setUsers] = useState<FeedUser[]>([]);
  const { data: session } = useSession();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/users/suggested");
        if (res.ok) {
          const data = await res.json();
          // Shuffle on every load so it feels fresh
          setUsers([...data].sort(() => Math.random() - 0.5));
        }
      } catch (e) {}
    }
    load();
  }, [session]);

  if (users.length === 0) return null;

  return (
    <div className="mb-6 overflow-hidden">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-xs font-extrabold text-surface-500 uppercase tracking-widest flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400">
            <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
          </svg>
          People you may like
        </h3>
      </div>
      <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1 snap-x">
        {users.map((u) => (
          <Link
            key={u.id}
            href={`/users/${u.id}`}
            className="flex flex-col items-center gap-2 min-w-[90px] max-w-[90px] snap-start bg-white rounded-2xl border border-surface-200/60 shadow-sm p-3 hover:shadow-md hover:border-brand-200 transition-all group"
          >
            <div className="relative">
              <div className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-brand-300/40 group-hover:ring-brand-500/60 transition-all">
                {u.image ? (
                  <img src={u.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-400 to-brand-600 text-white text-xl font-bold">
                    {u.name?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-brand-500 border-2 border-white flex items-center justify-center">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </span>
            </div>
            <p className="text-[11px] font-bold text-surface-800 group-hover:text-brand-600 transition-colors text-center line-clamp-1 w-full">
              {u.name?.split(" ")[0] || "User"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ─── Who Liked Modal ─── */
function LikesModal({ postId, postUserId, onClose }: { postId: string; postUserId: string; onClose: () => void }) {
  const [users, setUsers] = useState<{ id: string; name: string | null; image: string | null; reaction: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/users/${postUserId}/posts/${postId}/like`)
      .then((r) => r.json())
      .then((data) => {
        const raw = Array.isArray(data?.users) ? data.users : [];
        setUsers(raw);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [postId, postUserId]);

  const REACTION_EMOJI: Record<string, string> = { HEART: "❤️", HAHA: "😂", WOW: "😮" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-modal-backdrop" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden animate-modal-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <h3 className="text-base font-bold text-surface-900">Reactions</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-surface-100 flex items-center justify-center transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-sm text-surface-500 py-8">No reactions yet.</p>
          ) : (
            users.map((u) => (
              <Link
                key={u.id}
                href={`/users/${u.id}`}
                onClick={onClose}
                className="flex items-center gap-3 px-5 py-3 hover:bg-surface-50 transition-colors"
              >
                <div className="relative flex-shrink-0">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-brand-50 flex items-center justify-center">
                    {u.image ? (
                      <img src={u.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-brand-600">{(u.name || "?")[0].toUpperCase()}</span>
                    )}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 text-base leading-none">{REACTION_EMOJI[u.reaction] ?? "❤️"}</span>
                </div>
                <span className="text-sm font-semibold text-surface-800">{u.name || "User"}</span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Stories Bar ─── */
function StoriesBar({
  storyUsers,
  ownId,
  ownImage,
  ownName,
  onOpenViewer,
  onOpenCreate,
}: {
  storyUsers: StoryUser[];
  ownId: string | null;
  ownImage?: string | null;
  ownName?: string | null;
  onOpenViewer: (userIdx: number) => void;
  onOpenCreate: () => void;
}) {
  const myEntry = storyUsers.find((s) => s.user.id === ownId);
  const others = storyUsers.filter((s) => s.user.id !== ownId);

  return (
    <>
      <div className="bg-white rounded-2xl border border-surface-200/60 shadow-sm mb-4 overflow-hidden">
        <div className="flex gap-4 overflow-x-auto px-4 py-3 scroll-smooth" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {/* My story circle */}
          {ownId && (
            <button
              onClick={() => {
                const idx = storyUsers.findIndex((s) => s.user.id === ownId);
                if (idx >= 0 && storyUsers[idx].stories.length > 0) onOpenViewer(idx);
                else onOpenCreate();
              }}
              className="flex flex-col items-center gap-1.5 flex-shrink-0"
            >
              <div className="relative">
                <div className={`w-16 h-16 rounded-full p-[2px] ${myEntry?.hasUnseen ? "bg-gradient-to-tr from-brand-400 via-brand-500 to-brand-700" : myEntry ? "bg-surface-300" : "bg-surface-100"}`}>
                  <div className="w-full h-full rounded-full overflow-hidden bg-white p-[2px]">
                    <div className="w-full h-full rounded-full overflow-hidden">
                      {myEntry?.stories[0] ? (
                        myEntry.stories[0].mediaType === "video" ? (
                          <video src={myEntry.stories[0].mediaUrl} className="w-full h-full object-cover" muted playsInline preload="metadata"
                            onLoadedMetadata={(e) => { (e.currentTarget as HTMLVideoElement).currentTime = 0.1; }} />
                        ) : (
                          <img src={myEntry.stories[0].mediaUrl} alt="" className="w-full h-full object-cover" />
                        )
                      ) : (myEntry?.user.image || ownImage) ? (
                        <img src={myEntry?.user.image || ownImage!} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-brand-50 flex items-center justify-center">
                          <span className="text-xl font-bold text-brand-500">{(myEntry?.user.name || ownName || "Y")[0].toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-brand-500 border-2 border-white flex items-center justify-center">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-surface-600 w-16 text-center truncate">Your Story</span>
            </button>
          )}

          {/* Other users' stories */}
          {others.map((su) => {
            const realIdx = storyUsers.findIndex((s) => s.user.id === su.user.id);
            return (
              <button
                key={su.user.id}
                onClick={() => onOpenViewer(realIdx)}
                className="flex flex-col items-center gap-1.5 flex-shrink-0"
              >
                <div className={`w-16 h-16 rounded-full p-[2px] ${su.hasUnseen ? "bg-gradient-to-tr from-brand-400 via-brand-500 to-brand-700" : "bg-surface-200"}`}>
                  <div className="w-full h-full rounded-full overflow-hidden bg-white p-[2px]">
                    <div className="w-full h-full rounded-full overflow-hidden">
                      {su.stories[0] ? (
                        su.stories[0].mediaType === "video" ? (
                          <video src={su.stories[0].mediaUrl} className="w-full h-full object-cover" muted playsInline preload="metadata"
                            onLoadedMetadata={(e) => { (e.currentTarget as HTMLVideoElement).currentTime = 0.1; }} />
                        ) : (
                          <img src={su.stories[0].mediaUrl} alt="" className="w-full h-full object-cover" />
                        )
                      ) : su.user.image ? (
                        <img src={su.user.image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-brand-50 flex items-center justify-center">
                          <span className="text-lg font-bold text-brand-500">{(su.user.name || "?")[0].toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-surface-600 w-16 text-center truncate">
                  {su.user.name?.split(" ")[0] || "User"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

    </>
  );
}

/* ─── Story Viewer ─── */
function StoryViewer({
  storyUsers,
  initialUserIdx,
  ownId,
  onClose,
  onStoriesReload,
  onAddStory,
}: {
  storyUsers: StoryUser[];
  initialUserIdx: number;
  ownId: string | null;
  onClose: () => void;
  onStoriesReload: () => void;
  onAddStory: () => void;
}) {
  const [userIdx, setUserIdx] = useState(initialUserIdx);
  const [storyIdx, setStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const DURATION = 5000;
  const TICK = 50;

  // Like state
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const lastTapTimeRef = useRef(0);

  // Viewers state (own stories only)
  type Viewer = { id: string; name: string | null; image: string | null; viewedAt: string };
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewersLoading, setViewersLoading] = useState(false);

  // Likers state (own stories only)
  type Liker = { id: string; name: string | null; image: string | null; likedAt: string };
  const [likers, setLikers] = useState<Liker[]>([]);
  const [likersOpen, setLikersOpen] = useState(false);
  const [likersLoading, setLikersLoading] = useState(false);

  const currentUser = storyUsers[userIdx];
  const currentStory = currentUser?.stories[storyIdx];

  const isOwn = currentUser?.user.id === ownId;

  // Sync like state when story changes
  useEffect(() => {
    setIsLiked(currentStory?.isLiked ?? false);
    setLikeCount(currentStory?.likeCount ?? 0);
    setLikersOpen(false);
    setLikers([]);
  }, [currentStory?.id]);

  // Fetch likers when own story + likersOpen
  useEffect(() => {
    if (!currentStory || !isOwn || !likersOpen) return;
    setLikersLoading(true);
    fetch(`/api/stories/${currentStory.id}/likes`)
      .then((r) => r.json())
      .then((d) => { setLikers(d.likers || []); setLikeCount(d.count ?? 0); })
      .catch(() => {})
      .finally(() => setLikersLoading(false));
  }, [currentStory?.id, isOwn, likersOpen]);

  async function toggleLike() {
    if (!currentStory) return;
    const newLiked = !isLiked;
    setIsLiked(newLiked);
    setLikeCount((c) => newLiked ? c + 1 : Math.max(0, c - 1));
    try {
      await fetch(`/api/stories/${currentStory.id}/like`, { method: "POST" });
    } catch {
      // revert on error
      setIsLiked(!newLiked);
      setLikeCount((c) => newLiked ? Math.max(0, c - 1) : c + 1);
    }
  }

  function handleDoubleTap() {
    const now = Date.now();
    if (now - lastTapTimeRef.current < 300) {
      // double tap
      if (!isLiked) {
        toggleLike();
        setShowHeartAnim(true);
        setTimeout(() => setShowHeartAnim(false), 900);
      }
    }
    lastTapTimeRef.current = now;
  }

  // Fetch viewers when switching to an own story
  useEffect(() => {
    if (!currentStory || !isOwn) { setViewers([]); return; }
    setViewersLoading(true);
    fetch(`/api/stories/${currentStory.id}/views`)
      .then((r) => r.json())
      .then((d) => setViewers(d.viewers || []))
      .catch(() => {})
      .finally(() => setViewersLoading(false));
  }, [currentStory?.id, isOwn]);

  // Mark as viewed
  useEffect(() => {
    if (!currentStory) return;
    fetch(`/api/stories/${currentStory.id}/view`, { method: "POST" }).catch(() => {});
  }, [currentStory?.id]);

  // Auto-advance with progress bar — pause when viewers panel is open
  useEffect(() => {
    if (viewersOpen || likersOpen) return;
    setProgress(0);
    if (progressRef.current) clearInterval(progressRef.current);
    progressRef.current = setInterval(() => {
      setProgress((p) => {
        const next = p + (TICK / DURATION) * 100;
        if (next >= 100) {
          advance();
          return 0;
        }
        return next;
      });
    }, TICK);
    return () => { if (progressRef.current) clearInterval(progressRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userIdx, storyIdx, viewersOpen, likersOpen]);

  function advance() {
    if (progressRef.current) clearInterval(progressRef.current);
    const stories = storyUsers[userIdx]?.stories ?? [];
    if (storyIdx < stories.length - 1) {
      setStoryIdx((i) => i + 1);
    } else if (userIdx < storyUsers.length - 1) {
      setUserIdx((u) => u + 1);
      setStoryIdx(0);
    } else {
      onClose();
      onStoriesReload();
    }
  }

  function retreat() {
    if (progressRef.current) clearInterval(progressRef.current);
    if (storyIdx > 0) {
      setStoryIdx((i) => i - 1);
    } else if (userIdx > 0) {
      const prevUser = storyUsers[userIdx - 1];
      setUserIdx((u) => u - 1);
      setStoryIdx(prevUser.stories.length - 1);
    }
  }

  if (!currentStory || !currentUser) return null;

  async function deleteStory() {
    if (!confirm("Delete this story?")) return;
    await fetch(`/api/stories/${currentStory.id}`, { method: "DELETE" }).catch(() => {});
    onClose();
    onStoriesReload();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col select-none">
      {/* Progress bars */}
      <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 px-3" style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}>
        {currentUser.stories.map((s, i) => (
          <div key={s.id} className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden">
            <div
              className="h-full bg-white rounded-full"
              style={{ width: i < storyIdx ? "100%" : i === storyIdx ? `${Math.min(progress, 100)}%` : "0%", transition: i === storyIdx ? "none" : undefined }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 pb-4 bg-gradient-to-b from-black/60 to-transparent pointer-events-none"
        style={{ paddingTop: "max(env(safe-area-inset-top), 44px)" }}>
        <Link href={`/users/${currentUser.user.id}`} onClick={onClose} className="flex items-center gap-2 flex-1 min-w-0 pointer-events-auto">
          <div className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-white/60 flex-shrink-0">
            {currentUser.user.image ? (
              <img src={currentUser.user.image} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-brand-500 flex items-center justify-center">
                <span className="text-sm font-bold text-white">{(currentUser.user.name || "?")[0].toUpperCase()}</span>
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">{currentUser.user.name || "User"}</p>
            <p className="text-[11px] text-white/70">{timeAgo(currentStory.createdAt)}</p>
          </div>
        </Link>
        {isOwn && (
          <>
            <button onClick={onAddStory} className="pointer-events-auto w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors" title="Add story">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button onClick={deleteStory} className="pointer-events-auto w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/80 hover:bg-white/20 transition-colors" title="Delete story">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            </button>
          </>
        )}
        <button onClick={onClose} className="pointer-events-auto w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Media */}
      <div className="flex-1 relative overflow-hidden" onClick={handleDoubleTap}>
        <button className="absolute left-0 top-0 w-1/3 h-full z-10" onClick={(e) => { e.stopPropagation(); retreat(); }} aria-label="Previous" />
        <button className="absolute right-0 top-0 w-1/3 h-full z-10" onClick={(e) => { e.stopPropagation(); advance(); }} aria-label="Next" />
        {currentStory.mediaType === "video" ? (
          <video
            key={currentStory.id}
            src={currentStory.mediaUrl}
            className="w-full h-full object-contain"
            autoPlay
            playsInline
          />
        ) : (
          <img
            key={currentStory.id}
            src={currentStory.mediaUrl}
            alt=""
            className="w-full h-full object-contain"
          />
        )}
        {/* Double-tap heart animation */}
        {showHeartAnim && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <svg className="animate-ping" width="80" height="80" viewBox="0 0 24 24" fill="#ef4444" stroke="none">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
          </div>
        )}
      </div>

      {/* Caption */}
      {currentStory.caption && !viewersOpen && (
        <div className="absolute bottom-16 left-0 right-0 px-5 pb-4 pt-12 bg-gradient-to-t from-black/70 to-transparent pointer-events-none">
          <p className="text-white text-sm text-center font-medium leading-relaxed">{currentStory.caption}</p>
        </div>
      )}

      {/* Like button (non-own stories) */}
      {!isOwn && (
        <div className="absolute bottom-6 right-5 z-20 flex flex-col items-center gap-1" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}>
          <button
            onClick={(e) => { e.stopPropagation(); toggleLike(); }}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-90"
            aria-label={isLiked ? "Unlike" : "Like"}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill={isLiked ? "#ef4444" : "none"} stroke={isLiked ? "#ef4444" : "white"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
          </button>
          {likeCount > 0 && (
            <span className="text-white text-xs font-bold drop-shadow-md">{likeCount}</span>
          )}
        </div>
      )}

      {/* Views + Likes bar (own story) */}
      {isOwn && (
        <div className="absolute bottom-0 left-0 right-0 z-20" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
          {/* Viewers drawer */}
          {viewersOpen && (
            <div className="bg-white/10 backdrop-blur-md mx-3 mb-2 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <p className="text-white font-semibold text-sm">Viewers · {viewers.length}</p>
                <button onClick={() => setViewersOpen(false)} className="text-white/70 hover:text-white">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {viewersLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                ) : viewers.length === 0 ? (
                  <p className="text-white/50 text-sm text-center py-4">No views yet</p>
                ) : (
                  viewers.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-white/20">
                        {v.image ? (
                          <img src={v.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-white text-xs font-bold">{(v.name || "?")[0].toUpperCase()}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{v.name || "User"}</p>
                        <p className="text-white/50 text-[11px]">{timeAgo(v.viewedAt)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          {/* Likers drawer */}
          {likersOpen && (
            <div className="bg-white/10 backdrop-blur-md mx-3 mb-2 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <p className="text-white font-semibold text-sm">❤️ Likes · {likeCount}</p>
                <button onClick={() => setLikersOpen(false)} className="text-white/70 hover:text-white">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {likersLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                ) : likers.length === 0 ? (
                  <p className="text-white/50 text-sm text-center py-4">No likes yet</p>
                ) : (
                  likers.map((l) => (
                    <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-white/20">
                        {l.image ? (
                          <img src={l.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-white text-xs font-bold">{(l.name || "?")[0].toUpperCase()}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{l.name || "User"}</p>
                        <p className="text-white/50 text-[11px]">{timeAgo(l.likedAt)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* View count + like count pills */}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => { setLikersOpen(false); setViewersOpen((o) => !o); }}
              className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-2 hover:bg-white/25 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span className="text-white text-sm font-semibold">{viewersLoading ? "…" : viewers.length} view{viewers.length !== 1 ? "s" : ""}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" style={{ transform: viewersOpen ? "rotate(180deg)" : undefined, transition: "transform 0.2s" }}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <button
              onClick={() => { setViewersOpen(false); setLikersOpen((o) => !o); }}
              className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-4 py-2 hover:bg-white/25 transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
              </svg>
              <span className="text-white text-sm font-semibold">{likeCount}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" style={{ transform: likersOpen ? "rotate(180deg)" : undefined, transition: "transform 0.2s" }}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Create Story Modal ─── */
// Imported from @/components/shared/CreateStoryModal

/* ─── Image Lightbox ─── */
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-modal-backdrop" onClick={onClose}>
      <div className="absolute inset-0 bg-black/90" />
      <button onClick={onClose} className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <img src={src} alt="" className="relative max-w-[95vw] max-h-[90vh] object-contain rounded-lg animate-modal-slide-up" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

/* ─── Main Feed Page ─── */
export default function FeedPage() {
  const { data: session, status } = useSession();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [feedPets, setFeedPets] = useState<FeedPet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sharePost, setSharePost] = useState<FeedPost | null>(null);
  const [likingPost, setLikingPost] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
  const [emojiPickerPostId, setEmojiPickerPostId] = useState<string | null>(null);
  const commentInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const FEED_EMOJIS = ["😍","🐾","🐶","🐱","🐰","🐹","🐻","🦊","🐼","🐨","🐸","🐯","🦁","🐧","🦜","🐠","🐢","🦋","🌟","❤️","🧡","💛","💚","💙","💜","🎉","🙌","👏","😂","😭","😊","😎","🥰","🤩","😅","🙏","👍","🔥","✨","💯"];

  function insertFeedEmoji(postId: string, emoji: string) {
    const input = commentInputRefs.current[postId];
    const prev = commentTexts[postId] || "";
    if (!input) {
      setCommentTexts((t) => ({ ...t, [postId]: (prev + emoji).slice(0, 500) }));
      return;
    }
    const start = input.selectionStart ?? prev.length;
    const end = input.selectionEnd ?? prev.length;
    const next = (prev.slice(0, start) + emoji + prev.slice(end)).slice(0, 500);
    setCommentTexts((t) => ({ ...t, [postId]: next }));
    requestAnimationFrame(() => {
      input.focus();
      const pos = Math.min(start + emoji.length, 500);
      input.setSelectionRange(pos, pos);
    });
  }
  const [followingUser, setFollowingUser] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [doubleTapHeart, setDoubleTapHeart] = useState<string | null>(null);
  const [likesModalPostId, setLikesModalPostId] = useState<string | null>(null);
  const [reactionPickerPostId, setReactionPickerPostId] = useState<string | null>(null);
  const reactionHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [voteBalance, setVoteBalance] = useState<{ free: number; paid: number } | null>(null);
  const [votingStreakDays, setVotingStreakDays] = useState(0);
  const lastTapRef = useRef<Record<string, number>>({});
  const observerRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  // Stories state
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([]);
  const [viewerUserIdx, setViewerUserIdx] = useState<number | null>(null);
  const [showCreateStory, setShowCreateStory] = useState(false);

  const loadFeed = useCallback(async (cursor?: string) => {
    if (cursor) {
      if (loadingMoreRef.current) return; // guard against race condition
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const url = `/api/feed?limit=30${cursor ? `&cursor=${cursor}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (cursor) {
        const more: FeedPost[] = data.posts || [];
        setPosts((prev) => {
          const seenIds = new Set(prev.map((p) => p.id));
          return [...prev, ...more.filter((p) => !seenIds.has(p.id))];
        });
      } else {
        const fresh: FeedPost[] = data.posts || [];
        setPosts(rankPosts(fresh));
      }
      setNextCursor(data.nextCursor || null);
    } catch (e) {
      console.error("Feed load error:", e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const loadStories = useCallback(async () => {
    try {
      const res = await fetch("/api/stories");
      if (res.ok) setStoryUsers(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  // Fetch user's vote balance to show low-votes nudge in feed header
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/votes/remaining", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setVoteBalance({ free: data.freeVotesRemaining ?? 0, paid: data.paidVoteBalance ?? 0 });
          setVotingStreakDays(data.votingStreakDays ?? 0);
        }
      })
      .catch(() => {});
  }, [status]);

  // Fetch pets to show inline in feed (most recent, random shuffle so it feels fresh)
  useEffect(() => {
    fetch("/api/pets?limit=30&sort=recent")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.pets)) {
          const shuffled = [...data.pets].sort(() => Math.random() - 0.5);
          setFeedPets(shuffled);
        }
      })
      .catch((err) => console.error("[feed] pets fetch failed:", err));
  }, []);

  // Scroll to post from URL hash (e.g. from notification link)
  useEffect(() => {
    if (loading) return;
    const hash = window.location.hash;
    if (!hash.startsWith("#post-")) return;
    const postId = hash.replace("#post-", "");
    const el = document.getElementById(`post-${postId}`);
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-brand-400", "ring-offset-2");
        setTimeout(() => el.classList.remove("ring-2", "ring-brand-400", "ring-offset-2"), 3000);
      }, 300);
    }
  }, [loading]);

  // Infinite scroll
  useEffect(() => {
    if (!nextCursor || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextCursor) {
          loadFeed(nextCursor);
        }
      },
      { threshold: 0.5 }
    );
    const el = observerRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, [nextCursor, loadingMore, loadFeed]);

  async function toggleLike(post: FeedPost, reaction = "HEART") {
    if (likingPost || !session?.user) return;
    setLikingPost(post.id);
    try {
      const res = await fetch(`/api/users/${post.user.id}/posts/${post.id}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reaction }),
      });
      if (res.ok) {
        const { liked, reaction: newReaction, likeCount, reactions } = await res.json();
        setPosts((prev) => prev.map((p) =>
          p.id === post.id
            ? { ...p, isLiked: liked, myReaction: newReaction, likeCount, reactions: reactions ?? p.reactions }
            : p
        ));
      }
    } finally {
      setLikingPost(null);
    }
  }

  async function toggleCommentLike(post: FeedPost, comment: FeedComment) {
    if (!session?.user) return;
    // Optimistic update
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? {
              ...p,
              comments: p.comments.map((c) =>
                c.id === comment.id
                  ? { ...c, isLiked: !c.isLiked, likeCount: c.likeCount + (c.isLiked ? -1 : 1) }
                  : c
              ),
            }
          : p
      )
    );
    try {
      const res = await fetch(
        `/api/users/${post.user.id}/posts/${post.id}/comment/${comment.id}/like`,
        { method: "POST" }
      );
      if (res.ok) {
        const { liked, likeCount } = await res.json();
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? {
                  ...p,
                  comments: p.comments.map((c) =>
                    c.id === comment.id ? { ...c, isLiked: liked, likeCount } : c
                  ),
                }
              : p
          )
        );
      } else {
        // Revert on failure
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? {
                  ...p,
                  comments: p.comments.map((c) =>
                    c.id === comment.id
                      ? { ...c, isLiked: comment.isLiked, likeCount: comment.likeCount }
                      : c
                  ),
                }
              : p
          )
        );
      }
    } catch {
      // Revert on network failure
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? {
                ...p,
                comments: p.comments.map((c) =>
                  c.id === comment.id
                    ? { ...c, isLiked: comment.isLiked, likeCount: comment.likeCount }
                    : c
                ),
              }
            : p
        )
      );
    }
  }

  // Double-tap to like (Instagram-style)
  function handleDoubleTap(post: FeedPost) {
    if (!session?.user) return;
    const now = Date.now();
    const lastTap = lastTapRef.current[post.id] || 0;
    if (now - lastTap < 300) {
      // Double tap detected!
      if (!post.isLiked) toggleLike(post);
      setDoubleTapHeart(post.id);
      setTimeout(() => setDoubleTapHeart(null), 1000);
      lastTapRef.current[post.id] = 0;
    } else {
      lastTapRef.current[post.id] = now;
    }
  }

  async function submitComment(post: FeedPost) {
    const text = (commentTexts[post.id] || "").trim();
    if (!text || submittingComment || !session?.user) return;
    setSubmittingComment(post.id);
    try {
      const res = await fetch(`/api/users/${post.user.id}/posts/${post.id}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        const comment = await res.json();
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? {
                  ...p,
                  comments: [...p.comments, { ...comment, likeCount: 0, isLiked: false }],
                  commentCount: p.commentCount + 1,
                }
              : p
          )
        );
        setCommentTexts((prev) => ({ ...prev, [post.id]: "" }));
      }
    } finally {
      setSubmittingComment(null);
    }
  }

  async function toggleFollow(userId: string, currentlyFollowing: boolean) {
    if (followingUser || !session?.user) return;
    setFollowingUser(userId);
    try {
      const res = await fetch(`/api/users/${userId}/follow`, {
        method: currentlyFollowing ? "DELETE" : "POST",
      });
      if (res.ok) {
        setPosts((prev) =>
          prev.map((p) =>
            p.user.id === userId ? { ...p, isFollowing: !currentlyFollowing } : p
          )
        );
      }
    } finally {
      setFollowingUser(null);
    }
  }

  const isLoggedIn = status === "authenticated";
  const userId = session?.user ? (session.user as { id: string }).id : null;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="max-w-[600px] mx-auto px-4 sm:px-0 py-6 sm:py-8">
        {/* Stories-style header strip */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-extrabold text-surface-900 tracking-tight flex items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-500">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              Feed
            </h1>
            {isLoggedIn && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-bold shadow-md hover:shadow-lg hover:shadow-brand-500/25 transition-all active:scale-95"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                New Post
              </button>
            )}
          </div>

          {/* Quick action strip */}
          {isLoggedIn && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full flex items-center gap-3 px-5 py-4 bg-white rounded-2xl border border-surface-200/60 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-brand-100 to-brand-50 flex items-center justify-center flex-shrink-0 ring-2 ring-brand-200/50">
                {session?.user?.image ? (
                  <img src={session.user.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-brand-600">{(session?.user?.name || "U")[0].toUpperCase()}</span>
                )}
              </div>
              <span className="text-sm text-surface-400 flex-1 text-left group-hover:text-surface-500 transition-colors">
                What is your pet up to today? 🐶🐱✨
              </span>
              <div className="flex gap-2">
                <span className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </span>
              </div>
            </button>
          )}

          {!isLoggedIn && (
            <div className="bg-gradient-to-r from-brand-500 to-brand-600 rounded-2xl p-6 text-center shadow-lg">
              <h2 className="text-xl font-extrabold text-white mb-2">Join the Community! 🐾</h2>
              <p className="text-sm text-white/80 mb-4 max-w-sm mx-auto">
                Sign up to create posts, follow pet lovers, and interact with their content.
              </p>
              <div className="flex gap-3 justify-center">
                <Link href="/auth/signin" className="px-5 py-2.5 rounded-xl bg-white/20 text-white font-bold text-sm hover:bg-white/30 transition-colors backdrop-blur-sm">
                  Log in
                </Link>
                <Link href="/auth/signup" className="px-5 py-2.5 rounded-xl bg-white text-brand-600 font-bold text-sm hover:bg-brand-50 transition-colors shadow-md">
                  Sign up free
                </Link>
              </div>
            </div>
          )}

          {/* Voting streak badge */}
          {isLoggedIn && votingStreakDays >= 2 && (
            <div className="mt-3 flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200/60 rounded-xl">
              <span className="text-lg leading-none">🔥</span>
              <span className="text-sm font-bold text-orange-700">
                {votingStreakDays}-day voting streak!
              </span>
              <span className="text-xs text-orange-500 ml-auto">Keep it up!</span>
            </div>
          )}

          {/* Vote balance nudge — only when running low */}
          {isLoggedIn && voteBalance !== null && (voteBalance.free + voteBalance.paid) <= 3 && (
            <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-2xl animate-slide-up ${voteBalance.free + voteBalance.paid === 0 ? "bg-red-50 border border-red-200" : "bg-amber-50 border border-amber-200"}`}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span>{voteBalance.free + voteBalance.paid === 0 ? "🔥" : "⚠️"}</span>
                <span className={voteBalance.free + voteBalance.paid === 0 ? "text-red-700" : "text-amber-700"}>
                  {voteBalance.free + voteBalance.paid === 0
                    ? "You're out of votes!"
                    : `Only ${voteBalance.free + voteBalance.paid} vote${voteBalance.free + voteBalance.paid === 1 ? "" : "s"} left`}
                </span>
              </div>
              <Link
                href="/dashboard#votes"
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-colors ${voteBalance.free + voteBalance.paid === 0 ? "bg-red-500 hover:bg-red-600" : "bg-amber-500 hover:bg-amber-600"}`}
              >
                Buy Votes →
              </Link>
            </div>
          )}
        </div>

        {/* Suggested Users horizontal list */}
        {isLoggedIn && !loading && posts.length > 0 && (
          <SuggestedUsers />
        )}

        {/* Stories bar — show if there are stories or user is logged in */}
        {(storyUsers.length > 0 || isLoggedIn) && (
          <StoriesBar
            storyUsers={storyUsers}
            ownId={userId}
            ownImage={session?.user?.image}
            ownName={session?.user?.name}
            onOpenViewer={(idx) => setViewerUserIdx(idx)}
            onOpenCreate={() => setShowCreateStory(true)}
          />
        )}

        {/* Feed Posts */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-surface-200/60 overflow-hidden animate-pulse">
                <div className="flex items-center gap-3 px-5 py-4">
                  <div className="w-10 h-10 rounded-full bg-surface-200" />
                  <div className="flex-1">
                    <div className="w-24 h-3 bg-surface-200 rounded-full mb-2" />
                    <div className="w-16 h-2 bg-surface-100 rounded-full" />
                  </div>
                </div>
                <div className="px-5 pb-4">
                  <div className="w-full h-3 bg-surface-100 rounded-full mb-2" />
                  <div className="w-3/4 h-3 bg-surface-100 rounded-full" />
                </div>
                <div className="h-48 bg-surface-100" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          feedPets.length > 0 ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-brand-100 bg-brand-50/40 px-4 py-3 text-sm text-surface-600">
                <span className="font-semibold text-brand-700">No posts yet.</span> Meanwhile, here are some pets from the community 👇
              </div>
              {feedPets.map((pet) => (
                <PetCard key={pet.id} pet={pet} />
              ))}
            </div>
          ) : (
          <div className="text-center py-20 bg-white rounded-2xl border border-surface-200/60 shadow-sm">
            <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-brand-50 flex items-center justify-center">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2EC4B6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </div>
            <h3 className="text-xl font-bold text-surface-900 mb-2">Feed is empty</h3>
            <p className="text-sm text-surface-500 mb-6 max-w-xs mx-auto">
              Be the first to share something! Post updates about your pets and connect with other pet lovers.
            </p>
            {isLoggedIn ? (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-500 text-white font-bold text-sm hover:bg-brand-600 transition-colors shadow-md"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Create your first post
              </button>
            ) : (
              <Link href="/auth/signup" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-500 text-white font-bold text-sm hover:bg-brand-600 transition-colors shadow-md">
                Sign up to get started
              </Link>
            )}
          </div>
          )
        ) : (
          <div className="space-y-4">
            {posts.map((post, i) => (
              <React.Fragment key={post.id}>
                <article
                  id={`post-${post.id}`}
                  className="bg-white rounded-2xl border border-surface-200/60 shadow-sm overflow-hidden hover:shadow-md transition-all animate-profile-slide-up"
                  style={{ animationDelay: `${Math.min(i, 5) * 60}ms` }}
                >
                {/* Post Header */}
                <div className="flex items-center justify-between px-5 pt-4 pb-3">
                  <Link href={`/users/${post.user.id}`} className="flex items-center gap-3 group">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-brand-100 to-brand-50 flex items-center justify-center flex-shrink-0 ring-2 ring-surface-200/60 group-hover:ring-brand-300 transition-all">
                      {post.user.image ? (
                        <img src={post.user.image} alt={post.user.name || ""} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-bold bg-gradient-to-br from-brand-500 to-brand-600 bg-clip-text text-transparent">
                          {post.user.name?.[0]?.toUpperCase() || "?"}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-surface-900 group-hover:text-brand-600 transition-colors">
                        {formatUserName(post.user.name)}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-surface-400">{timeAgo(post.createdAt)}</span>
                        {post.isFollowing && (
                          <span className="text-[10px] font-bold text-brand-500 bg-brand-50 px-1.5 py-0.5 rounded-full border border-brand-100">Following</span>
                        )}
                        {post.user.city && (
                          <span className="text-[11px] text-surface-400 flex items-center gap-0.5">
                            · 📍 {post.user.city}{post.user.state ? `, ${post.user.state}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>

                  {/* Follow button */}
                  {isLoggedIn && !post.isOwnPost && (
                    <button
                      onClick={() => toggleFollow(post.user.id, post.isFollowing)}
                      disabled={followingUser === post.user.id}
                      className={`text-xs font-bold px-3.5 py-1.5 rounded-full transition-all active:scale-95 ${
                        post.isFollowing
                          ? "bg-surface-100 text-surface-600 hover:bg-red-50 hover:text-red-500 border border-surface-200"
                          : "bg-brand-50 text-brand-600 hover:bg-brand-100 border border-brand-200/60"
                      }`}
                    >
                      {post.isFollowing ? "Following" : "Follow"}
                    </button>
                  )}
                </div>

                {/* Post Content */}
                <div className="px-5 pb-3">
                  <ExpandableText text={post.content} />
                </div>

                {/* Post Media — single image/video or multi-item carousel */}
                {post.imageUrl && (() => {
                  const media = parseMedia(post.imageUrl);
                  if (media.length === 0) return null;
                  if (media.length === 1) {
                    const url = media[0];
                    return (
                      <div
                        className="border-t border-b border-surface-100 relative cursor-pointer group/img bg-black"
                        onClick={() => handleDoubleTap(post)}
                      >
                        {isVideo(url) ? (
                          <video
                            src={url}
                            className="w-full block max-h-[600px] object-contain"
                            controls
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <img
                            src={url}
                            alt="Post"
                            className="w-full block max-h-[600px] object-contain transition-opacity duration-300"
                            loading="lazy"
                          />
                        )}
                        {doubleTapHeart === post.id && (
                          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                            <svg width="80" height="80" viewBox="0 0 24 24" fill="white" className="drop-shadow-2xl animate-[heart-pop_0.6s_ease-out_forwards]">
                              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                            </svg>
                          </div>
                        )}
                        {!isVideo(url) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setLightboxUrl(url); }}
                            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity backdrop-blur-sm"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                          </button>
                        )}
                      </div>
                    );
                  }
                  // Multiple media items — interactive carousel with prev/next + swipe
                  return (
                    <MediaCarousel
                      media={media}
                      onLightbox={setLightboxUrl}
                      doubleTapHeart={doubleTapHeart}
                      postId={post.id}
                      onDoubleTap={() => handleDoubleTap(post)}
                    />
                  );
                })()}

                {/* Engagement Stats Bar */}
                {(post.likeCount > 0 || post.commentCount > 0) && (
                  <div className="flex items-center justify-between px-5 py-2 text-xs text-surface-400">
                    {post.likeCount > 0 && (
                      <button
                        onClick={() => setLikesModalPostId(post.id)}
                        className="flex items-center gap-1 hover:text-surface-600 transition-colors"
                      >
                        <span className="flex -space-x-0.5">
                          {post.reactions.HEART > 0 && <span className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[9px]">❤️</span>}
                          {post.reactions.HAHA > 0 && <span className="w-4 h-4 rounded-full bg-yellow-400 flex items-center justify-center text-[9px]">😂</span>}
                          {post.reactions.WOW > 0 && <span className="w-4 h-4 rounded-full bg-blue-400 flex items-center justify-center text-[9px]">😮</span>}
                          {post.reactions.HEART === 0 && post.reactions.HAHA === 0 && post.reactions.WOW === 0 && (
                            <span className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                            </span>
                          )}
                        </span>
                        {post.likeCount} {post.likeCount === 1 ? "like" : "likes"}
                      </button>
                    )}
                    {post.commentCount > 0 && (
                      <button
                        onClick={() => setExpandedComments((s) => { const n = new Set(s); n.has(post.id) ? n.delete(post.id) : n.add(post.id); return n; })}
                        className="hover:text-surface-600 transition-colors"
                      >
                        {post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}
                      </button>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="grid grid-cols-3 border-t border-surface-100">
                  {/* Reaction Button with picker */}
                  <div className="relative">
                    {/* Reaction picker popup */}
                    {reactionPickerPostId === post.id && isLoggedIn && (
                      <div
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex items-center gap-1 px-2 py-1.5 bg-white rounded-full shadow-xl border border-surface-200 z-20 animate-[heart-pop_0.2s_ease-out]"
                        onMouseEnter={() => {
                          if (reactionHoverTimerRef.current) clearTimeout(reactionHoverTimerRef.current);
                        }}
                        onMouseLeave={() => {
                          reactionHoverTimerRef.current = setTimeout(() => setReactionPickerPostId(null), 200);
                        }}
                      >
                        {(["HEART", "HAHA", "WOW"] as const).map((r) => (
                          <button
                            key={r}
                            onClick={() => { setReactionPickerPostId(null); toggleLike(post, r); }}
                            className={`w-9 h-9 rounded-full flex items-center justify-center text-xl transition-transform hover:scale-125 active:scale-95 ${post.myReaction === r ? "bg-surface-100 ring-2 ring-brand-400" : "hover:bg-surface-50"}`}
                            title={r === "HEART" ? "Love" : r === "HAHA" ? "Haha" : "Wow"}
                          >
                            {r === "HEART" ? "❤️" : r === "HAHA" ? "😂" : "😮"}
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => isLoggedIn ? toggleLike(post, post.myReaction || "HEART") : undefined}
                      onMouseEnter={() => {
                        if (!isLoggedIn) return;
                        if (reactionHoverTimerRef.current) clearTimeout(reactionHoverTimerRef.current);
                        reactionHoverTimerRef.current = setTimeout(() => setReactionPickerPostId(post.id), 400);
                      }}
                      onMouseLeave={() => {
                        if (reactionHoverTimerRef.current) clearTimeout(reactionHoverTimerRef.current);
                        reactionHoverTimerRef.current = setTimeout(() => setReactionPickerPostId(null), 300);
                      }}
                      onTouchStart={() => {
                        if (!isLoggedIn) return;
                        longPressTimerRef.current = setTimeout(() => setReactionPickerPostId(post.id), 500);
                      }}
                      onTouchEnd={() => {
                        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                      }}
                      disabled={likingPost === post.id || !isLoggedIn}
                      className={`w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all active:scale-95 ${
                        post.isLiked
                          ? post.myReaction === "HAHA"
                            ? "text-yellow-500"
                            : post.myReaction === "WOW"
                            ? "text-blue-500"
                            : "text-red-500"
                          : "text-surface-500 hover:text-red-400 hover:bg-red-50/50"
                      } disabled:opacity-60`}
                    >
                      {post.isLiked ? (
                        <span className="text-base leading-none">
                          {post.myReaction === "HAHA" ? "😂" : post.myReaction === "WOW" ? "😮" : "❤️"}
                        </span>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                        </svg>
                      )}
                      {post.isLiked
                        ? post.myReaction === "HAHA"
                          ? "Haha"
                          : post.myReaction === "WOW"
                          ? "Wow"
                          : "Liked"
                        : "Like"}
                    </button>
                  </div>
                  <button
                    onClick={() => setExpandedComments((s) => { const n = new Set(s); n.has(post.id) ? n.delete(post.id) : n.add(post.id); return n; })}
                    className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-surface-500 hover:text-brand-500 hover:bg-brand-50/50 transition-all"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                    Comment
                  </button>
                  <button
                    onClick={() => setSharePost(post)}
                    className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-surface-500 hover:text-emerald-500 hover:bg-emerald-50/50 transition-all"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                    </svg>
                    Share
                  </button>
                </div>

                {/* Comments Section */}
                {expandedComments.has(post.id) && (
                  <div className="border-t border-surface-100 px-5 pb-4 pt-3 space-y-3 bg-surface-50/30">
                    {post.comments.map((c) => (
                      <div key={c.id} className="flex gap-2.5">
                        <Link href={`/users/${c.user.id}`} className="w-8 h-8 rounded-full overflow-hidden bg-surface-100 flex-shrink-0 flex items-center justify-center">
                          {c.user.image ? (
                            <img src={c.user.image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs font-bold text-surface-500">{c.user.name?.[0]?.toUpperCase() || "?"}</span>
                          )}
                        </Link>
                        <div className="flex-1">
                          <div className="bg-white rounded-2xl px-3 py-2 border border-surface-100">
                            <div className="flex items-baseline gap-2">
                              <Link href={`/users/${c.user.id}`} className="text-xs font-bold text-surface-800 hover:text-brand-600 transition-colors">{formatUserName(c.user.name)}</Link>
                              <span className="text-[10px] text-surface-400">{timeAgo(c.createdAt)}</span>
                            </div>
                            <p className="text-xs text-surface-700 mt-0.5 leading-relaxed whitespace-pre-wrap">{c.content}</p>
                          </div>
                          <div className="mt-1 ml-3 flex items-center gap-3">
                            {isLoggedIn && (
                              <button
                                onClick={() => toggleCommentLike(post, c)}
                                className={`inline-flex items-center gap-1 text-[11px] font-semibold transition-all active:scale-95 ${
                                  c.isLiked ? "text-red-500" : "text-surface-400 hover:text-red-400"
                                }`}
                                aria-label={c.isLiked ? "Unlike comment" : "Like comment"}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill={c.isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                                </svg>
                                {c.likeCount > 0 ? c.likeCount : "Like"}
                              </button>
                            )}
                            {!isLoggedIn && c.likeCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-surface-400">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>
                                {c.likeCount}
                              </span>
                            )}
                            {isLoggedIn && (
                              <button
                                onClick={() => {
                                  const mention = `@${(c.user.name || "").split(" ")[0]} `;
                                  setCommentTexts((prev) => ({ ...prev, [post.id]: mention }));
                                  setEmojiPickerPostId(null);
                                  // ensure comments expanded then focus input
                                  setExpandedComments((s) => { const n = new Set(s); n.add(post.id); return n; });
                                  requestAnimationFrame(() => {
                                    const input = commentInputRefs.current[post.id];
                                    if (input) { input.focus(); input.setSelectionRange(mention.length, mention.length); }
                                  });
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-surface-400 hover:text-brand-500 transition-colors"
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/>
                                </svg>
                                Reply
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Comment input */}
                    {isLoggedIn && (
                      <div className="flex gap-2 items-end pt-1">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-brand-50 flex-shrink-0 flex items-center justify-center">
                          {session?.user?.image ? (
                            <img src={session.user.image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs font-bold text-brand-600">{(session?.user?.name || "U")[0].toUpperCase()}</span>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex gap-2 items-center bg-white rounded-full border border-surface-200 pl-3 pr-1 py-1 focus-within:ring-2 focus-within:ring-brand-400/30 focus-within:border-brand-300 transition-all">
                            <button
                              type="button"
                              onClick={() => setEmojiPickerPostId((id) => id === post.id ? null : post.id)}
                              className="text-base leading-none flex-shrink-0 hover:scale-110 transition-transform"
                              title="Add emoji"
                            >😊</button>
                            <input
                              ref={(el) => { commentInputRefs.current[post.id] = el; }}
                              type="text"
                              value={commentTexts[post.id] || ""}
                              onChange={(e) => setCommentTexts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(post); setEmojiPickerPostId(null); } }}
                              placeholder="Write a comment..."
                              maxLength={500}
                              className="flex-1 text-surface-900 placeholder:text-surface-400 focus:outline-none bg-transparent py-1"
                              style={{ fontSize: '16px' }}
                            />
                            <button
                              onClick={() => { submitComment(post); setEmojiPickerPostId(null); }}
                              disabled={submittingComment === post.id || !(commentTexts[post.id] || "").trim()}
                              className="w-7 h-7 flex-shrink-0 rounded-full bg-brand-500 text-white flex items-center justify-center hover:bg-brand-600 transition-colors disabled:opacity-40"
                            >
                              {submittingComment === post.id ? (
                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                              )}
                            </button>
                          </div>
                          {emojiPickerPostId === post.id && (
                            <div className="mt-1.5 flex flex-wrap gap-0.5 p-2 rounded-2xl border border-surface-200 bg-white shadow-md">
                              {FEED_EMOJIS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => insertFeedEmoji(post.id, emoji)}
                                  className="text-lg w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-100 transition-colors"
                                >{emoji}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </article>
                {/* Insert a pet card after every 2nd post (cycles through feedPets so we never run out) */}
                {feedPets.length > 0 && (i + 1) % 2 === 0 && (
                  <PetCard pet={feedPets[(Math.floor((i + 1) / 2) - 1) % feedPets.length]} />
                )}
              </React.Fragment>
            ))}

            {/* Infinite scroll sentinel */}
            <div ref={observerRef} className="h-4" />

            {loadingMore && (
              <div className="flex justify-center py-6">
                <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!nextCursor && posts.length > 0 && (
              <>
                <div className="text-center py-10">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-surface-100 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="16 12 12 8 8 12"/><line x1="12" y1="16" x2="12" y2="8"/>
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-surface-500">You&apos;re all caught up!</p>
                  <p className="text-xs text-surface-400 mt-1">You&apos;ve seen all the latest posts.</p>
                </div>

                {/* After "caught up" — keep the feed alive with more pets */}
                {feedPets.length > 0 && (
                  <>
                    <div className="rounded-xl border border-brand-100 bg-brand-50/40 px-4 py-3 text-sm text-surface-600 mb-4">
                      <span className="font-semibold text-brand-700">Discover more pets</span> — give them some love 🐾
                    </div>
                    {feedPets.map((pet) => (
                      <PetCard key={`tail-${pet.id}`} pet={pet} />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreatePostModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(post) => setPosts((prev) => [post, ...prev])}
        />
      )}
      {sharePost && <ShareModal post={sharePost} onClose={() => setSharePost(null)} />}
      {lightboxUrl && <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      {likesModalPostId && (() => {
        const p = posts.find((x) => x.id === likesModalPostId);
        return p ? <LikesModal postId={p.id} postUserId={p.user.id} onClose={() => setLikesModalPostId(null)} /> : null;
      })()}
      {viewerUserIdx !== null && storyUsers.length > 0 && (
        <StoryViewer
          storyUsers={storyUsers}
          initialUserIdx={viewerUserIdx}
          ownId={userId}
          onClose={() => setViewerUserIdx(null)}
          onStoriesReload={loadStories}
          onAddStory={() => setShowCreateStory(true)}
        />
      )}
      {showCreateStory && (
        <CreateStoryModal
          onClose={() => setShowCreateStory(false)}
          onCreated={loadStories}
        />
      )}
    </div>
  );
}
