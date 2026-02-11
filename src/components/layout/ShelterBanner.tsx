"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Props = {
  weeklyVotes: number;
  animalType: string;
  mealsHelped?: number;
  weeklyGoal?: number;
};

export function ShelterBanner({
  weeklyVotes: initialVotes,
  animalType: initialAnimalType,
  mealsHelped: initialMeals = 0,
  weeklyGoal: initialGoal = 100000,
}: Props) {
  const [weeklyVotes, setWeeklyVotes] = useState(initialVotes);
  const [animalType, setAnimalType] = useState(initialAnimalType);
  const [mealsHelped, setMealsHelped] = useState(initialMeals);
  const [weeklyGoal, setWeeklyGoal] = useState(initialGoal);

  // Poll for live stats every 5 seconds
  useEffect(() => {
    let mounted = true;
    async function poll() {
      try {
        const res = await fetch("/api/stats/live");
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        setWeeklyVotes(data.weeklyVotes);
        setAnimalType(data.animalType);
        setMealsHelped(data.mealsHelped);
        setWeeklyGoal(data.weeklyGoal);
      } catch { /* ignore */ }
    }
    const interval = setInterval(poll, 5000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const pct = weeklyGoal ? Math.min(100, (weeklyVotes / weeklyGoal) * 100) : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-surface-900 via-surface-800 to-surface-900 text-white p-6 sm:p-8">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-accent-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />

      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div className="flex-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs font-medium text-white/80 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse-subtle" />
            VotesForShelters
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums">
            {weeklyVotes.toLocaleString()} votes this week
          </h2>
          <p className="text-white/60 mt-1 text-sm">
            Votes for shelter {animalType}
            {mealsHelped > 0 && ` — ~${mealsHelped.toLocaleString()} shelter pets fed`}
          </p>
        </div>

        <div className="sm:w-56 flex-shrink-0 space-y-2">
          <div className="flex justify-between text-xs text-white/60">
            <span>Weekly goal</span>
            <span className="font-semibold text-white/80">{Math.round(pct)}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-400 to-brand-500 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-white/40">{weeklyGoal.toLocaleString()} votes</p>
        </div>

        <Link
          href="/votesforshelters"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-surface-900 rounded-xl font-semibold text-sm hover:bg-white/90 transition-colors flex-shrink-0"
        >
          See impact
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </Link>
      </div>
    </div>
  );
}
