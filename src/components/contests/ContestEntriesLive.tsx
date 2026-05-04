"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { PetCard } from "@/components/pets/PetCard";
import { StorytellerEntry } from "@/components/contests/StorytellerEntry";
import { formatDisplayName } from "@/lib/utils";

type EntryData = {
  petId: string;
  story: string | null;
  pet: {
    id: string;
    name: string;
    photos: string[];
    type: string;
    ownerFirstName: string | null;
    ownerLastName: string | null;
    ownerName: string | null;
    state: string | null;
    createdAt: string; // ISO string
    bio: string | null;
  };
};

type Props = {
  contestId: string;
  initialEntries: EntryData[];
  initialVotes: Record<string, number>; // petId → votes
  isStoryteller: boolean;
  animalType: string;
  pollInterval?: number; // unused, kept for compat
};

export function ContestEntriesLive({
  contestId,
  initialEntries,
  initialVotes,
  isStoryteller,
  animalType,
  pollInterval = 10000,
}: Props) {
  const [voteMap, setVoteMap] = useState<Record<string, number>>(initialVotes);
  const [flashSet, setFlashSet] = useState<Set<string>>(new Set());
  const prevRef = useRef<Record<string, number>>(initialVotes);

  useEffect(() => {
    const limit = Math.min(200, initialEntries.length + 5);
    const es = new EventSource(`/api/contests/${contestId}/live?limit=${limit}`);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const entries: { id: string; votes: number }[] = data.entries ?? [];

        const next: Record<string, number> = { ...prevRef.current };
        const newFlash = new Set<string>();
        for (const entry of entries) {
          const prev = prevRef.current[entry.id] ?? 0;
          if (entry.votes !== prev) {
            newFlash.add(entry.id);
            next[entry.id] = entry.votes;
          }
        }
        prevRef.current = next;
        setVoteMap({ ...next });

        if (newFlash.size > 0) {
          setFlashSet(newFlash);
          setTimeout(() => setFlashSet(new Set()), 1500);
        }
      } catch { /* ignore */ }
    };

    return () => es.close();
  }, [contestId, initialEntries.length]);

  // Sort entries by current vote count (memoized — only recomputes when voteMap changes)
  const sorted = useMemo(
    () =>
      [...initialEntries].sort(
        (a, b) => (voteMap[b.petId] ?? 0) - (voteMap[a.petId] ?? 0)
      ),
    [initialEntries, voteMap]
  );

  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {sorted.map((entry, i) => {
        const isFlashing = flashSet.has(entry.pet.id);
        return (
          <div
            key={entry.pet.id}
            className={`flex flex-col gap-2 rounded-2xl transition-all duration-500 ${
              isFlashing ? "ring-2 ring-emerald-400/60 ring-offset-1 scale-[1.01]" : ""
            }`}
          >
            <PetCard
              id={entry.pet.id}
              name={entry.pet.name}
              ownerName={formatDisplayName(
                entry.pet.ownerFirstName,
                entry.pet.ownerLastName,
                entry.pet.ownerName
              )}
              state={entry.pet.state}
              photos={entry.pet.photos}
              type={entry.pet.type}
              weeklyVotes={voteMap[entry.petId] ?? 0}
              weeklyRank={i + 1}
              isNew={now - new Date(entry.pet.createdAt).getTime() < sevenDays}
              animalType={animalType}
            />
            <StorytellerEntry
              story={entry.story ?? null}
              bio={entry.pet.bio ?? null}
              isStoryteller={isStoryteller}
            />
          </div>
        );
      })}
    </div>
  );
}
