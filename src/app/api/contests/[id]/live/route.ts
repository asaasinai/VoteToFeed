import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/contests/[id]/live?limit=200
// Server-Sent Events stream — pushes leaderboard updates in real time
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const limit = Math.min(200, parseInt(req.nextUrl.searchParams.get("limit") ?? "200"));

  const contest = await prisma.contest.findUnique({
    where: { id },
    select: {
      startDate: true,
      endDate: true,
      entries: {
        where: { pet: { isActive: true } },
        select: { petId: true, pet: { select: { id: true, name: true, photos: true, type: true } } },
      },
    },
  });

  if (!contest) {
    return new Response("Not found", { status: 404 });
  }

  const petIds = contest.entries.map((e) => e.petId);
  const dateFilter = { gte: contest.startDate, lte: contest.endDate };
  const petMap = new Map(contest.entries.map((e) => [e.petId, e.pet]));

  let prevSnapshot = "";

  async function getVotes(): Promise<string> {
    if (petIds.length === 0) return JSON.stringify({ entries: [], updatedAt: new Date().toISOString() });

    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

    const [contestVotes, anonVotes, mVotes, mAnon] = await Promise.all([
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
      prisma.vote.groupBy({
        by: ["petId"],
        where: { petId: { in: petIds }, createdAt: { gte: tenMinAgo } },
        _sum: { quantity: true },
      }),
      prisma.anonymousVote.groupBy({
        by: ["petId"],
        where: { petId: { in: petIds }, createdAt: { gte: tenMinAgo } },
        _count: true,
      }),
    ]);

    const votesByPet = new Map<string, number>();
    for (const v of contestVotes) votesByPet.set(v.petId, (votesByPet.get(v.petId) ?? 0) + (v._sum.quantity ?? 0));
    for (const v of anonVotes) votesByPet.set(v.petId, (votesByPet.get(v.petId) ?? 0) + v._count);

    const momentumMap = new Map<string, number>();
    for (const v of mVotes) momentumMap.set(v.petId, (momentumMap.get(v.petId) ?? 0) + (v._sum.quantity ?? 0));
    for (const v of mAnon) momentumMap.set(v.petId, (momentumMap.get(v.petId) ?? 0) + v._count);

    const entries = [...petMap.entries()]
      .map(([petId, pet]) => ({ id: pet.id, name: pet.name, photos: pet.photos, type: pet.type, votes: votesByPet.get(petId) ?? 0, momentum: momentumMap.get(petId) ?? 0 }))
      .sort((a, b) => b.votes - a.votes)
      .slice(0, limit);

    return JSON.stringify({ entries, updatedAt: new Date().toISOString() });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      // Send initial data immediately
      const initial = await getVotes();
      prevSnapshot = initial;
      controller.enqueue(enc.encode(`data: ${initial}\n\n`));

      // Poll every 3 seconds, only send when data changes
      const interval = setInterval(async () => {
        try {
          const snapshot = await getVotes();
          if (snapshot !== prevSnapshot) {
            prevSnapshot = snapshot;
            controller.enqueue(enc.encode(`data: ${snapshot}\n\n`));
          } else {
            // Keep-alive ping every cycle to prevent timeout
            controller.enqueue(enc.encode(`: ping\n\n`));
          }
        } catch {
          // ignore DB errors mid-stream
        }
      }, 3000);

      // Clean up when client disconnects
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
