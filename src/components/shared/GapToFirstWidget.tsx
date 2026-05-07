"use client";

import { BuyVotesLink } from "@/components/voting/BuyVotesLink";

interface GapToFirstWidgetProps {
  /** Votes the current viewer's pet has */
  myVotes: number;
  /** Votes the #1 ranked entry has */
  topVotes: number;
  /** Name of the viewer's pet */
  petName: string;
  /** Current rank of the viewer's pet */
  myRank: number;
  /** ID of the viewer's pet (optional) */
  petId?: string | null;
  /** Contest or leaderboard identifier (for the buy CTA URL) */
  contestId?: string;
  /** Show "buy to climb" CTA */
  showBuyCta?: boolean;
  className?: string;
}

const ICON_TIER_VOTES = 6000;
const ICON_TIER_PRICE = 499;
const LEGEND_TIER_VOTES = 2500;
const LEGEND_TIER_PRICE = 249;
const HERO_TIER_VOTES = 750;
const HERO_TIER_PRICE = 99;

function recommendedTier(gap: number): { tier: "HERO" | "LEGEND" | "ICON"; label: string; votes: number; price: number } {
  if (gap >= ICON_TIER_VOTES * 0.8) return { tier: "ICON", label: "Icon", votes: ICON_TIER_VOTES, price: ICON_TIER_PRICE };
  if (gap >= LEGEND_TIER_VOTES * 0.8) return { tier: "LEGEND", label: "Legend", votes: LEGEND_TIER_VOTES, price: LEGEND_TIER_PRICE };
  return { tier: "HERO", label: "Hero", votes: HERO_TIER_VOTES, price: HERO_TIER_PRICE };
}

export function GapToFirstWidget({
  myVotes,
  topVotes,
  petName,
  myRank,
  contestId,
  showBuyCta = true,
  className = "",
  petId,
}: GapToFirstWidgetProps) {
  const gap = Math.max(0, topVotes - myVotes);
  const isFirst = myRank === 1;
  const pct = topVotes > 0 ? Math.min(100, Math.round((myVotes / topVotes) * 100)) : 100;
  const tier = recommendedTier(gap);

  if (isFirst) {
    return (
      <div
        className={`rounded-2xl border border-yellow-300 bg-gradient-to-br from-yellow-50 to-amber-50 p-4 flex items-center gap-3 ${className}`}
      >
        <span className="text-3xl leading-none">🥇</span>
        <div>
          <p className="font-bold text-amber-900 text-sm">{petName} is in 1st place!</p>
          <p className="text-xs text-amber-700 mt-0.5">Keep voting to stay on top</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-surface-400 mb-1">
          Gap to #1
        </p>
        <p className="text-xl font-extrabold text-surface-900 leading-tight">
          {petName} needs{" "}
          <span className="text-brand-600">{gap.toLocaleString()} more votes</span>
        </p>
        <p className="text-xs text-surface-500 mt-0.5">
          Currently #{myRank} · {myVotes.toLocaleString()} votes vs #1&apos;s{" "}
          {topVotes.toLocaleString()}
        </p>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-surface-400">Your votes</span>
          <span className="text-[10px] font-semibold text-surface-700">{pct}% of #1</span>
        </div>
        <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Buy-to-climb CTA */}
      {showBuyCta && (
        <div className="px-4 pb-4">
          <div className="rounded-xl bg-brand-50 border border-brand-100 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-brand-900">
                Recommended: {tier.label} Pack
              </p>
              <p className="text-[11px] text-brand-700 mt-0.5">
                +{tier.votes.toLocaleString()} votes · ${tier.price} — closes the gap instantly
              </p>
            </div>
            <BuyVotesLink
              href={`/dashboard?buy=${tier.tier}${petId ? `&pet=${petId}` : ""}`}
              source="gap_to_first_widget"
              petId={petId}
              petName={petName}
              packageTier={tier.tier}
              votesNeeded={gap}
              currentRank={myRank}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-4 py-2 transition-colors"
            >
              Buy Votes →
            </BuyVotesLink>
          </div>
        </div>
      )}
    </div>
  );
}
