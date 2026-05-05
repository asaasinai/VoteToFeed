import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentWeekId } from "@/lib/utils";
import { verifyCronSecret } from "@/lib/cron-auth";
import { sendWeeklyDigest } from "@/lib/email";
import { getAnimalType } from "@/lib/admin-settings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const weekId = getCurrentWeekId();
  const animalType = await getAnimalType();

  const users = await prisma.user.findMany({
    where: {
      email: { not: null },
      pets: { some: { isActive: true } },
      OR: [
        { notifications: null },
        { notifications: { weeklyDigest: true } },
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      pets: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          votes: {
            where: { contestWeek: weekId },
            select: { quantity: true },
          },
          contestEntries: {
            where: {
              contest: {
                isActive: true,
                startDate: { lte: new Date() },
                endDate: { gt: new Date() },
              },
            },
            select: {
              contest: {
                select: { id: true },
              },
            },
          },
        },
      },
    },
    take: 500,
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const user of users) {
    if (!user.email || !user.pets.length) {
      skipped++;
      continue;
    }

    const petSummaries = user.pets
      .map((pet) => ({
        name: pet.name,
        votes: pet.votes.reduce((sum, v) => sum + v.quantity, 0),
        rank: null as number | null,
      }))
      .filter((p) => p.votes > 0);

    if (petSummaries.length === 0) {
      skipped++;
      continue;
    }

    const totalVotes = petSummaries.reduce((s, p) => s + p.votes, 0);
    const totalMeals = Math.round(totalVotes * 0.25);

    try {
      const firstName = user.name?.split(" ")[0] ?? "there";
      await sendWeeklyDigest(user.email, firstName, petSummaries, totalMeals, animalType);
      sent++;
    } catch (err) {
      console.error(`[weekly-digest] failed for user ${user.id}:`, err);
      failed++;
    }
  }

  return NextResponse.json({
    success: true,
    weekId,
    sent,
    failed,
    skipped,
  });
}
