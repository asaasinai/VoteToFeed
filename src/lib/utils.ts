// Format owner display name as "First L." (e.g. "Justin P.")
export function formatDisplayName(
  ownerFirstName?: string | null,
  ownerLastName?: string | null,
  ownerName?: string | null
): string {
  if (ownerFirstName) {
    const last = ownerLastName?.trim();
    return last ? `${ownerFirstName} ${last[0].toUpperCase()}.` : ownerFirstName;
  }
  if (ownerName) {
    const parts = ownerName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
    }
    return parts[0];
  }
  return "Anonymous";
}

// Simple class name merger
export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(" ");
}

// Format vote count with commas
export function formatVotes(count: number): string {
  return count.toLocaleString();
}

// Format currency from cents
export function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Get current contest week ID (ISO week format: "2026-W02")
export function getCurrentWeekId(): string {
  const now = new Date();
  // Find the most recent Sunday
  const day = now.getUTCDay();
  const sunday = new Date(now);
  sunday.setUTCDate(now.getUTCDate() - day);
  sunday.setUTCHours(0, 0, 0, 0);

  // Get ISO week number
  const startOfYear = new Date(Date.UTC(sunday.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(
    ((sunday.getTime() - startOfYear.getTime()) / 86400000 + 1) / 7
  );

  return `${sunday.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

// Get contest week date range
export function getWeekDateRange(weekId?: string): {
  start: Date;
  end: Date;
} {
  const now = new Date();
  const day = now.getUTCDay();
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() - day);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);

  return { start, end };
}

// Days remaining until next vote reset (Sunday 11:59 AM PST = 19:59 UTC)
export function daysRemainingInWeek(): number {
  const now = new Date();
  // Next Sunday at 19:59 UTC (11:59 AM PST)
  const nextReset = new Date(now);
  const dayOfWeek = now.getUTCDay();
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  nextReset.setUTCDate(now.getUTCDate() + daysUntilSunday);
  nextReset.setUTCHours(19, 59, 0, 0);

  // If we're past the reset time this Sunday, next reset is next week
  if (now >= nextReset) {
    nextReset.setUTCDate(nextReset.getUTCDate() + 7);
  }

  const msRemaining = nextReset.getTime() - now.getTime();
  return Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
}

// Default free votes per reset period (fallback — actual value comes from admin settings)
export const FREE_VOTES_PER_WEEK = 5;

// Calculate meals from price using admin meal rate
export function calculateMeals(priceInCents: number, mealRate: number): number {
  const priceInDollars = priceInCents / 100;
  return Math.round(priceInDollars * mealRate);
}

// Time ago helper
export function timeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

// Rank suffix (1st, 2nd, 3rd, etc.)
export function rankSuffix(rank: number): string {
  const j = rank % 10;
  const k = rank % 100;
  if (j === 1 && k !== 11) return `${rank}st`;
  if (j === 2 && k !== 12) return `${rank}nd`;
  if (j === 3 && k !== 13) return `${rank}rd`;
  return `${rank}th`;
}

// State abbreviation to full name
export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

// Vote package definitions
export const VOTE_PACKAGES = [
  { tier: "STARTER", votes: 10, price: 99, label: "Starter" },
  { tier: "FRIEND", votes: 60, price: 499, label: "Friend" },
  { tier: "SUPPORTER", votes: 120, price: 999, label: "Supporter" },
  { tier: "CHAMPION", votes: 300, price: 2499, label: "Champion" },
  { tier: "HERO", votes: 600, price: 4999, label: "Hero" },
  { tier: "LEGEND", votes: 1200, price: 9999, label: "Legend" },
] as const;
