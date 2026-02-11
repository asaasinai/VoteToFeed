import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/shelter-posts — Public feed of shelter impact posts
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const cursor = searchParams.get("cursor"); // for pagination

    const posts = await prisma.shelterPost.findMany({
      where: { isPublished: true },
      include: {
        author: { select: { name: true, image: true } },
        contest: { select: { id: true, name: true, type: true, petType: true, coverImage: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    return NextResponse.json(posts);
  } catch (error) {
    console.error("Error fetching shelter posts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/shelter-posts — Admin creates a new post
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { photos, caption, location, contestId } = body;

    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      return NextResponse.json({ error: "At least one photo is required" }, { status: 400 });
    }

    const post = await prisma.shelterPost.create({
      data: {
        photos,
        caption: caption || null,
        location: location || null,
        contestId: contestId || null,
        authorId: userId,
      },
      include: {
        author: { select: { name: true, image: true } },
        contest: { select: { id: true, name: true, type: true, petType: true } },
      },
    });

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    console.error("Error creating shelter post:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
