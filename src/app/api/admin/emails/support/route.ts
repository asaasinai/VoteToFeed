import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/admin/emails/support
//   ?conversationId=...   → return that conversation with full message thread
//   (no params)           → return list of tickets + per-ticket counts of sent/received emails
//
// "Sent" emails  = ADMIN messages whose content starts with "📧" (the admin reply email).
// "Received"     = USER messages whose content starts with "📧 Email reply" (from inbound webhook).
// Everything else is a normal chat message but is included in the thread.
export async function GET(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  if (!session?.user || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const conversationId = req.nextUrl.searchParams.get("conversationId");

  if (conversationId) {
    const conversation = await prisma.chatConversation.findUnique({
      where: { id: conversationId },
      include: {
        user: { select: { name: true, email: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const messages = conversation.messages.map((m) => {
      let kind: "chat" | "email_sent" | "email_received" = "chat";
      if (m.role === "ADMIN" && m.content.startsWith("📧")) kind = "email_sent";
      else if (m.role === "USER" && m.content.startsWith("📧 Email reply")) kind = "email_received";
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        kind,
      };
    });

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        ticketShort: conversation.id.slice(-8).toUpperCase(),
        userName: conversation.user?.name || conversation.userName,
        userEmail: conversation.user?.email || conversation.userEmail,
        status: conversation.status,
        isTicket: conversation.isTicket,
        ticketStage: conversation.ticketStage,
        ticketProblem: conversation.ticketProblem,
        ticketCreatedAt: conversation.ticketCreatedAt,
        aiPaused: conversation.aiPaused,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messages,
      },
    });
  }

  // List view: tickets first, then any conversation with an email on file
  const conversations = await prisma.chatConversation.findMany({
    where: {
      OR: [
        { isTicket: true },
        { userEmail: { not: null } },
      ],
    },
    orderBy: [
      { isTicket: "desc" },
      { updatedAt: "desc" },
    ],
    take: 100,
    include: {
      user: { select: { name: true, email: true } },
      messages: {
        select: { role: true, content: true, createdAt: true },
      },
    },
  });

  const summary = conversations.map((c) => {
    let sentCount = 0;
    let receivedCount = 0;
    let lastEmailAt: Date | null = null;
    let lastSentAt: Date | null = null;
    let lastReceivedAt: Date | null = null;
    for (const m of c.messages) {
      const isSent = m.role === "ADMIN" && m.content.startsWith("📧");
      const isRecv = m.role === "USER" && m.content.startsWith("📧 Email reply");
      if (isSent) {
        sentCount++;
        if (!lastSentAt || m.createdAt > lastSentAt) lastSentAt = m.createdAt;
      }
      if (isRecv) {
        receivedCount++;
        if (!lastReceivedAt || m.createdAt > lastReceivedAt) lastReceivedAt = m.createdAt;
      }
      if ((isSent || isRecv) && (!lastEmailAt || m.createdAt > lastEmailAt)) {
        lastEmailAt = m.createdAt;
      }
    }

    // "Awaiting admin" = customer's last email reply is more recent than admin's last sent email
    const hasUnansweredReply = lastReceivedAt !== null && (lastSentAt === null || lastReceivedAt > lastSentAt);

    return {
      id: c.id,
      ticketShort: c.id.slice(-8).toUpperCase(),
      userName: c.user?.name || c.userName,
      userEmail: c.user?.email || c.userEmail,
      status: c.status,
      isTicket: c.isTicket,
      ticketStage: c.ticketStage,
      ticketProblem: c.ticketProblem,
      ticketCreatedAt: c.ticketCreatedAt,
      aiPaused: c.aiPaused,
      lastMessage: c.lastMessage,
      updatedAt: c.updatedAt,
      sentCount,
      receivedCount,
      lastEmailAt,
      lastSentAt,
      lastReceivedAt,
      hasUnansweredReply,
      totalMessages: c.messages.length,
    };
  });

  // Roll-up stats for the top of the tab
  const totals = summary.reduce(
    (acc, c) => {
      acc.tickets += c.isTicket ? 1 : 0;
      acc.openTickets += c.isTicket && c.status === "OPEN" ? 1 : 0;
      acc.sent += c.sentCount;
      acc.received += c.receivedCount;
      acc.awaitingReply += c.hasUnansweredReply ? 1 : 0;
      return acc;
    },
    { tickets: 0, openTickets: 0, sent: 0, received: 0, awaitingReply: 0 },
  );

  return NextResponse.json({ conversations: summary, totals });
  } catch (e) {
    console.error("[admin/emails/support] GET:", e);
    return NextResponse.json(
      { error: "Couldn't load support conversations. Please try again later." },
      { status: 500 },
    );
  }
}
