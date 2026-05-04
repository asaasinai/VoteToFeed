"use client";

import { useState, useCallback, memo } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatVotes, cn } from "@/lib/utils";

type PetCardProps = {
  id: string;
  name: string;
  ownerName: string;
  state?: string | null;
  photos: string[];
  type: string;
  weeklyVotes: number;
  weeklyRank?: number | null;
  isNew?: boolean;
  animalType?: string;
};

// Reliable fallback images (placekitten/placedog are unreliable)
const FALLBACK_IMAGES = {
  DOG: "https://images.dog.ceo/breeds/labrador/n02099712_365.jpg",
  CAT: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&h=600&fit=crop",
  DEFAULT: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&h=600&fit=crop",
};

function rankSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getFallbackImage(type: string): string {
  if (type === "DOG") return FALLBACK_IMAGES.DOG;
  if (type === "CAT") return FALLBACK_IMAGES.CAT;
  return FALLBACK_IMAGES.DEFAULT;
}

function isUnsupportedImageFormat(src?: string | null): boolean {
  return !!src && /\.hei[cf](?:$|[?#])/i.test(src);
}

// Generate a consistent color for a pet based on its ID
function getPetPlaceholderColor(petId: string): string {
  const colors = [
    "bg-blue-400",
    "bg-purple-400",
    "bg-pink-400",
    "bg-orange-400",
    "bg-green-400",
    "bg-red-400",
    "bg-indigo-400",
    "bg-teal-400",
    "bg-cyan-400",
    "bg-amber-400",
  ];
  let hash = 0;
  for (let i = 0; i < petId.length; i++) {
    hash = ((hash << 5) - hash) + petId.charCodeAt(i);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Get initials from pet name
function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function PetCard(props: PetCardProps) {
  return <PetCardInner {...props} />;
}

const PetCardInner = memo(function PetCardInner({
  id,
  name,
  ownerName,
  state,
  photos,
  type,
  weeklyVotes,
  weeklyRank,
  isNew,
}: PetCardProps) {
  const [imgError, setImgError] = useState(false);
  const [fallbackError, setFallbackError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const photo = photos[0];
  const hasPhoto = photo && photo.trim().length > 0 && !isUnsupportedImageFormat(photo);
  // Only show placeholder if no photo AND fallback also failed
  const showPlaceholder = (!hasPhoto && fallbackError) || (imgError && fallbackError);
  const placeholderColor = getPetPlaceholderColor(id);
  const initials = getInitials(name);
  const fallbackSrc = getFallbackImage(type);

  // Determine what image src to use
  const imageSrc = hasPhoto && !imgError ? photo : (!fallbackError ? fallbackSrc : null);

  // Handle cached images: if img is already loaded when ref attaches, mark as loaded
  const imgRef = useCallback((node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth > 0 && node.naturalHeight > 0) {
      setImgLoaded(true);
    }
  }, []);

  return (
    <Link href={`/pets/${id}`} className="group block overflow-hidden rounded-2xl relative shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5">
      <div className="aspect-[4/5] relative bg-surface-100 overflow-hidden rounded-2xl">
        {/* Loading skeleton */}
        {imageSrc && !imgLoaded && !showPlaceholder && (
          <div className="absolute inset-0 bg-surface-200 animate-pulse" />
        )}

        {imageSrc ? (
          <Image
            ref={imgRef}
            src={imageSrc}
            alt={name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
            className={`object-cover object-center group-hover:scale-105 transition-all duration-500 ease-out ${
              imgLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              if (img.naturalWidth === 0 || img.naturalHeight === 0) {
                if (hasPhoto && !imgError) {
                  setImgError(true);
                } else {
                  setFallbackError(true);
                }
                return;
              }
              setImgLoaded(true);
            }}
            onError={() => {
              if (hasPhoto && !imgError) {
                setImgError(true);
              } else {
                setFallbackError(true);
              }
            }}
          />
        ) : null}

        {/* Placeholder */}
        {showPlaceholder && (
          <div className={cn("w-full h-full flex flex-col items-center justify-center", placeholderColor)}>
            <span className="text-4xl font-bold text-white opacity-80 mb-2">{initials}</span>
            <span className="text-xs font-medium text-white opacity-70">Photo Pending</span>
          </div>
        )}

        {/* Strong gradient overlay */}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        {/* Top-left: New badge */}
        {isNew && (
          <div className="absolute top-2.5 left-2.5">
            <span className="badge-new text-[10px] px-2 py-0.5">New</span>
          </div>
        )}

        {/* Top-right: Rank badge for ALL positions */}
        {weeklyRank != null && (
          <div className={cn(
            "absolute top-2.5 right-2.5 min-w-[28px] h-7 px-1.5 rounded-full flex items-center justify-center text-xs font-extrabold shadow-md border-2 border-white/80",
            weeklyRank === 1 && "bg-gradient-to-br from-yellow-400 to-amber-500 text-yellow-900 shadow-amber-300/60 shadow-lg",
            weeklyRank === 2 && "bg-gradient-to-br from-slate-300 to-slate-400 text-slate-800",
            weeklyRank === 3 && "bg-gradient-to-br from-orange-300 to-amber-400 text-orange-900",
            weeklyRank > 3 && "bg-black/50 backdrop-blur-sm text-white border-white/30",
          )}>
            {weeklyRank === 1 ? "🥇" : weeklyRank === 2 ? "🥈" : weeklyRank === 3 ? "🥉" : `#${weeklyRank}`}
          </div>
        )}

        {/* Bottom info overlay */}
        <div className="absolute bottom-0 inset-x-0 px-3 pb-3 pt-6">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-extrabold text-white text-sm leading-tight drop-shadow truncate">{name}</h3>
              <p className="text-white/60 text-[11px] mt-0.5 truncate">{ownerName}{state ? ` · ${state}` : ""}</p>
            </div>
            <div className={cn(
              "shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 shadow-sm text-sm font-bold",
              weeklyVotes > 0 ? "bg-white/95 text-surface-900" : "bg-white/40 text-white"
            )}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className={weeklyVotes > 0 ? "text-brand-500" : "text-white/80"}>
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor"/>
              </svg>
              <span>{formatVotes(weeklyVotes)}</span>
            </div>
          </div>
        </div>

        {/* Gold glow ring for #1 */}
        {weeklyRank === 1 && (
          <div className="absolute inset-0 rounded-2xl ring-2 ring-yellow-400/60 pointer-events-none" />
        )}
      </div>
    </Link>
  );
});
