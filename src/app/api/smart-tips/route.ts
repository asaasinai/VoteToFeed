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
  /** "brand" | "amber" | "green" | "purple" */
  color: string;
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ tips: [] });

  const userId = session.user.id;
  const weekId = getCurrentWeekId();

  const [pets, user] = await Promise.all([
    prisma.pet.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        name: true,
        weeklyStats: {
          where: { weekId },
          select: { rank: true, totalVotes: true },
          take: 1,
        },
      },
      take: 3,
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { freeVotesRemaining: true, paidVoteBalance: true },
    }),
  ]);

  const tips: SmartTip[] = [];

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
  } else {
    // Pick the best-ranked pet (or first if none have rank)
    const rankedPet = pets
      .filter((p) => p.weeklyStats[0]?.rank != null)
      .sort((a, b) => (a.weeklyStats[0]?.rank ?? 999) - (b.weeklyStats[0]?.rank ?? 999))[0];

    const unrankedPet = pets.find((p) => !p.weeklyStats[0]?.rank);
    const featuredPet = rankedPet ?? unrankedPet ?? pets[0];

    if (rankedPet) {
      const rank = rankedPet.weeklyStats[0]!.rank!;
      const myVotes = rankedPet.weeklyStats[0]!.totalVotes;

      if (rank === 1) {
        tips.push({
          id: `top-${rankedPet.id}`,
          icon: "🥇",
          title: `${rankedPet.name} is #1! 🎉`,
          message: `Amazing! ${rankedPet.name} is leading the leaderboard this week. Keep voting to stay on top!`,
          ctaText: "View Leaderboard",
          ctaUrl: `/pets/${rankedPet.id}`,
          color: "green",
        });
      } else {
        // Get the top pet's votes this week to calculate gap
        const topStats = await prisma.petWeeklyStats.findFirst({
          where: { weekId, rank: 1 },
          select: { totalVotes: true },
        });
        const gapVotes = topStats ? Math.max(1, topStats.totalVotes - myVotes + 1) : null;

        tips.push({
          id: `rank-${rankedPet.id}`,
          icon: "🏆",
          title: `${rankedPet.name} needs a boost!`,
          message: gapVotes
            ? `${rankedPet.name} is currently #${rank}. Get ${gapVotes} more vote${gapVotes !== 1 ? "s" : ""} to reach #1! 🚀`
            : `${rankedPet.name} is currently #${rank} this week. Vote now to climb the leaderboard! 🚀`,
          ctaText: "Boost Now",
          ctaUrl: `/pets/${rankedPet.id}`,
          color: "amber",
        });
      }
    } else if (unrankedPet) {
      // Pet exists but no contest activity this week
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

    // Out of votes tip (only if pet is competing and not already #1)
    const totalVotes = (user?.freeVotesRemaining ?? 0) + (user?.paidVoteBalance ?? 0);
    const isFirst = rankedPet?.weeklyStats[0]?.rank === 1;
    if (!isFirst && totalVotes === 0 && featuredPet) {
      tips.push({
        id: "no-votes",
        icon: "⚡",
        title: "You're out of votes!",
        message: `Buy a vote pack to keep ${featuredPet.name} climbing the leaderboard this week! ✨`,
        ctaText: "Buy Votes",
        ctaUrl: "/dashboard#votes",
        color: "brand",
      });
    }
  }

  return NextResponse.json({ tips });
}
