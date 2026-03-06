import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendCommentReceivedEmail } from "@/lib/resend";

// POST /api/comments - Create a comment
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as Record<string, unknown>).id as string;
    const { petId, text, parentId } = await req.json();

    if (!petId || !text) {
      return NextResponse.json(
        { error: "Pet ID and text required" },
        { status: 400 }
      );
    }

    if (text.length > 255) {
      return NextResponse.json(
        { error: "Comment must be 255 characters or less" },
        { status: 400 }
      );
    }

    const comment = await prisma.comment.create({
      data: {
        petId,
        userId,
        text,
        parentId: parentId || null,
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    });

    // Send comment notification email to pet owner (non-blocking)
    const pet = await prisma.pet.findUnique({
      where: { id: petId },
      include: { user: { select: { email: true } } },
    });
    if (pet?.user.email && pet.userId !== userId) {
      sendCommentReceivedEmail(
        pet.user.email,
        pet.name,
        pet.id,
        comment.user.name || "Someone",
        text
      ).catch(console.error);
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("Error creating comment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
