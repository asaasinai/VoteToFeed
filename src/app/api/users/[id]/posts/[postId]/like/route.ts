import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendPostLikeNotification } from "@/lib/email";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

async function getReactionCounts(postId: string) {
  const all = await prisma.postLike.findMany({
    where: { postId },
    select: { reaction: true },
  });
  return {
    HEART: all.filter((l) => l.reaction === "HEART").length,
    HAHA: all.filter((l) => l.reaction === "HAHA").length,
    WOW: all.filter((l) => l.reaction === "WOW").length,
  };
}

// GET — list users who liked a post + reaction counts
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; postId: string } }
) {
  const likes = await prisma.postLike.findMany({
    where: { postId: params.postId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
  });

  const reactions = await getReactionCounts(params.postId);
  return NextResponse.json({
    users: likes.map((l) => ({ ...l.user, reaction: l.reaction })),
    reactions,
  });
}

// POST — toggle like / switch reaction on a post
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; postId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;

  let reaction = "HEART";
  try {
    const body = await req.json();
    if (["HEART", "HAHA", "WOW"].includes(body?.reaction)) reaction = body.reaction;
  } catch { /* default HEART */ }

  const existing = await prisma.postLike.findUnique({
    where: { postId_userId: { postId: params.postId, userId } },
  });

  if (existing) {
    if (existing.reaction === reaction) {
      // Same reaction tapped again → unlike
      await prisma.postLike.delete({ where: { id: existing.id } });
      const [count, reactions] = await Promise.all([
        prisma.postLike.count({ where: { postId: params.postId } }),
        getReactionCounts(params.postId),
      ]);
      return NextResponse.json({ liked: false, reaction: null, likeCount: count, reactions });
    } else {
      // Switching reaction
      await prisma.postLike.update({ where: { id: existing.id }, data: { reaction } });
      const [count, reactions] = await Promise.all([
        prisma.postLike.count({ where: { postId: params.postId } }),
        getReactionCounts(params.postId),
      ]);
      return NextResponse.json({ liked: true, reaction, likeCount: count, reactions });
    }
  } else {
    await prisma.postLike.create({ data: { postId: params.postId, userId, reaction } });

    // Send notification to post owner (fire-and-forget, skip self-like)
    prisma.userPost.findUnique({
      where: { id: params.postId },
      select: { content: true, userId: true, user: { select: { email: true, name: true, id: true } } },
    }).then((post) => {
      if (!post || post.userId === userId) return;
      if (!post.user.email) return;
      return prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      }).then((liker) => {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.votetofeed.com";
        return sendPostLikeNotification(
          post.user.email!,
          post.user.name || "there",
          liker?.name || "Someone",
          post.content,
          `${appUrl}/users/${post.userId}`
        );
      });
    }).catch((e) => console.error("[email] post like notification failed:", e));

    // Send In-App Notification (fire-and-forget, skip self-like)
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    }).then((liker) => {
      if (liker) {
        const reactionEmoji = reaction === "HAHA" ? "😂" : reaction === "WOW" ? "😮" : "❤️";
        const reactionVerb = reaction === "HAHA" ? "laughed at" : reaction === "WOW" ? "was amazed by" : "liked";
        return createNotification({
          userId: params.id,
          type: "LIKE",
          title: `${reactionEmoji} New Reaction`,
          message: `${liker.name || "Someone"} ${reactionVerb} your post. ${reactionEmoji}`,
          linkUrl: `/users/${params.id}#post-${params.postId}`,
          sourceUserId: userId,
        });
      }
    }).catch((e) => console.error("[notification] like failed:", e));

    const [count, reactions] = await Promise.all([
      prisma.postLike.count({ where: { postId: params.postId } }),
      getReactionCounts(params.postId),
    ]);
    return NextResponse.json({ liked: true, reaction, likeCount: count, reactions });
  }
}

