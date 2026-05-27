"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface CreateStoryModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateStoryModal({ onClose, onCreated }: CreateStoryModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [vvBottom, setVvBottom] = useState(0);
  const [vvMaxH, setVvMaxH] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function update() {
      const v = vv as VisualViewport;
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

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  async function handlePost() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("photos", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || "Upload failed");
      }
      const uploadData = await uploadRes.json();
      const mediaUrl: string = uploadData.urls?.[0] || uploadData.url;
      const isVideo = file.type.startsWith("video/");
      const storyRes = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaUrl,
          mediaType: isVideo ? "video" : "image",
          caption: caption.trim() || null,
        }),
      });
      if (!storyRes.ok) throw new Error("Failed to create story");
      onCreated();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setUploading(false);
    }
  }

  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center sm:justify-center animate-modal-backdrop"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden animate-modal-slide-up"
        style={
          isMobile
            ? {
                bottom: `${vvBottom}px`,
                maxHeight: vvMaxH ? `${vvMaxH}px` : "88svh",
                position: "fixed",
                left: 0,
                right: 0,
              }
            : { maxHeight: "min(640px, 90vh)" }
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-surface-100">
          <h3 className="text-lg font-bold text-surface-900">Create Story</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface-100 flex items-center justify-center transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: "inherit" }}>
          {preview ? (
            <div
              className="relative rounded-2xl overflow-hidden bg-black"
              style={{ aspectRatio: "9/16", maxHeight: "50dvh" }}
            >
              {file?.type.startsWith("video/") ? (
                <video src={preview} className="w-full h-full object-contain" controls />
              ) : (
                <img src={preview} alt="" className="w-full h-full object-contain" />
              )}
              <button
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ) : (
            /* Two-button upload area */
            <div className="grid grid-cols-2 gap-3">
              {/* Gallery */}
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2.5 py-8 rounded-2xl border-2 border-dashed border-surface-200 hover:border-brand-300 hover:bg-brand-50/30 transition-colors"
              >
                <div className="w-11 h-11 rounded-full bg-brand-50 flex items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-surface-700">Gallery</p>
                  <p className="text-[10px] text-surface-400 mt-0.5">Photo / Video</p>
                </div>
              </button>

              {/* Camera */}
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2.5 py-8 rounded-2xl border-2 border-dashed border-surface-200 hover:border-brand-300 hover:bg-brand-50/30 transition-colors"
              >
                <div className="w-11 h-11 rounded-full bg-brand-50 flex items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-surface-700">Camera</p>
                  <p className="text-[10px] text-surface-400 mt-0.5">Take a photo</p>
                </div>
              </button>
            </div>
          )}

          {/* Hidden inputs */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={onFileChange}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            className="hidden"
            onChange={onFileChange}
          />

          <input
            type="text"
            placeholder="Add a caption… (optional)"
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 200))}
            className="w-full px-4 py-3 bg-surface-50 rounded-xl border border-surface-200 text-sm text-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            style={{ fontSize: "16px" }}
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            onClick={handlePost}
            disabled={!file || uploading}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 text-white font-bold text-sm shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {uploading ? "Posting…" : "Share Story ✨"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
