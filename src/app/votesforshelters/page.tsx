import prisma from "@/lib/prisma";
import { getCurrentWeekId, getWeekDateRange } from "@/lib/utils";
import { getAnimalType, getWeeklyVoteGoal } from "@/lib/admin-settings";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ShelterFeed } from "@/components/shelter/ShelterFeed";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function VotesForSheltersPage() {
  const weekId = getCurrentWeekId();
  const { start, end } = getWeekDateRange();
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user && (session.user as { role?: string }).role === "ADMIN";

  const [animalType, weeklyGoal, stats, weeklyMealsAgg, shelterPosts, contests] = await Promise.all([
    getAnimalType(),
    getWeeklyVoteGoal(),
    prisma.petWeeklyStats.aggregate({
      where: { weekId },
      _sum: { totalVotes: true, paidVotes: true },
    }),
    // Use stored mealsProvided from actual purchases — preserves historical accuracy
    prisma.purchase.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: start, lt: end } },
      _sum: { mealsProvided: true },
    }),
    prisma.shelterPost.findMany({
      where: { isPublished: true },
      include: {
        author: { select: { name: true, image: true } },
        contest: { select: { id: true, name: true, type: true, petType: true, coverImage: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    // For admin post form — active contests
    prisma.contest.findMany({
      where: { isActive: true, endDate: { gte: new Date() } },
      select: { id: true, name: true, type: true, petType: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const weeklyVotes = stats._sum.totalVotes ?? 0;
  const mealsHelped = Math.round(weeklyMealsAgg._sum.mealsProvided ?? 0);
  const pct = weeklyGoal ? Math.min(100, (weeklyVotes / weeklyGoal) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Hero */}
      <section className="relative overflow-hidden bg-white border-b border-surface-100">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-accent-50 via-transparent to-transparent opacity-60" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-50 border border-accent-200/60 text-xs font-medium text-accent-700 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse-subtle" />
            VotesForShelters
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight">
            Every vote helps feed shelter pets in need
          </h1>
          <p className="mt-3 text-lg text-surface-500 max-w-xl mx-auto">
            See the real impact of Vote to Feed. Powered by iHeartDogs &amp; iHeartCats.
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="card p-6 text-center bg-gradient-to-br from-brand-50 to-white border-brand-200/60">
            <p className="text-xs font-medium text-brand-600 uppercase tracking-wider">This Week</p>
            <p className="text-3xl font-bold text-brand-600 mt-2">{weeklyVotes.toLocaleString()}</p>
            <p className="text-sm text-surface-500 mt-1">votes cast</p>
          </div>
          <div className="card p-6 text-center bg-gradient-to-br from-accent-50 to-white border-accent-200/60">
            <p className="text-xs font-medium text-accent-600 uppercase tracking-wider">Shelter Pets Fed</p>
            <p className="text-3xl font-bold text-accent-600 mt-2">~{mealsHelped.toLocaleString()}</p>
            <p className="text-sm text-surface-500 mt-1">shelter pets fed</p>
          </div>
          <div className="card p-6 text-center">
            <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Weekly Goal</p>
            <p className="text-3xl font-bold text-surface-900 mt-2">{Math.round(pct)}%</p>
            <p className="text-sm text-surface-500 mt-1">{weeklyGoal.toLocaleString()} votes target</p>
          </div>
        </div>

        {/* Progress */}
        <div className="card p-6 mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-surface-900">Weekly Progress</h2>
            <span className="text-xs text-surface-400">{weeklyVotes.toLocaleString()} / {weeklyGoal.toLocaleString()}</span>
          </div>
          <div className="h-3 bg-surface-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-400 to-brand-500 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Shelter Impact Feed */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-surface-900">Shelter Impact</h2>
              <p className="text-sm text-surface-500 mt-0.5">Real photos from shelters we help support</p>
            </div>
          </div>

          <ShelterFeed
            initialPosts={shelterPosts.map((p) => ({
              id: p.id,
              photos: p.photos,
              caption: p.caption,
              location: p.location,
              author: p.author,
              contest: p.contest,
            }))}
            isAdmin={!!isAdmin}
            contests={contests.map((c) => ({ id: c.id, name: c.name, type: c.type, petType: c.petType }))}
          />
        </div>

        {/* Recent Vote Purchases */}
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-100">
            <h2 className="text-sm font-semibold text-surface-900">Recent Vote Purchases</h2>
          </div>
          <RecentPurchases />
        </div>
      </div>
    </div>
  );
}

// Server component for recent purchases
async function RecentPurchases() {
  const purchases = await prisma.purchase.findMany({
    where: { status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { user: { select: { name: true } } },
  });

  return (
    <ul className="divide-y divide-surface-50">
      {purchases.map((p) => (
        <li key={p.id} className="px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-xs flex-shrink-0">
              {(p.user.name || "?")[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm text-surface-800">
                <span className="font-medium">{p.user.name || "Someone"}</span> purchased <span className="font-semibold text-brand-600">{p.votes} votes</span>
              </p>
              <p className="text-xs text-accent-600 mt-0.5">~{Math.round(p.mealsProvided)} shelter pets helped</p>
            </div>
          </div>
        </li>
      ))}
      {purchases.length === 0 && (
        <li className="px-5 py-8 text-center text-sm text-surface-400">No purchases yet</li>
      )}
    </ul>
  );
}
