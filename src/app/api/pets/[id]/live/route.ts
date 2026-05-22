import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

function abbreviateName(name?: string | null): string {
  if (!name) return "Someone";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || "Someone";
  return `${parts[0]} ${parts[parts.length - 1][0]?.toUpperCase() ?? ""}.`;
}

// GET /api/pets/[id]/live
// SSE stream: pushes { votes, rank, contestName } whenever they change (polls DB every 1s)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: petId } = await params;

  const pet = await prisma.pet.findUnique({
    where: { id: petId },
    select: { id: true, isActive: true },
  });
  if (!pet || !pet.isActive) return new Response("Not found", { status: 404 });

  async function getSnapshot(): Promise<{ votes: number; rank: number | null; contestName: string | null; gap: number; leader: string | null; recentVoters: { name: string; secsAgo: number }[] } | null> {
    const now = new Date();

    // Find active contest entry
    const entry = await prisma.contestEntry.findFirst({
      where: {
        petId,
        contest: { isActive: true, startDate: { lte: now }, endDate: { gte: now } },
      },
      include: {
        contest: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            entries: { where: { pet: { isActive: true }, isEliminated: false }, select: { petId: true, pet: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!entry) {
      // No active contest — return all-time votes, no rank
      const [vAgg, aAnon] = await Promise.all([
        prisma.vote.aggregate({ where: { petId }, _sum: { quantity: true } }),
        prisma.anonymousVote.count({ where: { petId } }),
      ]);
      return { votes: (vAgg._sum.quantity ?? 0) + aAnon, rank: null, contestName: null, gap: 0, leader: null, recentVoters: [] };
    }

    const dateFilter = { gte: entry.contest.startDate, lte: entry.contest.endDate };
    const allPetIds = entry.contest.entries.map((e) => e.petId);
    const petNameMap = new Map(entry.contest.entries.map((e) => [e.petId, e.pet.name]));

    const [allVotes, allAnon, recentPaid] = await Promise.all([
      prisma.vote.groupBy({
        by: ["petId"],
        where: { petId: { in: allPetIds }, createdAt: dateFilter },
        _sum: { quantity: true },
      }),
      prisma.anonymousVote.groupBy({
        by: ["petId"],
        where: { petId: { in: allPetIds }, createdAt: dateFilter },
        _count: true,
      }),
      prisma.vote.findMany({
        where: { petId, createdAt: dateFilter },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { createdAt: true, user: { select: { name: true } } },
      }),
    ]);

    const anonMap = new Map(allAnon.map((v) => [v.petId, v._count]));
    const voteMap = new Map<string, number>();
    for (const v of allVotes) voteMap.set(v.petId, (voteMap.get(v.petId) ?? 0) + (v._sum.quantity ?? 0));
    for (const [pid, c] of anonMap) voteMap.set(pid, (voteMap.get(pid) ?? 0) + c);

    const sorted = allPetIds
      .map((pid) => ({ petId: pid, votes: voteMap.get(pid) ?? 0 }))
      .sort((a, b) => b.votes - a.votes);

    const myIdx = sorted.findIndex((s) => s.petId === petId);
    const rank = myIdx + 1 || null;
    const myVotes = voteMap.get(petId) ?? 0;
    const leaderVotes = sorted[0]?.votes ?? 0;
    const gap = myIdx > 0 ? Math.max(0, leaderVotes - myVotes + 1) : 0;
    const leaderPetId = myIdx > 0 ? sorted[0]?.petId ?? null : null;
    const leader = leaderPetId ? (petNameMap.get(leaderPetId) ?? null) : null;

    const recentVoters = recentPaid
      .filter((v) => v.user?.name)
      .map((v) => ({
        name: abbreviateName(v.user!.name),
        secsAgo: Math.floor((Date.now() - new Date(v.createdAt).getTime()) / 1000),
      }));

    return { votes: myVotes, rank, contestName: entry.contest.name, gap, leader, recentVoters };
  }

  let prevJson = "";

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      const initial = await getSnapshot();
      if (!initial) { controller.close(); return; }
      prevJson = JSON.stringify(initial);
      controller.enqueue(enc.encode(`data: ${prevJson}\n\n`));

      const interval = setInterval(async () => {
        try {
          const snap = await getSnapshot();
          if (!snap) return;
          const json = JSON.stringify(snap);
          if (json !== prevJson) {
            prevJson = json;
            controller.enqueue(enc.encode(`data: ${json}\n\n`));
          } else {
            controller.enqueue(enc.encode(`: ping\n\n`));
          }
        } catch { /* ignore */ }
      }, 1000);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
