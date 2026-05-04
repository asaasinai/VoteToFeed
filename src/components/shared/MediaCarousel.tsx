"use client";

import { useState, useRef } from "react";

function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov|ogg|avi)(\?.*)?$/i.test(url);
}

export function MediaCarousel({
  media,
  onLightbox,
  doubleTapHeart,
  postId,
  onDoubleTap,
}: {
  media: string[];
  onLightbox?: (url: string) => void;
  doubleTapHeart?: string | null;
  postId?: string;
  onDoubleTap?: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  function prev() { setIdx((i) => Math.max(0, i - 1)); }
  function next() { setIdx((i) => Math.min(media.length - 1, i + 1)); }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0) next(); else prev();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }

  const url = media[idx];
  return (
    <div
      className="border-t border-b border-surface-100 relative select-none overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={onDoubleTap}
    >
      {/* Media item */}
      <div className="relative bg-black">
        {isVideo(url) ? (
          <video
            src={url}
            className="w-full block max-h-[600px] object-contain"
            controls
            playsInline
            preload="metadata"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <img
            src={url}
            alt={`Media ${idx + 1}`}
            className="w-full block max-h-[600px] object-contain"
            loading="lazy"
            onClick={(e) => { e.stopPropagation(); onLightbox?.(url); }}
          />
        )}

        {/* Double-tap heart */}
        {doubleTapHeart && postId && doubleTapHeart === postId && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="white" className="drop-shadow-2xl animate-[heart-pop_0.6s_ease-out_forwards]">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
          </div>
        )}

        {/* Counter badge */}
        <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] font-bold pointer-events-none">
          {idx + 1}/{media.length}
        </span>
      </div>

      {/* Prev arrow */}
      {idx > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); prev(); }}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center transition-all backdrop-blur-sm z-10"
          aria-label="Previous"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      )}
      {/* Next arrow */}
      {idx < media.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); next(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center transition-all backdrop-blur-sm z-10"
          aria-label="Next"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      )}

      {/* Dot indicators */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none">
        {media.map((_, mi) => (
          <span key={mi} className={`rounded-full transition-all ${mi === idx ? "w-4 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/50"}`} />
        ))}
      </div>
    </div>
  );
}
