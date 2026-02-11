import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCurrentWeekId } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = (session.user as Record<string, unknown>).role;
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const weekId = getCurrentWeekId();

    const [
      totalUsers,
      totalPets,
      totalVotes,
      weeklyVoteStats,
      totalRevenue,
      weeklyRevenue,
      recentUsers,
      recentPets,
      recentPurchases,
      recentVotes,
      topPetsThisWeek,
      contestCount,
      usersByRole,
      petsByType,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.pet.count({ where: { isActive: true } }),
      prisma.vote.count(),
      prisma.petWeeklyStats.aggregate({
        where: { weekId },
        _sum: { totalVotes: true, paidVotes: true, freeVotes: true },
      }),
      prisma.purchase.aggregate({
        where: { status: "COMPLETED" },
        _sum: { amount: true, mealsProvided: true },
        _count: true,
      }),
      prisma.purchase.aggregate({
        where: {
          status: "COMPLETED",
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, name: true, email: true, role: true, createdAt: true, _count: { select: { pets: true, votes: true } } },
      }),
      prisma.pet.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, name: true, type: true, photos: true, ownerName: true, createdAt: true, _count: { select: { votes: true } } },
      }),
      prisma.purchase.findMany({
        where: { status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { user: { select: { name: true, email: true } } },
      }),
      prisma.vote.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          user: { select: { name: true } },
          pet: { select: { name: true } },
        },
      }),
      prisma.petWeeklyStats.findMany({
        where: { weekId },
        orderBy: { totalVotes: "desc" },
        take: 10,
        include: { pet: { select: { id: true, name: true, type: true, photos: true, ownerName: true } } },
      }),
      prisma.contest.count({ where: { isActive: true } }),
      prisma.user.groupBy({ by: ["role"], _count: true }),
      prisma.pet.groupBy({ by: ["type"], where: { isActive: true }, _count: true }),
    ]);

    return NextResponse.json({
      overview: {
        totalUsers,
        totalPets,
        totalVotes,
        activeContests: contestCount,
        weeklyVotes: weeklyVoteStats._sum.totalVotes ?? 0,
        weeklyPaidVotes: weeklyVoteStats._sum.paidVotes ?? 0,
        weeklyFreeVotes: weeklyVoteStats._sum.freeVotes ?? 0,
        totalRevenueCents: totalRevenue._sum.amount ?? 0,
        totalPurchases: totalRevenue._count,
        totalMealsProvided: totalRevenue._sum.mealsProvided ?? 0,
        weeklyRevenueCents: weeklyRevenue._sum.amount ?? 0,
        weeklyPurchases: weeklyRevenue._count,
      },
      usersByRole: usersByRole.map((r) => ({ role: r.role, count: r._count })),
      petsByType: petsByType.map((p) => ({ type: p.type, count: p._count })),
      recentUsers: recentUsers.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
      })),
      recentPets: recentPets.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
      })),
      recentPurchases: recentPurchases.map((p) => ({
        id: p.id,
        tier: p.packageTier,
        votes: p.votes,
        amount: p.amount,
        meals: p.mealsProvided,
        userName: p.user.name,
        userEmail: p.user.email,
        createdAt: p.createdAt.toISOString(),
      })),
      recentVotes: recentVotes.map((v) => ({
        id: v.id,
        type: v.voteType,
        userName: v.user.name,
        petName: v.pet.name,
        createdAt: v.createdAt.toISOString(),
      })),
      topPetsThisWeek: topPetsThisWeek.map((s, i) => ({
        rank: i + 1,
        petId: s.pet.id,
        petName: s.pet.name,
        petType: s.pet.type,
        photo: s.pet.photos[0] ?? null,
        ownerName: s.pet.ownerName,
        votes: s.totalVotes,
        paidVotes: s.paidVotes,
        freeVotes: s.freeVotes,
      })),
      weekId,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
