"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";

type VoteItem = {
  id: string;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
  pet: { id: string; name: string; photos: string[]; type: string };
};

export function VoteFeed() {
  const [votes, setVotes] = useState<VoteItem[]>([]);

  useEffect(() => {
    function fetchVotes() {
      fetch("/api/votes?limit=15")
        .then((res) => res.json())
        .then((data) => Array.isArray(data) && setVotes(data))
        .catch(() => {});
    }
    fetchVotes();
    const interval = setInterval(fetchVotes, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
        <h3 className="section-title text-sm">Live Activity</h3>
        <span className="flex items-center gap-1.5 text-xs text-surface-400">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse-subtle" />
          Live
        </span>
      </div>
      <ul className="divide-y divide-surface-50 max-h-[420px] overflow-y-auto hide-scrollbar">
        {votes.length === 0 ? (
          <li className="px-5 py-8 text-center text-sm text-surface-400">
            No votes yet this week. Be the first!
          </li>
        ) : (
          votes.map((v) => (
            <li key={v.id} className="animate-fade-in">
              <Link
                href={`/pets/${v.pet.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-surface-50 transition-colors"
              >
                {v.user.image ? (
                  <img src={v.user.image} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 ring-2 ring-white" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-brand-600">
                    {(v.user.name || "?")[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-surface-700 truncate">
                    <span className="font-medium text-surface-900">{v.user.name || "Someone"}</span>
                    <span className="text-surface-400"> voted for </span>
                    <span className="font-medium text-surface-900">{v.pet.name}</span>
                  </p>
                  <p className="text-[11px] text-surface-400 mt-0.5">{timeAgo(new Date(v.createdAt))}</p>
                </div>
                {v.pet.photos[0] && (
                  <img
                    src={v.pet.photos[0]}
                    alt=""
                    className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                    onError={(e) => {(e.target as HTMLImageElement).style.display = "none";}}
                  />
                )}
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
