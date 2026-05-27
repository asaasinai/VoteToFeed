import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/stories/[id]/view — record that the current user has viewed this story
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const story = await prisma.story.findUnique({
    where: { id: params.id },
    select: { id: true, expiresAt: true },
  });

  if (!story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  if (story.expiresAt < new Date()) {
    return NextResponse.json({ error: "Story expired" }, { status: 410 });
  }

  // Upsert so calling this multiple times is safe
  await prisma.storyView.upsert({
    where: { storyId_userId: { storyId: params.id, userId: session.user.id } },
    create: { storyId: params.id, userId: session.user.id },
    update: { viewedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
