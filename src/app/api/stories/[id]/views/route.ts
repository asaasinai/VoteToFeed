import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/stories/[id]/views — list viewers of a story (owner only)
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const story = await prisma.story.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });

  if (!story) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (story.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const views = await prisma.storyView.findMany({
    where: { storyId: params.id },
    orderBy: { viewedAt: "desc" },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
  });

  return NextResponse.json({
    count: views.length,
    viewers: views.map((v) => ({
      id: v.user.id,
      name: v.user.name,
      image: v.user.image,
      viewedAt: v.viewedAt.toISOString(),
    })),
  });
}
