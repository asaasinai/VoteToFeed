import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/stories/[id]/like — toggle like on a story
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;
  const storyId = params.id;

  const existing = await prisma.storyLike.findUnique({
    where: { storyId_userId: { storyId, userId } },
  });

  if (existing) {
    await prisma.storyLike.delete({ where: { id: existing.id } });
    const count = await prisma.storyLike.count({ where: { storyId } });
    return NextResponse.json({ liked: false, likeCount: count });
  } else {
    await prisma.storyLike.create({ data: { storyId, userId } });
    const count = await prisma.storyLike.count({ where: { storyId } });
    return NextResponse.json({ liked: true, likeCount: count });
  }
}
