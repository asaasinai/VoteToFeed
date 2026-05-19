import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWeekId } from "@/lib/utils";

export type SmartTip = {
  id: string;
  icon: string;
  title: string;
  message: string;
  ctaText: string;
  ctaUrl: string;
  /** "brand" | "amber" | "green" | "purple" | "rose" | "sky" */
  color: string;
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ tips: [] });

  const userId = session.user.id;
  const weekId = getCurrentWeekId();

  const [pets, user, recentFeedPost, activeEntries] = await Promise.all([
    prisma.pet.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        name: true,
        type: true,
        weeklyStats: {
          where: { weekId },
          select: { rank: true, totalVotes: true },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { freeVotesRemaining: true, paidVoteBalance: true },
    }),
    // Check if user posted in feed in last 7 days
    prisma.shelterPost.findFirst({
      where: { authorId: userId, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      select: { id: true },
    }),
    // Active contest entries for this user's pets - to detect ending soon
    prisma.contestEntry.findMany({
      where: {
        pet: { userId },
        contest: { isActive: true, endDate: { gt: new Date() } },
      },
      select: {
        petId: true,
        contest: { select: { id: true, name: true, endDate: true } },
        pet: { select: { id: true, name: true } },
      },
      take: 5,
    }),
  ]);

  const tips: SmartTip[] = [];

  // ── No pets at all ───────────────────────────────────────────────────────
  if (pets.length === 0) {
    tips.push({
      id: "no-pet",
      icon: "🐾",
      title: "Add your pet!",
      message: "You haven't entered a pet yet. Join the contest and start winning meals for shelter animals!",
      ctaText: "Add Pet",
      ctaUrl: "/pets/new",
      color: "brand",
    });
    return NextResponse.json({ tips });
  }

  // ── Pet-level tips ────────────────────────────────────────────────────────
  const rankedPet = pets
    .filter((p) => p.weeklyStats[0]?.rank != null)
    .sort((a, b) => (a.weeklyStats[0]?.rank ?? 999) - (b.weeklyStats[0]?.rank ?? 999))[0];

  const unrankedPet = pets.find((p) => !p.weeklyStats[0]?.rank);
  const featuredPet = rankedPet ?? unrankedPet ?? pets[0];
  const totalVotes = (user?.freeVotesRemaining ?? 0) + (user?.paidVoteBalance ?? 0);
  const freeVotes = user?.freeVotesRemaining ?? 0;

  if (rankedPet) {
    const rank = rankedPet.weeklyStats[0]!.rank!;
    const myVotes = rankedPet.weeklyStats[0]!.totalVotes;

    if (rank === 1) {
      // ── #1 — defend the lead ──────────────────────────────────────────────
      const secondStats = await prisma.petWeeklyStats.findFirst({
        where: { weekId, rank: 2 },
        select: { totalVotes: true },
      });
      const gap = secondStats ? Math.max(1, myVotes - secondStats.totalVotes) : null;
      tips.push({
        id: `top-${rankedPet.id}`,
        icon: "🥇",
        title: `${rankedPet.name} is #1! 🎉`,
        message: gap
          ? `${rankedPet.name} leads by ${gap} vote${gap !== 1 ? "s" : ""}. Keep it up — don't let anyone catch up!`
          : `Amazing! ${rankedPet.name} is leading this week. Keep voting to stay on top!`,
        ctaText: "Defend the Lead",
        ctaUrl: `/pets/${rankedPet.id}`,
        color: "green",
      });
    } else if (rank <= 3) {
      // ── Podium (2nd / 3rd) — push to #1 ─────────────────────────────────
      const aboveStats = await prisma.petWeeklyStats.findFirst({
        where: { weekId, rank: rank - 1 },
        select: { totalVotes: true },
      });
      const gap = aboveStats ? Math.max(1, aboveStats.totalVotes - myVotes + 1) : null;
      tips.push({
        id: `rank-${rankedPet.id}`,
        icon: rank === 2 ? "🥈" : "🥉",
        title: `${rankedPet.name} is #${rank} — take the crown!`,
        message: gap
          ? `Only ${gap} more vote${gap !== 1 ? "s" : ""} to jump to #${rank - 1}. You're so close! 🔥`
          : `${rankedPet.name} is on the podium. A quick boost could move you to #1!`,
        ctaText: "Buy Votes → Go #1",
        ctaUrl: "/dashboard#votes",
        color: "amber",
      });
    } else if (rank <= 5) {
      // ── Near podium (4th / 5th) ───────────────────────────────────────────
      const thirdStats = await prisma.petWeeklyStats.findFirst({
        where: { weekId, rank: 3 },
        select: { totalVotes: true },
      });
      const gap = thirdStats ? Math.max(1, thirdStats.totalVotes - myVotes + 1) : null;
      tips.push({
        id: `near-podium-${rankedPet.id}`,
        icon: "🎯",
        title: `${rankedPet.name} is #${rank} — podium is in reach!`,
        message: gap
          ? `Just ${gap} more vote${gap !== 1 ? "s" : ""} and ${rankedPet.name} lands on the prize podium 🏅`
          : `${rankedPet.name} is #${rank} this week — a few votes could crack the top 3!`,
        ctaText: "Grab the Podium",
        ctaUrl: "/dashboard#votes",
        color: "amber",
      });
    } else {
      // ── Outside top 5 ─────────────────────────────────────────────────────
      const topStats = await prisma.petWeeklyStats.findFirst({
        where: { weekId, rank: 1 },
        select: { totalVotes: true },
      });
      const gapVotes = topStats ? Math.max(1, topStats.totalVotes - myVotes + 1) : null;
      tips.push({
        id: `rank-${rankedPet.id}`,
        icon: "🏆",
        title: `${rankedPet.name} is #${rank} — time to climb!`,
        message: gapVotes
          ? `${rankedPet.name} needs ${gapVotes} more vote${gapVotes !== 1 ? "s" : ""} to reach #1. Every vote helps feed shelter pets! 🚀`
          : `${rankedPet.name} is currently #${rank} this week. Vote now to climb the leaderboard! 🚀`,
        ctaText: "Boost Now",
        ctaUrl: `/pets/${rankedPet.id}`,
        color: "brand",
      });
    }
  } else if (unrankedPet) {
    // ── Has pet but not competing this week ───────────────────────────────
    tips.push({
      id: `enter-${unrankedPet.id}`,
      icon: "🌟",
      title: `Enter ${unrankedPet.name} in a contest!`,
      message: `${unrankedPet.name} hasn't competed this week yet. Vote now to get on the leaderboard! 🐾`,
      ctaText: "Vote Now",
      ctaUrl: `/pets/${unrankedPet.id}`,
      color: "purple",
    });
  }

  // ── Out of votes (competing but 0 votes left) ─────────────────────────────
  const isFirst = rankedPet?.weeklyStats[0]?.rank === 1;
  if (!isFirst && totalVotes === 0 && rankedPet) {
    tips.push({
      id: "no-votes",
      icon: "⚡",
      title: "You're out of votes!",
      message: `Buy a vote pack to keep ${rankedPet.name} climbing the leaderboard this week! ✨`,
      ctaText: "Buy Votes",
      ctaUrl: "/dashboard#votes",
      color: "rose",
    });
  }

  // ── Low vote balance (1–4 votes left, not #1) ─────────────────────────────
  if (!isFirst && totalVotes > 0 && totalVotes <= 4 && rankedPet) {
    tips.push({
      id: "low-votes",
      icon: "🔋",
      title: `Almost out of votes!`,
      message: `You only have ${totalVotes} vote${totalVotes !== 1 ? "s" : ""} left. Top up now so ${rankedPet.name} doesn't lose ground! 💪`,
      ctaText: "Top Up Votes",
      ctaUrl: "/dashboard#votes",
      color: "rose",
    });
  }

  // ── Free votes available but not yet used today ────────────────────────────
  if (freeVotes > 0 && featuredPet) {
    tips.push({
      id: "use-free-votes",
      icon: "🎁",
      title: `You have ${freeVotes} free vote${freeVotes !== 1 ? "s" : ""} today!`,
      message: `Use your free daily votes on ${featuredPet.name} — it's free and helps shelter pets get fed! 🐾`,
      ctaText: "Vote Free Now",
      ctaUrl: `/pets/${featuredPet.id}`,
      color: "green",
    });
  }

  // ── Contest ending soon (≤ 2 days) ────────────────────────────────────────
  const urgentEntry = activeEntries.find((e) => {
    const ms = new Date(e.contest.endDate).getTime() - Date.now();
    return ms > 0 && ms <= 2 * 24 * 60 * 60 * 1000;
  });
  if (urgentEntry) {
    const hoursLeft = Math.max(1, Math.round((new Date(urgentEntry.contest.endDate).getTime() - Date.now()) / 3600000));
    tips.push({
      id: `ending-${urgentEntry.contest.id}`,
      icon: "⏰",
      title: `Contest ending in ${hoursLeft}h!`,
      message: `"${urgentEntry.contest.name}" closes soon. Give ${urgentEntry.pet.name} a final push before it's over! 🏁`,
      ctaText: "Vote Before It Ends",
      ctaUrl: `/contests/${urgentEntry.contest.id}`,
      color: "rose",
    });
  }

  // ── Multiple pets — remind about the one not in tip yet ───────────────────
  if (pets.length > 1 && featuredPet) {
    const otherPet = pets.find(
      (p) => p.id !== featuredPet.id && !p.weeklyStats[0]?.rank
    );
    if (otherPet) {
      tips.push({
        id: `other-pet-${otherPet.id}`,
        icon: "🐾",
        title: `Don't forget ${otherPet.name}!`,
        message: `${otherPet.name} hasn't been voted on this week. Enter them in an active contest! 🌟`,
        ctaText: "Enter Contest",
        ctaUrl: `/pets/${otherPet.id}`,
        color: "purple",
      });
    }
  }

  // ── Share your pet ────────────────────────────────────────────────────────
  if (featuredPet) {
    tips.push({
      id: `share-${featuredPet.id}`,
      icon: "📣",
      title: `Share ${featuredPet.name}'s profile!`,
      message: `Every share = more votes! Ask friends & family to vote for ${featuredPet.name} — it's free and helps shelters 🐾`,
      ctaText: "View Profile to Share",
      ctaUrl: `/pets/${featuredPet.id}`,
      color: "sky",
    });
  }

  // ── Post in the community feed ────────────────────────────────────────────
  if (!recentFeedPost) {
    tips.push({
      id: "post-feed",
      icon: "📸",
      title: "Post in the community feed!",
      message: "Share a photo or update about your pet to engage the community and attract more supporters 💬",
      ctaText: "Post Now",
      ctaUrl: "/feed",
      color: "sky",
    });
  }

  // ── Buy votes upsell (always show if not #1 and have some votes to spend) ─
  if (!isFirst && totalVotes > 4 && rankedPet) {
    tips.push({
      id: "buy-votes-upsell",
      icon: "⚡",
      title: "Want a guaranteed top spot?",
      message: `A vote pack gives ${rankedPet.name} a serious boost. More votes = higher rank = bigger prizes 🏆`,
      ctaText: "Buy Votes",
      ctaUrl: "/dashboard#votes",
      color: "brand",
    });
  }

  // Return max 3 tips, prioritising the first ones (already highest priority)
  return NextResponse.json({ tips: tips.slice(0, 3) });
}

