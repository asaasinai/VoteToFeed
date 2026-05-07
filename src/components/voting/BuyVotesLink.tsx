"use client";

import Link from "next/link";
import { trackPostHogEvent } from "@/lib/analytics";

type BuyVotesLinkProps = {
  href: string;
  source: string;
  className?: string;
  children: React.ReactNode;
  petId?: string | null;
  petName?: string | null;
  packageTier?: string | null;
  votesNeeded?: number | null;
  currentRank?: number | null;
  onClick?: () => void;
};

export function BuyVotesLink({
  href,
  source,
  className,
  children,
  petId,
  petName,
  packageTier,
  votesNeeded,
  currentRank,
  onClick,
}: BuyVotesLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        trackPostHogEvent("buy_to_climb_click", {
          source,
          pet_id: petId || undefined,
          pet_name: petName || undefined,
          package_tier: packageTier || undefined,
          votes_needed: votesNeeded ?? undefined,
          current_rank: currentRank ?? undefined,
        });
        onClick?.();
      }}
    >
      {children}
    </Link>
  );
}
