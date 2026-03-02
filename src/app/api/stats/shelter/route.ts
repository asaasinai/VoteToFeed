import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentWeekId, getWeekDateRange } from "@/lib/utils";
import { getMealRate, getAnimalType } from "@/lib/admin-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const weekId = getCurrentWeekId();
  const { start, end } = getWeekDateRange();
  const [agg, mealRate, animalType] = await Promise.all([
    prisma.petWeeklyStats.aggregate({
      where: { weekId },
      _sum: { totalVotes: true, paidVotes: true },
    }),
    getMealRate(),
    getAnimalType(),
  ]);

  const totalVotes = agg._sum.totalVotes ?? 0;
  const paidVotes = agg._sum.paidVotes ?? 0;

  // Every 10 votes = 1 meal provided
  const mealsHelped = Math.round(totalVotes / 10);

  return NextResponse.json({
    weeklyVotes: totalVotes,
    paidVotes,
    animalType,
    mealRate,
    mealsHelped,
    weekId,
  });
}
