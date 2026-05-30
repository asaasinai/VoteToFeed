import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/admin/demo-studio/contests
// Returns all active contests including FLAGSHIP in any phase (not just OPEN).
// Each contest includes: phase, cutSize for current phase, activeEntryCount, availableSlots.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const contests = await prisma.contest.findMany({
    where: { isActive: true, endDate: { gte: now } },
    select: {
      id: true,
      name: true,
      type: true,
      petType: true,
      currentPhase: true,
      isActive: true,
      startDate: true,
      endDate: true,
      top100CutSize: true,
      top25CutSize: true,
      top5CutSize: true,
      _count: {
        select: { entries: true },
      },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  // For FLAGSHIP contests, also count active (non-eliminated) entries
  const flagshipIds = contests.filter(c => c.type === "FLAGSHIP").map(c => c.id);

  const activeEntryCounts = flagshipIds.length > 0
    ? await prisma.contestEntry.groupBy({
        by: ["contestId"],
        where: { contestId: { in: flagshipIds }, isEliminated: false },
        _count: { id: true },
      })
    : [];

  const activeCountMap = new Map(activeEntryCounts.map(r => [r.contestId, r._count.id]));

  const result = contests.map(c => {
    const cutSize = phaseCutSize(c.currentPhase, c.top100CutSize, c.top25CutSize, c.top5CutSize);
    const activeCount = c.type === "FLAGSHIP" ? (activeCountMap.get(c.id) ?? 0) : c._count.entries;
    const availableSlots = cutSize !== null ? Math.max(0, cutSize - activeCount) : null;

    return {
      id: c.id,
      name: c.name,
      type: c.type,
      petType: c.petType,
      currentPhase: c.currentPhase,
      isActive: c.isActive,
      endDate: c.endDate,
      cutSize,
      activeCount,
      availableSlots, // null = unlimited (OPEN non-flagship), 0 = full
    };
  });

  return NextResponse.json({ contests: result });
}

function phaseCutSize(
  phase: string,
  top100: number,
  top25: number,
  top5: number
): number | null {
  switch (phase) {
    case "TOP100": return top100;
    case "TOP25":  return top25;
    case "TOP5":   return top5;
    default:       return null; // OPEN = unlimited
  }
}
