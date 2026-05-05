import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentWeekId } from "@/lib/utils";
import { verifyCronSecret } from "@/lib/cron-auth";
import { sendWeeklyDigest } from "@/lib/email";
import { getAnimalType } from "@/lib/admin-settings";

export const dynamic = "force-dynamic";

// Runs every Monday at 2 PM UTC (7 AM PST) — great open-rate window
// Vercel cron: "0 14 * * 1"
//
// Sends a weekly summary to users who:
//   1. Have at least one active pet
//   2. Have weeklyDigest preference = true (or no prefs row = default true)
//   3. Have not received a digest this week (guarded via lastDigestWeek)

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const weekId = getCurrentWeekId();
  const animalType = await getAnimalType();

  // Fetch up to 500 eligible users with their pets and this week's votes
  const users = await prisma.user.findMany({
    where: {
      email: { not: null },
      // Must have at least one active pet
      pets: { some: { isActive: true } },
      // Respect opt-out
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

    // Build per-pet vote totals; skip users whose pets have zero votes this week
    const petSummaries = user.pets
      .map((pet) => ({
        name: pet.name,
        votes: pet.votes.reduce((sum, v) => sum + v.quantity, 0),
        rank: null as number | null, // rank lookup skipped for perf; null shows "—"
      }))
      .filter((p) => p.votes > 0);

    if (petSummaries.length === 0) {
      skipped++;
      continue;
    }

    // Each paid vote = ~0.25 meals (rough estimate; adjust per business logic)
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
