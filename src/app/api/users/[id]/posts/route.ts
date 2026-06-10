import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { sendNewPostNotification } from "@/lib/email";

export const dynamic = "force-dynamic";

// GET /api/users/[id]/posts — list posts for a user
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const viewerId = session?.user ? (session.user as { id: string }).id : null;

  const posts = await prisma.userPost.findMany({
    where: { userId: params.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      _count: { select: { likes: true, comments: true } },
      likes: { select: { userId: true, reaction: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, name: true, image: true } },
          _count: { select: { likes: true } },
          likes: viewerId ? { where: { userId: viewerId }, select: { id: true } } : false,
        },
      },
    },
  });

  const result = posts.map((p) => {
    const allLikes = p.likes as { userId: string; reaction: string }[];
    const myLike = viewerId ? allLikes.find((l) => l.userId === viewerId) : null;
    const reactions = {
      HEART: allLikes.filter((l) => l.reaction === "HEART").length,
      HAHA: allLikes.filter((l) => l.reaction === "HAHA").length,
      WOW: allLikes.filter((l) => l.reaction === "WOW").length,
    };
    return {
    id: p.id,
    content: p.content,
    imageUrl: p.imageUrl,
    createdAt: p.createdAt,
    likeCount: p._count.likes,
    commentCount: p._count.comments,
    isLiked: !!myLike,
    myReaction: myLike?.reaction ?? null,
    reactions,
    comments: p.comments.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      user: c.user,
      likeCount: c._count.likes,
      isLiked: viewerId ? (c.likes as { id: string }[]).length > 0 : false,
    })),
    };
  });

  return NextResponse.json({ posts: result });
}

// POST /api/users/[id]/posts — create a post (own profile only)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const currentUserId = (session.user as { id: string }).id;
  if (currentUserId !== params.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  interface CreatePostBody {
    content?: unknown;
    mediaUrls?: unknown[];
    imageUrl?: unknown;
  }
  const body = (await req.json()) as CreatePostBody;
  const content = (typeof body.content === "string" ? body.content : "").trim();
  if (!content) return NextResponse.json({ error: "Content required" }, { status: 400 });
  if (content.length > 1000) return NextResponse.json({ error: "Too long" }, { status: 400 });

  // Only allow URLs that originate from trusted media storage (prevent URL injection)
  // Vercel Blob URLs: https://<storeId>.public.blob.vercel-storage.com/...
  //                   https://public.blob.vercel-storage.com/...
  // Local dev uploads: /uploads/...
  function isTrustedMediaUrl(url: string): boolean {
    if (!url) return false;
    // Local disk fallback (dev only)
    if (url.startsWith("/uploads/")) return true;
    try {
      const { hostname, protocol } = new URL(url);
      if (protocol !== "https:") return false;
      if (hostname === "public.blob.vercel-storage.com") return true;
      if (hostname.endsWith(".public.blob.vercel-storage.com")) return true;
      // Custom BLOB_BASE_URL override
      if (process.env.BLOB_BASE_URL) {
        try { if (hostname === new URL(process.env.BLOB_BASE_URL).hostname) return true; } catch { /* ignore */ }
      }
      return false;
    } catch { return false; }
  }

  // Support mediaUrls[] (multi-image/video) stored as JSON, or single imageUrl for compat
  let imageUrl: string | null = null;
  if (Array.isArray(body.mediaUrls) && body.mediaUrls.length > 0) {
    const urls = (body.mediaUrls as unknown[])
      .filter((u): u is string => typeof u === "string" && isTrustedMediaUrl(u.trim()))
      .slice(0, 3);
    imageUrl = urls.length === 1 ? urls[0] : urls.length > 1 ? JSON.stringify(urls) : null;
  } else if (typeof body.imageUrl === "string" && isTrustedMediaUrl(body.imageUrl.trim())) {
    imageUrl = body.imageUrl.trim();
  }

  const post = await prisma.userPost.create({
    data: {
      content,
      imageUrl,
      userId: currentUserId,
    },
    select: { id: true, content: true, imageUrl: true, createdAt: true },
  });

  // Fire-and-forget: notify followers of this new post (in-app + email)
  void (async () => {
    try {
      const [author, followers] = await Promise.all([
        prisma.user.findUnique({ where: { id: currentUserId }, select: { name: true } }),
        prisma.follow.findMany({
          where: { followingId: currentUserId },
          select: { follower: { select: { id: true, email: true, name: true } } },
          take: 200,
        }),
      ]);
      const authorName = author?.name || "Someone";
      const preview = content.length > 80 ? content.slice(0, 80) + "\u2026" : content;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.votetofeed.com";
      const postUrl = `${appUrl}/feed#post-${post.id}`;

      await Promise.allSettled(
        followers.map(async (f) => {
          const u = f.follower;
          await createNotification({
            userId: u.id,
            type: "SYSTEM",
            title: `${authorName} posted something new`,
            message: preview,
            linkUrl: postUrl,
            sourceUserId: currentUserId,
          });
          if (u.email) {
            await sendNewPostNotification(u.email, u.name || "there", authorName, preview, postUrl);
          }
        }),
      );
    } catch (e) {
      console.error("[new-post] follower notifications failed:", e);
    }
  })();

  return NextResponse.json(post, { status: 201 });
}

// DELETE /api/users/[id]/posts — delete a post (own profile only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const currentUserId = (session.user as { id: string }).id;
  if (currentUserId !== params.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { postId } = await req.json();
  await prisma.userPost.deleteMany({ where: { id: postId, userId: currentUserId } });

  return NextResponse.json({ ok: true });
}
