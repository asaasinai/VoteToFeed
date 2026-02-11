import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/admin/revenue — Filterable revenue data
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if ((session.user as { role?: string }).role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "all"; // today, 7d, 30d, 90d, all
    const tier = searchParams.get("tier") || ""; // STARTER, FRIEND, etc.
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "25"), 100);
    const skip = (page - 1) * limit;

    // Build date filter
    let dateFilter: Date | undefined;
    const now = new Date();
    if (range === "today") dateFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (range === "7d") dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (range === "30d") dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    else if (range === "90d") dateFilter = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const where: Record<string, unknown> = { status: "COMPLETED" };
    if (dateFilter) where.createdAt = { gte: dateFilter };
    if (tier) where.packageTier = tier;
    if (search) {
      where.user = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    const [purchases, total, aggregate, byTier] = await Promise.all([
      prisma.purchase.findMany({
        where,
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.purchase.count({ where }),
      prisma.purchase.aggregate({
        where,
        _sum: { amount: true, votes: true, mealsProvided: true },
        _count: true,
      }),
      prisma.purchase.groupBy({
        by: ["packageTier"],
        where,
        _sum: { amount: true, votes: true },
        _count: true,
        orderBy: { _sum: { amount: "desc" } },
      }),
    ]);

    return NextResponse.json({
      purchases: purchases.map((p) => ({
        id: p.id,
        tier: p.packageTier,
        votes: p.votes,
        amount: p.amount,
        meals: p.mealsProvided,
        userName: p.user.name,
        userEmail: p.user.email,
        createdAt: p.createdAt.toISOString(),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary: {
        totalRevenue: aggregate._sum.amount ?? 0,
        totalVotesSold: aggregate._sum.votes ?? 0,
        totalMeals: aggregate._sum.mealsProvided ?? 0,
        totalPurchases: aggregate._count,
        avgOrder: aggregate._count > 0 ? Math.round((aggregate._sum.amount ?? 0) / aggregate._count) : 0,
      },
      byTier: byTier.map((t) => ({
        tier: t.packageTier,
        revenue: t._sum.amount ?? 0,
        votes: t._sum.votes ?? 0,
        count: t._count,
      })),
    });
  } catch (error) {
    console.error("Admin revenue error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
