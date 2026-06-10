import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// POST /api/admin/emails/manual-inbound
// Lets the admin manually paste a customer's email reply into a ticket thread.
// Body: { conversationId: string, subject?: string, body: string, fromEmail?: string }
// Creates a USER ChatMessage with the same "📧 Email reply" prefix the inbound webhook uses.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session?.user || role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const json = await req.json().catch(() => null);
    if (!json) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const conversationId = typeof json.conversationId === "string" ? json.conversationId : null;
    const rawBody = typeof json.body === "string" ? json.body.trim() : "";
    const subject = typeof json.subject === "string" ? json.subject.trim() : "";
    const fromEmail = typeof json.fromEmail === "string" ? json.fromEmail.trim().toLowerCase() : "";

    if (!conversationId) return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    if (!rawBody) return NextResponse.json({ error: "body is required" }, { status: 400 });

    const conversation = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

    const finalSubject = subject || "(no subject)";
    const truncated = rawBody.slice(0, 5000);
    const fromLine = fromEmail ? `From: ${fromEmail}\n` : "";

    const content = `📧 Email reply (subject: ${finalSubject})\n${fromLine}\n${truncated}`;

    const message = await prisma.chatMessage.create({
      data: {
        conversationId,
        role: "USER",
        content,
      },
    });

    await prisma.chatConversation.update({
      where: { id: conversationId },
      data: {
        status: "OPEN",
        lastMessage: `📧 ${truncated.slice(0, 120)}`,
        aiPaused: true,
        ...(fromEmail && !conversation.userEmail ? { userEmail: fromEmail } : {}),
      },
    });

    return NextResponse.json({ ok: true, messageId: message.id });
  } catch (e) {
    console.error("[admin/emails/manual-inbound] POST:", e);
    return NextResponse.json(
      { error: "Couldn't save the pasted reply. Please try again later." },
      { status: 500 },
    );
  }
}
