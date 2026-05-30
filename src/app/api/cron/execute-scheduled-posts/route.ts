import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/cron/execute-scheduled-posts
// Called by Vercel Cron or any scheduler every minute/5 minutes
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Fetch all PENDING posts that are due
  const duePosts = await prisma.scheduledPost.findMany({
    where: {
      status: "PENDING",
      scheduledFor: { lte: now },
    },
    include: {
      user: { select: { id: true } },
    },
    take: 50,
  });

  if (duePosts.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  // Mark them as PROCESSING to prevent double-execution
  await prisma.scheduledPost.updateMany({
    where: { id: { in: duePosts.map((p) => p.id) } },
    data: { status: "PROCESSING" },
  });

  let published = 0;
  let failed = 0;

  for (const post of duePosts) {
    try {
      if (post.postType === "STORY") {
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        await prisma.story.create({
          data: {
            userId: post.userId,
            mediaUrl: post.imageUrl || "",
            mediaType: post.mediaType,
            caption: post.content.slice(0, 200),
            expiresAt,
          },
        });
      } else {
        await prisma.userPost.create({
          data: {
            userId: post.userId,
            content: post.content,
            imageUrl: post.imageUrl,
          },
        });
      }

      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: "PUBLISHED", processedAt: now },
      });
      published++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: "FAILED", processedAt: now, errorMessage: msg.slice(0, 500) },
      });
      failed++;
    }
  }

  return NextResponse.json({ processed: duePosts.length, published, failed });
}

// Also support GET for manual trigger from dashboard
export async function GET(req: NextRequest) {
  return POST(req);
}
