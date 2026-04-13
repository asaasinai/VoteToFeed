import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { emailShell } from "@/lib/email";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  if (!session?.user || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status") || undefined;
  const conversationId = req.nextUrl.searchParams.get("conversationId");

  // If requesting a specific conversation's messages
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

  // List all conversations
  const conversations = await prisma.chatConversation.findMany({
    where: status ? { status: status as "OPEN" | "CLOSED" } : undefined,
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      user: { select: { name: true, email: true } },
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({ conversations });
}

// PATCH: Update conversation status or AI pause
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  if (!session?.user || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { conversationId, status, aiPaused } = body;

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};

  if (status && ["OPEN", "CLOSED"].includes(status)) {
    updateData.status = status;
    // When closing a case, re-enable AI so the user gets AI responses if they write again
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
}

// POST: Admin sends a manual reply to a conversation
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  if (!session?.user || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { conversationId, message } = body;

  if (!conversationId || !message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "conversationId and message are required" }, { status: 400 });
  }

  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const trimmedMessage = message.trim().slice(0, 2000);

  const newMessage = await prisma.chatMessage.create({
    data: {
      conversationId,
      role: "ADMIN",
      content: trimmedMessage,
    },
  });

  // Reopen conversation if it was closed + pause AI (admin is handling it now)
  await prisma.chatConversation.update({
    where: { id: conversationId },
    data: {
      lastMessage: `[Admin] ${trimmedMessage.slice(0, 100)}`,
      status: "OPEN",
      aiPaused: true,
    },
  });

  // Send email notification to the user (if they have an email)
  if (conversation.userEmail) {
    const url = process.env.NEXT_PUBLIC_APP_URL || "https://www.votetofeed.com";
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const safeName = esc(conversation.userName?.split(" ")[0] || "there");
    const safeMessage = esc(trimmedMessage.slice(0, 500));
    sendEmail({
      from: "VoteToFeed Support <noreply@votetofeed.com>",
      to: conversation.userEmail,
      subject: "You have a new reply from VoteToFeed Support 🐾",
      html: emailShell(`
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:1px;">💬 New Support Reply</p>
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#18181b;">Hey ${safeName}!</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#52525b;">Our support team just replied to your chat:</p>
        <div style="margin:0 0 20px;padding:16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;">
          <p style="margin:0;font-size:14px;color:#18181b;white-space:pre-wrap;">${safeMessage}</p>
        </div>
        <p style="margin:0 0 16px;font-size:14px;color:#52525b;">Open the chat on our website to continue the conversation:</p>
        <a href="${url}" style="display:inline-block;padding:12px 24px;background:#f59e0b;color:#fff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">Open VoteToFeed →</a>
      `, "You have a new reply from our support team."),
    }).catch((err) => console.error("Failed to send admin reply email:", err));
  }

  return NextResponse.json({ success: true, message: newMessage });
}
