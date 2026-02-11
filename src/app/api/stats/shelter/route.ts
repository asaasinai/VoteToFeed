import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentWeekId, getWeekDateRange } from "@/lib/utils";
import { getMealRate, getAnimalType } from "@/lib/admin-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const weekId = getCurrentWeekId();
  const { start, end } = getWeekDateRange();
  const [agg, weeklyMealsAgg, mealRate, animalType] = await Promise.all([
    prisma.petWeeklyStats.aggregate({
      where: { weekId },
      _sum: { totalVotes: true, paidVotes: true },
    }),
    // Use stored mealsProvided from actual purchases — preserves historical accuracy
    prisma.purchase.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: start, lt: end } },
      _sum: { mealsProvided: true },
    }),
    getMealRate(),
    getAnimalType(),
  ]);

  const totalVotes = agg._sum.totalVotes ?? 0;
  const paidVotes = agg._sum.paidVotes ?? 0;
  const mealsHelped = Math.round(weeklyMealsAgg._sum.mealsProvided ?? 0);

  return NextResponse.json({
    weeklyVotes: totalVotes,
    paidVotes,
    animalType,
    mealRate,
    mealsHelped,
    weekId,
  });
}
