import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import prisma from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { triggerVoteAlert } from "@/lib/vote-alerts";

export const dynamic = "force-dynamic";

// GET /api/cron/process-scheduled-votes — Runs every 5 minutes via Vercel Cron
export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  try {
    const dueVotes = await prisma.scheduledVote.findMany({
      where: {
        status: "PENDING",
        scheduledFor: { lte: new Date() },
      },
      orderBy: { scheduledFor: "asc" },
      take: 100,
    });

    let processedCount = 0;
    let failedCount = 0;

    for (const sv of dueVotes) {
      try {
        const claimed = await prisma.scheduledVote.updateMany({
          where: { id: sv.id, status: "PENDING" },
          data: { status: "PROCESSING" },
        });

        if (claimed.count === 0) continue;

        await prisma.$transaction(async (tx) => {
          await tx.vote.create({
            data: {
              userId: sv.seedAccountId,
              petId: sv.petId,
              voteType: "FREE",
              quantity: sv.votesAmount,
              contestWeek: sv.weekId,
            },
          });

          await tx.petWeeklyStats.upsert({
            where: { petId_weekId: { petId: sv.petId, weekId: sv.weekId } },
            create: {
              petId: sv.petId,
              weekId: sv.weekId,
              totalVotes: sv.votesAmount,
              freeVotes: sv.votesAmount,
              paidVotes: 0,
            },
            update: {
              totalVotes: { increment: sv.votesAmount },
              freeVotes: { increment: sv.votesAmount },
            },
          });

          await tx.scheduledVote.update({
            where: { id: sv.id },
            data: { status: "PROCESSED", processedAt: new Date() },
          });
        });

        processedCount++;
      } catch (error) {
        failedCount++;
        await prisma.scheduledVote
          .update({
            where: { id: sv.id },
            data: {
              status: "FAILED",
              errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
            },
          })
          .catch(() => {});
      }
    }

    // Recalculate rankings + fire rank/vote notifications
    if (processedCount > 0) {
      const weekIds = [...new Set(dueVotes.map((v) => v.weekId))];

      // Per-week: snapshot old ranks → recalculate → compare
      type WeekSnapshot = {
        weekId: string;
        oldRankMap: Map<string, number | null>;
        orderedPetIds: string[];
      };
      const snapshots: WeekSnapshot[] = [];

      for (const weekId of weekIds) {
        // Snapshot ranks before update
        const preStats = await prisma.petWeeklyStats.findMany({
          where: { weekId },
          select: { petId: true, rank: true },
        });
        const oldRankMap = new Map<string, number | null>(preStats.map((s) => [s.petId, s.rank]));

        // Recalculate
        const stats = await prisma.petWeeklyStats.findMany({
          where: { weekId },
          orderBy: [{ totalVotes: "desc" }, { updatedAt: "asc" }],
          select: { id: true, petId: true },
        });
        await prisma.$transaction(
          stats.map((stat, index) =>
            prisma.petWeeklyStats.update({
              where: { id: stat.id },
              data: { rank: index + 1 },
            }),
          ),
        );

        snapshots.push({ weekId, oldRankMap, orderedPetIds: stats.map((s) => s.petId) });
      }

      // Fire notifications non-blocking — no trace of demo origin
      (async () => {
        const votedPetIdSet = new Set(dueVotes.map((v) => v.petId));

        for (const { weekId, oldRankMap, orderedPetIds } of snapshots) {
          const newRankMap = new Map(orderedPetIds.map((petId, i) => [petId, i + 1]));

          // Pets whose rank actually changed this batch
          const changedPetIds = orderedPetIds.filter((petId) => oldRankMap.get(petId) !== newRankMap.get(petId));
          // Pets that received votes this batch (for email alerts)
          const batchedInWeek = dueVotes.filter((v) => v.weekId === weekId).map((v) => v.petId);
          const emailTargetIds = [...new Set([...changedPetIds, ...batchedInWeek])];

          if (emailTargetIds.length === 0) continue;

          // Load owner info — skip demo accounts entirely
          const realPets = await prisma.pet.findMany({
            where: {
              id: { in: emailTargetIds },
              user: { email: { not: { contains: "@iheartdogs.com" } } },
            },
            select: {
              id: true,
              name: true,
              userId: true,
              user: {
                select: {
                  email: true,
                  name: true,
                  notifications: { select: { voteAlerts: true } },
                },
              },
            },
          });

          for (const pet of realPets) {
            const oldRank = oldRankMap.get(pet.id) ?? null;
            const newRank = newRankMap.get(pet.id) ?? null;

            // RANK_CLIMB — moved up into top 20
            if (newRank && newRank <= 20 && (oldRank === null || newRank < oldRank)) {
              await createNotification({
                userId: pet.userId,
                type: "RANK_CLIMB",
                title: "Your pet climbed the leaderboard! 🏆",
                message: `${pet.name} is now #${newRank} this week!`,
                linkUrl: "/leaderboard/weekly",
              });
            }

            // RANK_DROP — overtaken by another pet in top 20
            if (newRank && oldRank !== null && newRank > oldRank && newRank <= 20) {
              await createNotification({
                userId: pet.userId,
                type: "RANK_DROP",
                title: `${pet.name} just dropped in the rankings!`,
                message: `${pet.name} dropped to #${newRank} — vote now to reclaim your spot! 💪`,
                linkUrl: "/leaderboard/weekly",
              });
            }

            // Vote alert email (batched, 6hr cooldown) — only for pets that received votes
            if (votedPetIdSet.has(pet.id) && pet.user.email && pet.user.notifications?.voteAlerts !== false) {
              const weekStats = await prisma.petWeeklyStats.findUnique({
                where: { petId_weekId: { petId: pet.id, weekId } },
                select: { totalVotes: true },
              });
              if (weekStats) {
                await triggerVoteAlert(pet.id, pet.userId, pet.user.email, pet.user.name ?? "", weekStats.totalVotes);
              }
            }
          }
        }
      })().catch((err) => console.error("[cron] post-vote notifications error:", err));
    }

    return NextResponse.json({
      success: true,
      dueCount: dueVotes.length,
      processedCount,
      failedCount,
    });
  } catch (error) {
    console.error("Process scheduled votes cron error:", error);
    return NextResponse.json(
      { error: "Cron failed", details: String(error) },
      { status: 500 },
    );
  }
}
