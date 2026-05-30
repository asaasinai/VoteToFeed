import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCurrentWeekId } from "@/lib/utils";

export const dynamic = "force-dynamic";

function phaseCutSize(phase: string, c: { top100CutSize: number; top25CutSize: number; top5CutSize: number }): number | null {
  switch (phase) {
    case "TOP100": return c.top100CutSize;
    case "TOP25":  return c.top25CutSize;
    case "TOP5":   return c.top5CutSize;
    default:       return null; // OPEN = unlimited
  }
}

// POST /api/admin/demo-studio/contest-entry
// Body: { petId, contestId, votes, voteType? }
// For FLAGSHIP contests in TOP100/TOP25/TOP5 phase:
//   - If slots are available, adds normally.
//   - If full, eliminates the active entry with fewest votes to make room.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { petId, contestId, votes = 0, voteType = "PAID" } = await req.json() as {
    petId: string;
    contestId: string;
    votes?: number;
    voteType?: "FREE" | "PAID";
  };

  if (!petId || !contestId) {
    return NextResponse.json({ error: "petId and contestId are required" }, { status: 400 });
  }

  const pet = await prisma.pet.findUnique({
    where: { id: petId },
    select: { id: true, userId: true, isActive: true },
  });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  if (!pet.isActive) return NextResponse.json({ error: "Pet is inactive" }, { status: 400 });

  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: {
      id: true,
      name: true,
      type: true,
      isActive: true,
      currentPhase: true,
      startDate: true,
      top100CutSize: true,
      top25CutSize: true,
      top5CutSize: true,
    },
  });
  if (!contest) return NextResponse.json({ error: "Contest not found" }, { status: 404 });

  // ── FLAGSHIP phase logic ─────────────────────────────────
  let eliminatedPetName: string | null = null;

  if (contest.type === "FLAGSHIP" && contest.currentPhase !== "OPEN") {
    const cutSize = phaseCutSize(contest.currentPhase, contest);

    if (cutSize !== null) {
      // Get all non-eliminated entries
      const activeEntries = await prisma.contestEntry.findMany({
        where: { contestId, isEliminated: false },
        select: { id: true, petId: true, pet: { select: { name: true } } },
      });

      // Check if the pet is already an active entry
      const alreadyActive = activeEntries.some(e => e.petId === petId);

      if (!alreadyActive && activeEntries.length >= cutSize) {
        // Contest is full — find the entry with fewest votes since contest start
        const petIds = activeEntries.map(e => e.petId);
        const voteCounts = await prisma.vote.groupBy({
          by: ["petId"],
          where: { petId: { in: petIds }, createdAt: { gte: contest.startDate } },
          _sum: { quantity: true },
        });
        const voteMap = new Map(voteCounts.map(vc => [vc.petId, vc._sum.quantity ?? 0]));

        // Sort ascending (fewest votes first)
        const sorted = [...activeEntries].sort(
          (a, b) => (voteMap.get(a.petId) ?? 0) - (voteMap.get(b.petId) ?? 0)
        );

        const toEliminate = sorted[0];
        eliminatedPetName = toEliminate.pet.name;

        const roundNumber = contest.currentPhase === "TOP100" ? 2 : contest.currentPhase === "TOP25" ? 3 : 4;
        await prisma.contestEntry.update({
          where: { id: toEliminate.id },
          data: { isEliminated: true, eliminatedAtRound: roundNumber },
        });
      }
    }
  }

  // Upsert contest entry (re-activate if previously eliminated)
  const entry = await prisma.contestEntry.upsert({
    where: { contestId_petId: { contestId, petId } },
    create: { contestId, petId, isEliminated: false },
    update: { isEliminated: false, eliminatedAtRound: null },
  });

  // Inject votes if requested
  let voteRecord = null;
  if (votes > 0) {
    const weekId = getCurrentWeekId();
    voteRecord = await prisma.vote.create({
      data: {
        petId,
        userId: pet.userId,
        voteType: voteType as "FREE" | "PAID",
        quantity: votes,
        contestWeek: weekId,
      },
    });

    await prisma.petWeeklyStats.upsert({
      where: { petId_weekId: { petId, weekId } },
      create: {
        petId,
        weekId,
        totalVotes: votes,
        freeVotes: voteType === "FREE" ? votes : 0,
        paidVotes: voteType === "PAID" ? votes : 0,
      },
      update: {
        totalVotes: { increment: votes },
        freeVotes: voteType === "FREE" ? { increment: votes } : undefined,
        paidVotes: voteType === "PAID" ? { increment: votes } : undefined,
      },
    });
  }

  return NextResponse.json({
    entry,
    voteRecord,
    contestName: contest.name,
    eliminatedPetName,
  });
}
