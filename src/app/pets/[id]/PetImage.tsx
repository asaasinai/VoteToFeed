"use client";

import { useState } from "react";

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

/**
 * Generate a deterministic but pseudo-random fallback image URL based on pet ID
 * This ensures the same pet always gets the same fallback, but different pets get variety
 */
function generateFallbackImage(petId: string, petType: string): string {
  // Create a simple hash from petId to get a number between 0-1
  let hash = 0;
  for (let i = 0; i < petId.length; i++) {
    const char = petId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  const randomSeed = Math.abs(hash) % 100; // Get number 0-99
  
  if (petType === "DOG") {
    // Use different dog breeds based on hash
    const dogBreeds = [
      "labrador",
      "golden-retriever",
      "german-shepherd",
      "bulldog",
      "poodle",
      "rottweiler",
      "beagle",
      "dachshund",
      "husky",
      "boxer"
    ];
    const breed = dogBreeds[randomSeed % dogBreeds.length];
    return `https://placedog.net/600/600?${petId}`;
  } else {
    // Use random kitten for cats
    return `https://placekitten.com/600/600?${petId}`;
  }
}

export function PetImage({
  src,
  alt,
  className,
  petId,
  petType,
  fallback,
}: {
  src: string;
  alt: string;
  className?: string;
  petId?: string;
  petType?: string;
  fallback?: string;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Check if source is empty or missing
  const hasValidSource = src && src.trim().length > 0;
  
  // Use generated fallback if petId and petType are provided, otherwise use provided fallback
  const actualFallback = fallback || 
    (petId && petType ? generateFallbackImage(petId, petType) : undefined) ||
    "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&h=600&fit=crop";

  if (!hasValidSource && petId && petType) {
    // Show placeholder for missing photo
    const placeholderColor = getPetPlaceholderColor(petId);
    return (
      <div
        className={`${className} ${placeholderColor} flex items-center justify-center`}
      >
        <div className="text-center">
          <div className="text-5xl font-bold text-white opacity-70 mb-4">
            {alt.slice(0, 2).toUpperCase()}
          </div>
          <div className="text-sm font-medium text-white opacity-60">
            Photo Pending
          </div>
        </div>
      </div>
    );
  }

  return (
    <img
      src={hasValidSource ? src : actualFallback}
      alt={alt}
      className={className}
      onLoad={() => setImageLoaded(true)}
      onError={(e) => {
        const t = e.currentTarget;
        if (t.src !== actualFallback) {
          // Try fallback image
          t.src = actualFallback;
        } else {
          // Fallback failed too
          setHasError(true);
        }
      }}
    />
  );
}
