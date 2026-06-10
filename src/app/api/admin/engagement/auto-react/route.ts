import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ReactionWeights = { HEART: number; HAHA: number; WOW: number };

function weightedReaction(weights: ReactionWeights): string {
  const total = weights.HEART + weights.HAHA + weights.WOW;
  if (total <= 0) return "HEART";
  const r = Math.random() * total;
  if (r < weights.HEART) return "HEART";
  if (r < weights.HEART + weights.HAHA) return "HAHA";
  return "WOW";
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isAdmin(session: Awaited<ReturnType<typeof getServerSession<typeof authOptions>>>): boolean {
  return (session?.user as Record<string, unknown>)?.role === "ADMIN";
}

// GET — recent posts + demo account count
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  const [posts, demoCount] = await Promise.all([
    prisma.userPost.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        content: true,
        createdAt: true,
        userId: true,
        user: { select: { name: true, image: true } },
        _count: { select: { likes: true, comments: true } },
      },
    }),
    prisma.user.count({
      where: { email: { contains: "@iheartdogs.com" } },
    }),
  ]);

  return NextResponse.json({ posts, demoCount });
}

// POST — fire demo reactions
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    targetCount?: number;
    reactions?: ReactionWeights;
    minPerPost?: number;
    maxPerPost?: number;
    postIds?: string[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    targetCount = 20,
    reactions = { HEART: 70, HAHA: 20, WOW: 10 },
    minPerPost = 3,
    maxPerPost = 8,
    postIds,
  } = body;

  // Validate input
  const clampedMin = Math.max(1, minPerPost);
  const clampedMax = Math.max(clampedMin, maxPerPost);
  const clampedTarget = Math.min(Math.max(1, targetCount), 100);

  // Fetch demo accounts
  const demoAccounts = await prisma.user.findMany({
    where: { email: { contains: "@iheartdogs.com" } },
    select: { id: true },
  });

  if (demoAccounts.length === 0) {
    return NextResponse.json({ error: "No demo accounts found" }, { status: 400 });
  }

  // Fetch target posts
  const posts =
    Array.isArray(postIds) && postIds.length > 0
      ? await prisma.userPost.findMany({
          where: { id: { in: postIds } },
          select: { id: true, userId: true },
        })
      : await prisma.userPost.findMany({
          take: clampedTarget,
          orderBy: { createdAt: "desc" },
          select: { id: true, userId: true },
        });

  if (posts.length === 0) {
    return NextResponse.json({ error: "No posts found" }, { status: 400 });
  }

  // Build all reaction records — random subset of demo accounts per post
  const allData: { postId: string; userId: string; reaction: string }[] = [];

  for (const post of posts) {
    // Don't let demo accounts react to their own posts
    const eligible = demoAccounts.filter((a) => a.id !== post.userId);
    if (eligible.length === 0) continue;

    const count = Math.min(
      Math.floor(Math.random() * (clampedMax - clampedMin + 1)) + clampedMin,
      eligible.length
    );

    const selected = shuffle(eligible).slice(0, count);
    for (const account of selected) {
      allData.push({
        postId: post.id,
        userId: account.id,
        reaction: weightedReaction(reactions),
      });
    }
  }

  if (allData.length === 0) {
    return NextResponse.json({ error: "No eligible post/account combinations" }, { status: 400 });
  }

  // Batch upsert — skipDuplicates preserves existing reactions
  const created = await prisma.postLike.createMany({
    data: allData,
    skipDuplicates: true,
  });

  return NextResponse.json({
    success: true,
    postsTargeted: posts.length,
    reactionsCreated: created.count,
    skipped: allData.length - created.count,
    demoAccountsUsed: demoAccounts.length,
  });
}
