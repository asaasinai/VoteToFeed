import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// DELETE /api/admin/demo-studio/scheduled-posts/[id] — cancel a scheduled post
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const post = await prisma.scheduledPost.findUnique({ where: { id: params.id } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.status !== "PENDING") {
    return NextResponse.json({ error: "Only PENDING posts can be cancelled" }, { status: 400 });
  }

  await prisma.scheduledPost.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
