import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/admin/demo-studio/scheduled-posts
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const posts = await prisma.scheduledPost.findMany({
    orderBy: { scheduledFor: "asc" },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });

  return NextResponse.json({ posts });
}

// POST /api/admin/demo-studio/scheduled-posts
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId, content, imageUrl, mediaType = "image", postType = "POST", scheduledFor } = await req.json() as {
    userId: string;
    content: string;
    imageUrl?: string;
    mediaType?: string;
    postType?: "POST" | "STORY";
    scheduledFor: string;
  };

  if (!userId || !content || !scheduledFor) {
    return NextResponse.json({ error: "userId, content, and scheduledFor are required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const post = await prisma.scheduledPost.create({
    data: {
      userId,
      content,
      imageUrl,
      mediaType,
      postType: postType as "POST" | "STORY",
      scheduledFor: new Date(scheduledFor),
    },
  });

  return NextResponse.json({ post }, { status: 201 });
}
