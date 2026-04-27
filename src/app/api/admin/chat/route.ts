import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail, emailShell } from "@/lib/email";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session?.user || role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = req.nextUrl.searchParams.get("status") || undefined;
    const conversationId = req.nextUrl.searchParams.get("conversationId");

    if (conversationId) {
      const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          user: { select: { name: true, email: true } },
        },
      });

      if (!conversation) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json({ conversation });
    }

    const ticketOnly = req.nextUrl.searchParams.get("ticket") === "true";
    const where: Record<string, unknown> = {};
    if (ticketOnly) {
      where.isTicket = true;
    } else if (status) {
      where.status = status as "OPEN" | "CLOSED";
    }

    const conversations = await prisma.chatConversation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: { messages: true } },
      },
    });

    return NextResponse.json({ conversations });
  } catch (e) {
    console.error("[admin/chat] GET:", e);
    return NextResponse.json(
      { error: "Couldn't load conversations. Please try again later." },
      { status: 500 },
    );
  }
}

// PATCH: Update conversation status or AI pause
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session?.user || role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    const { conversationId, status, aiPaused } = body;

    if (!conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};

    if (status && ["OPEN", "CLOSED"].includes(status)) {
      updateData.status = status;
      if (status === "CLOSED") {
        updateData.aiPaused = false;
      }
    }

    if (typeof aiPaused === "boolean") {
      updateData.aiPaused = aiPaused;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await prisma.chatConversation.update({
      where: { id: conversationId },
      data: updateData,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[admin/chat] PATCH:", e);
    return NextResponse.json(
      { error: "Couldn't update conversation. Please try again later." },
      { status: 500 },
    );
  }
}

// POST: Admin sends a manual reply to a conversation
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session?.user || role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    const { conversationId, message, emailSubject, emailBody } = body;

    if (!conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }

    if ((!message || typeof message !== "string" || message.trim().length === 0) && (!emailBody || typeof emailBody !== "string" || emailBody.trim().length === 0)) {
      return NextResponse.json({ error: "message or emailBody is required" }, { status: 400 });
    }

    const conversation = await prisma.chatConversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const trimmedMessage = message?.trim().slice(0, 2000) || "";
    const trimmedEmailBody = emailBody?.trim().slice(0, 5000) || "";
    const finalSubject = emailSubject?.trim() || "You have a new reply from VoteToFeed Support 🐾";

    const newMessage = await prisma.chatMessage.create({
      data: {
        conversationId,
        role: "ADMIN",
        content: trimmedMessage || `📧 Email sent to user with subject: ${finalSubject}`,
      },
    });

    await prisma.chatConversation.update({
      where: { id: conversationId },
      data: {
        lastMessage: trimmedMessage
          ? `[Admin] ${trimmedMessage.slice(0, 100)}`
          : `[Email] ${finalSubject}`,
        status: "OPEN",
        aiPaused: true,
      },
    });

    if (conversation.userEmail && trimmedEmailBody) {
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const safeBody = esc(trimmedEmailBody);
      const ticketShort = conversation.id.slice(-8).toUpperCase();
      const subjectWithTicket = finalSubject.includes(`#${ticketShort}`)
        ? finalSubject
        : `${finalSubject} [Ticket #${ticketShort}]`;
      sendEmail({
        from: "VoteToFeed Support <support@votetofeed.com>",
        replyTo: "support@votetofeed.com",
        to: conversation.userEmail,
        subject: subjectWithTicket,
        headers: {
          "X-VTF-Conversation-Id": conversation.id,
          "X-VTF-Ticket": ticketShort,
        },
        html: emailShell(`
          <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:1px;">💬 New Support Reply</p>
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#18181b;">Hello!</h1>
          <div style="margin:0 0 20px;padding:16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;">
            <p style="margin:0;font-size:14px;color:#18181b;white-space:pre-wrap;">${safeBody}</p>
          </div>
          <p style="margin:0 0 16px;font-size:14px;color:#52525b;">Just reply to this email and we'll see your message right in your support thread.</p>
          <p style="margin:0;font-size:12px;color:#a1a1aa;">Ticket #${ticketShort}</p>
        `, "You have a new reply from our support team."),
      }).catch((err) => console.error("Failed to send admin reply email:", err));
    }

    return NextResponse.json({ success: true, message: newMessage });
  } catch (e) {
    console.error("[admin/chat] POST:", e);
    return NextResponse.json(
      { error: "Couldn't send admin reply. Please try again later." },
      { status: 500 },
    );
  }
}
