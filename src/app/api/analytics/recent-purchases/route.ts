import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

function abbreviateName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Someone";
  const first = parts[0];
  if (parts.length === 1) return first;
  return `${first} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

const TIER_EMOJI: Record<string, string> = {
  STARTER: "🐾",
  FRIEND: "💛",
  SUPPORTER: "💚",
  CHAMPION: "🏆",
  HERO: "⚡",
  LEGEND: "🌟",
  ICON: "👑",
};

const TIER_LABEL: Record<string, string> = {
  STARTER: "Starter Pack",
  FRIEND: "Friend Pack",
  SUPPORTER: "Supporter Pack",
  CHAMPION: "Champion Pack",
  HERO: "Hero Pack",
  LEGEND: "Legend Pack",
  ICON: "Icon Pack",
};

export async function GET() {
  try {
    const purchases = await prisma.purchase.findMany({
      where: { status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { user: { select: { name: true } } },
    });

    const result = purchases.map((p) => ({
      name: p.user?.name ? abbreviateName(p.user.name) : "Someone",
      pkg: TIER_LABEL[p.packageTier] ?? p.packageTier,
      votes: p.votes,
      emoji: TIER_EMOJI[p.packageTier] ?? "🐾",
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("[recent-purchases] Failed to fetch:", error);
    return NextResponse.json({ error: "Failed to fetch recent purchases" }, { status: 500 });
  }
}
