import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentWeekId, getWeekDateRange } from "@/lib/utils";
import { getMealRate, getAnimalType, getWeeklyVoteGoal } from "@/lib/admin-settings";

export const dynamic = "force-dynamic";

// GET /api/stats/live — Lightweight poll endpoint for live global stats
export async function GET() {
  try {
    const weekId = getCurrentWeekId();
    const { start, end } = getWeekDateRange();

    const [stats, weeklyMealsAgg, animalType, weeklyGoal, mealRate] = await Promise.all([
      prisma.petWeeklyStats.aggregate({
        where: { weekId },
        _sum: { totalVotes: true, paidVotes: true },
      }),
      // Use stored mealsProvided from completed purchases this week
      prisma.purchase.aggregate({
        where: { status: "COMPLETED", createdAt: { gte: start, lt: end } },
        _sum: { mealsProvided: true },
      }),
      getAnimalType(),
      getWeeklyVoteGoal(),
      getMealRate(),
    ]);

    const weeklyVotes = stats._sum.totalVotes ?? 0;
    // Historical meals from stored purchase data
    const storedMeals = weeklyMealsAgg._sum.mealsProvided ?? 0;
    // For votes cast this week that haven't been purchased yet (free votes), estimate with current rate
    const paidVotes = stats._sum.paidVotes ?? 0;
    // Use stored meals as the base, but also factor in current-rate estimate for very recent paid votes
    // that may not have a purchase record yet (edge case during checkout)
    const mealsHelped = Math.round(storedMeals > 0 ? storedMeals : (paidVotes / 10) * mealRate);

    return NextResponse.json({
      weeklyVotes,
      mealsHelped,
      animalType,
      weeklyGoal,
      mealRate, // Send current rate so packages can calculate dynamically
    });
  } catch (error) {
    console.error("Error fetching live stats:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
