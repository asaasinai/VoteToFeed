"use client";

import { useCallback, useEffect, useState, useRef } from "react";

type ImageLightboxProps = {
  photos: string[];
  initialIndex: number;
  petName: string;
  onClose: () => void;
  /** Optional: show vote button in lightbox */
  petId?: string;
  weeklyVotes?: number;
  onVote?: () => Promise<{ success: boolean; newVoteCount?: number }>;
  canVote?: boolean;
  votesRemaining?: number;
};

export function ImageLightbox({
  photos,
  initialIndex,
  petName,
  onClose,
  petId,
  weeklyVotes,
  onVote,
  canVote = true,
  votesRemaining,
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const [voteCount, setVoteCount] = useState(weeklyVotes ?? 0);
  const [voting, setVoting] = useState(false);
  const [voteAnim, setVoteAnim] = useState(false);
  const [showHearts, setShowHearts] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Pre-generate heart positions so they don't shift on re-render
  const heartColors = ["#ef4444", "#f87171", "#ec4899", "#f472b6", "#fb7185", "#e11d48", "#ff6b81", "#ff4757"];
  const heartsRef = useRef(
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      x: 30 + Math.random() * 40,         // clustered center (30%-70%)
      delay: i * 0.1,                       // staggered 100ms apart
      size: 18 + Math.random() * 14,        // 18-32px, proportional
      color: heartColors[i % heartColors.length],
    }))
  );

  const hasMultiple = photos.length > 1;

  const goNext = useCallback(() => {
    if (!hasMultiple) return;
    setCurrentIndex((i) => (i + 1) % photos.length);
    setZoomed(false);
  }, [hasMultiple, photos.length]);

  const goPrev = useCallback(() => {
    if (!hasMultiple) return;
    setCurrentIndex((i) => (i - 1 + photos.length) % photos.length);
    setZoomed(false);
  }, [hasMultiple, photos.length]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, goNext, goPrev]);

  // Lock body scroll
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = originalOverflow; };
  }, []);

  // Swipe handling for mobile
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = e.touches[0].clientX;
  }

  function handleTouchMove(e: React.TouchEvent) {
    touchEndX.current = e.touches[0].clientX;
  }

  function handleTouchEnd() {
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50;
    if (Math.abs(diff) > threshold) {
      if (diff > 0) goNext();
      else goPrev();
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) {
      onClose();
    }
  }

  async function handleVote() {
    if (!onVote || voting) return;
    setVoting(true);
    try {
      const result = await onVote();
      if (result.success) {
        if (result.newVoteCount != null) setVoteCount(result.newVoteCount);
        else setVoteCount((c) => c + 1);
        // Regenerate random positions for each vote click
        heartsRef.current = Array.from({ length: 8 }, (_, i) => ({
          id: i + Date.now(),
          x: 30 + Math.random() * 40,
          delay: i * 0.1,
          size: 18 + Math.random() * 14,
          color: heartColors[i % heartColors.length],
        }));
        setVoteAnim(true);
        setShowHearts(true);
        setTimeout(() => setVoteAnim(false), 600);
        setTimeout(() => setShowHearts(false), 2200);
      }
    } catch {
      // handled by parent
    } finally {
      setVoting(false);
    }
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95"
      style={{ animation: "lightbox-fade-in 200ms ease-out" }}
    >
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-50 flex items-center justify-between px-4 py-3 sm:px-6 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-3">
          {hasMultiple && (
            <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-bold text-white backdrop-blur-sm">
              {currentIndex + 1} / {photos.length}
            </span>
          )}
          <h3 className="text-white font-bold text-base sm:text-lg truncate max-w-[200px] sm:max-w-none">{petName}</h3>
        </div>
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/50"
          aria-label="Close"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Prev button */}
      {hasMultiple && (
        <button
          onClick={goPrev}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-50 flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 sm:left-4"
          aria-label="Previous photo"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}

      {/* Main image area */}
      <div
        className="relative flex h-full w-full items-center justify-center px-12 pt-16 pb-28 sm:px-20 sm:pb-24"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Floating hearts animation */}
        {showHearts && (
          <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
            {heartsRef.current.map((h) => (
              <svg
                key={h.id}
                className="absolute animate-float-heart drop-shadow-lg"
                style={{
                  left: `${h.x}%`,
                  bottom: "18%",
                  animationDelay: `${h.delay}s`,
                  width: h.size,
                  height: h.size,
                }}
                viewBox="0 0 24 24"
                fill={h.color}
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            ))}
          </div>
        )}

        <img
          src={photos[currentIndex]}
          alt={`${petName} - photo ${currentIndex + 1}`}
          onClick={() => setZoomed((z) => !z)}
          className={`max-h-full max-w-full rounded-xl shadow-2xl transition-transform duration-300 select-none ${
            zoomed ? "cursor-zoom-out scale-150" : "cursor-zoom-in"
          }`}
          style={{ objectFit: "contain" }}
          draggable={false}
          onError={(e) => {
            const img = e.currentTarget;
            // Try a generic fallback if the photo URL is broken
            const fallback = "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&h=600&fit=crop";
            if (img.src !== fallback) {
              img.src = fallback;
            }
          }}
        />
      </div>

      {/* Next button */}
      {hasMultiple && (
        <button
          onClick={goNext}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-50 flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 sm:right-4"
          aria-label="Next photo"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}

      {/* Bottom bar with vote + thumbnails */}
      <div className="absolute bottom-0 inset-x-0 z-50 bg-gradient-to-t from-black/80 via-black/50 to-transparent pb-4 pt-10 px-4 sm:px-6">
        {/* Vote section */}
        {onVote && petId && (
          <div className="flex items-center justify-center gap-4 mb-3">
            <div className="flex items-center gap-2">
              <span className={`text-2xl sm:text-3xl font-black text-white tabular-nums transition-transform ${voteAnim ? "scale-125 text-red-400" : ""}`}>
                {voteCount.toLocaleString()}
              </span>
              <span className="text-sm text-white/70 font-medium">votes</span>
            </div>
            <button
              onClick={handleVote}
              disabled={voting || !canVote}
              className={`flex items-center gap-2 rounded-full px-6 py-2.5 sm:px-8 sm:py-3 font-bold text-sm sm:text-base transition-all shadow-lg ${
                canVote
                  ? "bg-red-500 text-white hover:bg-red-600 active:scale-95 hover:shadow-xl"
                  : "bg-white/20 text-white/60 cursor-not-allowed"
              } ${voting ? "opacity-70" : ""}`}
            >
              {voting ? (
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              )}
              {voting ? "Voting..." : "Vote"}
            </button>
            {votesRemaining != null && canVote && (
              <span className="text-xs text-white/50 font-medium hidden sm:block">
                {votesRemaining} left
              </span>
            )}
          </div>
        )}

        {/* Thumbnail strip */}
        {hasMultiple && (
          <div className="flex justify-center gap-1.5 sm:gap-2">
            {photos.map((url, i) => (
              <button
                key={`${url}-${i}`}
                onClick={() => { setCurrentIndex(i); setZoomed(false); }}
                className={`h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                  i === currentIndex
                    ? "border-white shadow-lg scale-110"
                    : "border-transparent opacity-50 hover:opacity-80"
                }`}
                aria-label={`View photo ${i + 1}`}
              >
                <img
                  src={url}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
