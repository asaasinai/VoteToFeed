import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// DELETE /api/stories/[id] — delete your own story
export async function DELETE(
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

  await prisma.story.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
