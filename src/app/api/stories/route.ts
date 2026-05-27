import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/stories — list active (non-expired) stories grouped by user
// Optional query param: ?userId=xxx — return only stories for that user
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const now = new Date();
  const { searchParams } = new URL(req.url);
  const filterUserId = searchParams.get("userId") || undefined;

  // Fetch all active stories with user info + view count for current user
  const stories = await prisma.story.findMany({
    where: {
      expiresAt: { gt: now },
      ...(filterUserId ? { userId: filterUserId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, image: true } },
      views: session?.user?.id
        ? { where: { userId: session.user.id }, select: { id: true } }
        : false,
    },
  });

  // Group by userId
  const byUser = new Map<
    string,
    {
      user: { id: string; name: string | null; image: string | null };
      stories: {
        id: string;
        mediaUrl: string;
        mediaType: string;
        caption: string | null;
        createdAt: string;
        expiresAt: string;
        viewed: boolean;
      }[];
      hasUnseen: boolean;
    }
  >();

  for (const s of stories) {
    const viewed = session?.user?.id ? s.views.length > 0 : false;
    if (!byUser.has(s.userId)) {
      byUser.set(s.userId, {
        user: s.user,
        stories: [],
        hasUnseen: false,
      });
    }
    const entry = byUser.get(s.userId)!;
    entry.stories.push({
      id: s.id,
      mediaUrl: s.mediaUrl,
      mediaType: s.mediaType,
      caption: s.caption,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      viewed,
    });
    if (!viewed) entry.hasUnseen = true;
  }

  // Sort each user's stories oldest-first (for sequential playback)
  for (const entry of byUser.values()) {
    entry.stories.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  // Build final list: own stories first, then followed users, then everyone else
  let result = Array.from(byUser.values());

  if (session?.user?.id) {
    const myId = session.user.id;

    // Fetch who the current user follows
    const follows = await prisma.follow.findMany({
      where: { followerId: myId },
      select: { followingId: true },
    });
    const followingSet = new Set(follows.map((f) => f.followingId));

    result.sort((a, b) => {
      const aIsMe = a.user.id === myId ? 0 : 1;
      const bIsMe = b.user.id === myId ? 0 : 1;
      if (aIsMe !== bIsMe) return aIsMe - bIsMe;

      const aFollowed = followingSet.has(a.user.id) ? 0 : 1;
      const bFollowed = followingSet.has(b.user.id) ? 0 : 1;
      if (aFollowed !== bFollowed) return aFollowed - bFollowed;

      // Unseen first
      const aUnseen = a.hasUnseen ? 0 : 1;
      const bUnseen = b.hasUnseen ? 0 : 1;
      return aUnseen - bUnseen;
    });
  }

  return NextResponse.json(result);
}

// POST /api/stories — create a new story
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { mediaUrl, mediaType = "image", caption } = body as {
    mediaUrl: string;
    mediaType?: string;
    caption?: string;
  };

  if (!mediaUrl || typeof mediaUrl !== "string") {
    return NextResponse.json({ error: "mediaUrl is required" }, { status: 400 });
  }
  if (!["image", "video"].includes(mediaType)) {
    return NextResponse.json({ error: "invalid mediaType" }, { status: 400 });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 h

  const story = await prisma.story.create({
    data: {
      userId: session.user.id,
      mediaUrl,
      mediaType,
      caption: caption?.trim().slice(0, 200) || null,
      expiresAt,
    },
  });

  return NextResponse.json(story, { status: 201 });
}
