import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/contests/[id]/leaderboard?limit=5
// Returns top N entries with vote counts — used for live polling
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const limit = Math.min(200, parseInt(req.nextUrl.searchParams.get("limit") ?? "5"));

  const contest = await prisma.contest.findUnique({
    where: { id },
    select: { startDate: true, endDate: true, entries: {
      where: { pet: { isActive: true }, isEliminated: false },
      select: { petId: true, pet: { select: { id: true, name: true, photos: true, type: true } } },
    }},
  });

  if (!contest) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const petIds = contest.entries.map((e) => e.petId);
  const dateFilter = { gte: contest.startDate, lte: contest.endDate };

  const [contestVotes, anonVotes] = petIds.length > 0
    ? await Promise.all([
        prisma.vote.groupBy({
          by: ["petId"],
          where: { petId: { in: petIds }, createdAt: dateFilter },
          _sum: { quantity: true },
        }),
        prisma.anonymousVote.groupBy({
          by: ["petId"],
          where: { petId: { in: petIds }, createdAt: dateFilter },
          _count: true,
        }),
      ])
    : [[], []];

  const voteMap = new Map<string, number>();
  for (const v of contestVotes) voteMap.set(v.petId, (voteMap.get(v.petId) ?? 0) + (v._sum.quantity ?? 0));
  for (const v of anonVotes) voteMap.set(v.petId, (voteMap.get(v.petId) ?? 0) + v._count);

  const sorted = contest.entries
    .map((e) => ({ ...e.pet, votes: voteMap.get(e.petId) ?? 0 }))
    .sort((a, b) => b.votes - a.votes)
    .slice(0, limit);

  return NextResponse.json({ entries: sorted, updatedAt: new Date().toISOString() });
}
