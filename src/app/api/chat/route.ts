import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "@/lib/prisma";
import { CHAT_SYSTEM_PROMPT } from "@/lib/chat-knowledge";
import { getContestLeaderboard } from "@/lib/contest-growth";
import { getCurrentWeekId, getWeekDateRange } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { emailShell } from "@/lib/email";

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : process.env.GOOGLE_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
  : null;

// Simple in-memory rate limiter (per session) — resets on redeploy
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 20; // max messages per window
const RATE_LIMIT_WINDOW = 60_000; // 1 minute

function isRateLimited(sessionId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(sessionId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(sessionId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// Only Gemini is used for AI responses

// Fetch live site context for the AI
async function getLiveContext(userId?: string) {
  try {
    const weekId = getCurrentWeekId();
    const now = new Date();
    const { start, end } = getWeekDateRange();

  const [
    weeklyStats,
    totalPets,
    activeContests,
    weeklyMeals,
    topPets,
    userPets,
    userData,
    recentWinners,
  ] = await Promise.all([
    prisma.petWeeklyStats.aggregate({
      where: { weekId },
      _sum: { totalVotes: true },
    }),
    prisma.pet.count({ where: { isActive: true } }),
    prisma.contest.findMany({
      where: { isActive: true, endDate: { gte: now }, startDate: { lte: now } },
      select: { id: true, name: true, petType: true, endDate: true, _count: { select: { entries: true } } },
      orderBy: { endDate: "asc" },
      take: 5,
    }),
    prisma.purchase.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: start, lt: end } },
      _sum: { mealsProvided: true },
    }),
    prisma.petWeeklyStats.findMany({
      where: { weekId, pet: { isActive: true } },
      include: { pet: { select: { name: true, type: true } } },
      orderBy: { totalVotes: "desc" },
      take: 3,
    }),
    userId
      ? prisma.pet.findMany({
          where: { userId, isActive: true },
          select: {
            id: true, name: true, type: true,
            weeklyStats: { where: { weekId }, select: { totalVotes: true, rank: true } },
          },
        })
      : Promise.resolve([]),
    userId
      ? prisma.user.findUnique({
          where: { id: userId },
          select: { freeVotesRemaining: true, paidVoteBalance: true },
        })
      : Promise.resolve(null),
    // Recent contest winners (last 4 weeks)
    prisma.prize.findMany({
      where: {
        winnerId: { not: null },
        awardedAt: { not: null },
        placement: { in: [1, 2, 3] },
        contest: { endDate: { gte: new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000) } },
      },
      select: {
        placement: true,
        title: true,
        contest: { select: { name: true, petType: true, endDate: true } },
        winnerId: true,
      },
      orderBy: { contest: { endDate: "desc" } },
      take: 15,
    }),
  ]);

  const lines: string[] = [];
  lines.push(`\n--- LIVE SITE DATA (right now) ---`);
  lines.push(`This week's total votes: ${weeklyStats._sum.totalVotes ?? 0}`);
  lines.push(`Total active pets: ${totalPets}`);
  lines.push(`Meals provided this week: ${Math.round(weeklyMeals._sum.mealsProvided ?? 0)}`);

  if (activeContests.length > 0) {
    lines.push(`\nActive contests right now:`);
    activeContests.forEach((c) => {
      const daysLeft = Math.ceil((c.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      lines.push(`- "${c.name}" (${c.petType}) — ${c._count.entries} entries, ${daysLeft} days left`);
    });
  } else {
    lines.push(`No active contests right now.`);
  }

  if (topPets.length > 0) {
    lines.push(`\nTop pets this week:`);
    topPets.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.pet.name} (${p.pet.type}) — ${p.totalVotes} votes`);
    });
  }

  // Recent contest winners
  if (recentWinners.length > 0) {
    // Resolve winner pet names
    const winnerPetIds = [...new Set(recentWinners.map((w) => w.winnerId!))];
    const winnerPets = await prisma.pet.findMany({
      where: { id: { in: winnerPetIds } },
      select: { id: true, name: true, type: true },
    });
    const petMap = new Map(winnerPets.map((p) => [p.id, p]));

    // Group by contest
    const contestMap = new Map<string, typeof recentWinners>();
    for (const w of recentWinners) {
      const key = w.contest.name;
      if (!contestMap.has(key)) contestMap.set(key, []);
      contestMap.get(key)!.push(w);
    }

    lines.push(`\nRecent contest winners:`);
    for (const [contestName, winners] of contestMap) {
      const endStr = new Date(winners[0].contest.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      lines.push(`"${contestName}" (ended ${endStr}):`);
      for (const w of winners.sort((a, b) => a.placement - b.placement)) {
        const pet = petMap.get(w.winnerId!);
        lines.push(`  #${w.placement} — ${pet?.name ?? "Unknown"} (${pet?.type ?? "?"})`);
      }
    }
  }

  if (userPets.length > 0) {
    lines.push(`\nThis user's pets:`);
    userPets.forEach((p) => {
      const stats = p.weeklyStats[0];
      lines.push(`- ${p.name} (${p.type}) — ${stats?.totalVotes ?? 0} votes this week, rank #${stats?.rank ?? "unranked"}`);
    });

    // Fetch contest-specific standings for each of the user's pets
    try {
      const userPetIds = new Set(userPets.map((p) => p.id));
      const contestLines: string[] = [];

      for (const contest of activeContests) {
        const leaderboard = await getContestLeaderboard(contest.id);
        const userEntries = leaderboard.filter((row) => userPetIds.has(row.petId));
        if (userEntries.length === 0) continue;

        const daysLeft = Math.ceil((contest.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        for (const entry of userEntries) {
          const aboveEntry = entry.rank > 1 ? leaderboard.find((r) => r.rank === entry.rank - 1) : null;
          const votesNeeded = aboveEntry ? aboveEntry.totalVotes - entry.totalVotes + 1 : 0;
          contestLines.push(`- ${entry.petName} in "${contest.name}": rank #${entry.rank}, ${entry.totalVotes} votes, ${daysLeft} days left${votesNeeded > 0 ? `, needs ${votesNeeded} more votes to move up to #${entry.rank - 1}` : ""}`);
        }
      }

      if (contestLines.length > 0) {
        lines.push(`\nThis user's pets in active contests:`);
        lines.push(...contestLines);
      }
    } catch (err) {
      // Contest details are supplementary, don't fail the whole context
      console.error("Error fetching contest standings for chat:", err);
    }
  }

  if (userData) {
    lines.push(`\nThis user's vote balance:`);
    lines.push(`- Free votes remaining this week: ${userData.freeVotesRemaining}`);
    lines.push(`- Paid votes available: ${userData.paidVoteBalance}`);
    if (userData.paidVoteBalance === 0) {
      lines.push(`- HINT: This user has no paid votes. If they want more votes or want to help their pet win, suggest buying a vote package!`);
    }
  }

  return lines.join("\n");
  } catch (err) {
    console.error("getLiveContext error:", err);
    return "\n--- LIVE SITE DATA ---\nLive data temporarily unavailable.";
  }
}

async function getAIResponse(
  history: { role: "user" | "assistant"; content: string }[],
  systemPrompt: string,
): Promise<string> {
  if (!gemini) {
    return "AI support is temporarily unavailable. Type \"open a ticket\" and our team will help you! 🐾";
  }

  try {
    const model = gemini.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: systemPrompt,
      generationConfig: { maxOutputTokens: 600, temperature: 0.85 },
    });
    const geminiHistory = history.slice(0, -1).map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));
    const lastMsg = history[history.length - 1]?.content ?? "";
    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(lastMsg);
    const text = await result.response.text();
    if (text) return text;
  } catch (err) {
    console.error("Gemini chat error:", err);
  }

  return "Hmm, I'm having a small hiccup on my end. If you need help now, just type \"open a ticket\" and I'll get our team on it right away! 🐾";
}

// Detect if the user wants to talk to a human / open a ticket
const ESCALATION_PATTERNS = [
  /\bhuman\b/i, /\breal\s*person\b/i, /\bsupport\s*agent\b/i,
  /\bopen\s*a?\s*ticket\b/i, /\bcreate\s*a?\s*ticket\b/i, /\bfile\s*a?\s*(ticket|complaint|report)\b/i,
  /\bconnect\s*me\b/i, /\btalk\s*to\s*(someone|a\s*person|support|agent|admin)\b/i,
  /\bspeak\s*to/i, /\bcontact\s*(support|someone|admin|team)\b/i,
  /\breport\s*a?\s*(bug|problem|issue)\b/i,
  /\byes\b.*\b(connect|human|agent|person|ticket)\b/i,
  /\bnjeri\b/i, /\bdikush\b/i, /\bme\s*fol\b/i, /\bna\s*kontakto/i,
  /\bhap\s*(nje|një)?\s*tiket/i, /\btiket/i, /\braporto/i,
  /\bpo\b.*\b(ndihm|kontakt|tiket)/i,
];

function isEscalationRequest(message: string, aiResponse: string): boolean {
  const combined = message.toLowerCase();
  if (ESCALATION_PATTERNS.some((p) => p.test(combined))) return true;
  // Also check if the AI itself suggested a ticket and user confirmed
  if (/\b(yes|ok|sure|yeah|po|aha|please|please do|po te lutem|do)\b/i.test(message) && /ticket|support team|human/i.test(aiResponse)) return true;
  return false;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Fetch every admin email (USER role = ADMIN). Falls back to SUPPORT_EMAIL or hard-coded address
// if the DB has no admins (e.g. before seed runs).
async function getAdminRecipients(): Promise<string[]> {
  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", email: { not: null } },
      select: { email: true },
    });
    const list = admins.map((a) => a.email!).filter(Boolean);
    if (list.length > 0) return Array.from(new Set(list));
  } catch (err) {
    console.error("getAdminRecipients error:", err);
  }
  // Fallback recipients
  const fallback = (process.env.SUPPORT_EMAIL || "krenar@homelifemedia.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fallback;
}

// Best-effort email regex (used to recover an address from chat text)
function extractEmail(text: string): string | null {
  const m = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return m ? m[0] : null;
}

async function sendEscalationEmail(conversationId: string, userName: string | null, userEmail: string | null, lastMessage: string) {
  try {
    const url = process.env.NEXT_PUBLIC_APP_URL || "https://www.votetofeed.com";
    const safeName = escHtml(userName || "Anonymous");
    const safeEmail = escHtml(userEmail || "Not provided");
    const safeMessage = escHtml(lastMessage.slice(0, 500));
    const recipients = await getAdminRecipients();
    await sendEmail({
      from: "VoteToFeed Support <noreply@votetofeed.com>",
      to: recipients,
      subject: `🔔 Support Request — ${userName || "Anonymous User"} needs help`,
      html: emailShell(`
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:1px;">🔔 Live Support Request</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:900;color:#18181b;">Someone needs help!</h1>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr><td style="padding:12px 16px;border-bottom:1px solid #f4f4f5;">
            <p style="margin:0;font-size:13px;color:#71717a;">Name</p>
            <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#18181b;">${safeName}</p>
          </td></tr>
          <tr><td style="padding:12px 16px;border-bottom:1px solid #f4f4f5;">
            <p style="margin:0;font-size:13px;color:#71717a;">Email</p>
            <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#18181b;">${safeEmail}</p>
          </td></tr>
          <tr><td style="padding:12px 16px;">
            <p style="margin:0;font-size:13px;color:#71717a;">Last Message</p>
            <p style="margin:4px 0 0;font-size:15px;color:#18181b;">${safeMessage}</p>
          </td></tr>
        </table>
        <p style="margin:0 0 16px;font-size:14px;color:#52525b;">Reply to this user from the admin chat panel:</p>
        <a href="${url}/admin/chat" style="display:inline-block;padding:12px 24px;background:#dc2626;color:#fff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">Open Admin Chat →</a>
      `, "A user needs live support — check the admin chat panel."),
    });
    console.log("Escalation email sent for conversation", conversationId, "to", recipients.length, "admin(s)");
  } catch (err) {
    console.error("Failed to send escalation email:", err);
  }
}

// Send a richer email when a support TICKET is created from chat
async function sendTicketCreatedEmail(args: {
  conversationId: string;
  userName: string | null;
  userEmail: string | null;
  problem: string;
  recentMessages: { role: string; content: string }[];
}) {
  try {
    const url = process.env.NEXT_PUBLIC_APP_URL || "https://www.votetofeed.com";
    const safeName = escHtml(args.userName || "Anonymous");
    const safeEmail = escHtml(args.userEmail || "Not provided");
    const safeProblem = escHtml(args.problem.slice(0, 2000));
    const ticketIdShort = args.conversationId.slice(-8).toUpperCase();

    const transcript = args.recentMessages
      .slice(-12)
      .map((m) => {
        const who =
          m.role === "USER" ? "User" : m.role === "ADMIN" ? "Admin" : "AI";
        const color =
          m.role === "USER" ? "#0ea5e9" : m.role === "ADMIN" ? "#2563eb" : "#71717a";
        return `<div style="margin:0 0 8px;"><span style="font-size:11px;font-weight:700;color:${color};">${who}</span><div style="font-size:13px;color:#18181b;white-space:pre-wrap;">${escHtml(m.content.slice(0, 600))}</div></div>`;
      })
      .join("");

    const recipients = await getAdminRecipients();
    await sendEmail({
      from: "VoteToFeed Support <noreply@votetofeed.com>",
      to: recipients,
      replyTo: args.userEmail || undefined,
      subject: `🎫 New Support Ticket #${ticketIdShort} — ${args.userName || "Anonymous"}`,
      html: emailShell(`
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;">🎫 New Support Ticket</p>
        <h1 style="margin:0 0 12px;font-size:24px;font-weight:900;color:#18181b;">Ticket #${ticketIdShort}</h1>
        <p style="margin:0 0 16px;font-size:14px;color:#52525b;">A user created a support ticket from the live chat. Please reply within 24–48 hours.</p>

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr><td style="padding:12px 16px;border-bottom:1px solid #f4f4f5;">
            <p style="margin:0;font-size:13px;color:#71717a;">Name</p>
            <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#18181b;">${safeName}</p>
          </td></tr>
          <tr><td style="padding:12px 16px;border-bottom:1px solid #f4f4f5;">
            <p style="margin:0;font-size:13px;color:#71717a;">Email (reply directly to this email to respond)</p>
            <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#18181b;">${safeEmail}</p>
          </td></tr>
          <tr><td style="padding:12px 16px;">
            <p style="margin:0;font-size:13px;color:#71717a;">Problem Description</p>
            <p style="margin:4px 0 0;font-size:15px;color:#18181b;white-space:pre-wrap;">${safeProblem}</p>
          </td></tr>
        </table>

        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:1px;">Recent transcript</p>
        <div style="margin:0 0 16px;padding:12px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">${transcript || '<span style="color:#a1a1aa;font-size:13px;">No previous messages.</span>'}</div>

        <a href="${url}/admin/chat" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">Open Admin Chat →</a>
      `, `New support ticket from ${args.userName || "an anonymous user"} — reply within 24-48 hours.`),
    });
    console.log("Ticket email sent for conversation", args.conversationId, "to", recipients.length, "admin(s)");
  } catch (err) {
    console.error("Failed to send ticket email:", err);
  }
}

// POST: Send a message and get AI response
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, sessionId, userName, userEmail, userId } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    // Validate userId: if provided, verify it matches the authenticated session
    let verifiedUserId: string | null = null;
    let verifiedUserName: string | null = typeof userName === "string" ? userName : null;
    let verifiedUserEmail: string | null = typeof userEmail === "string" ? userEmail : null;

    if (userId) {
      const { getServerSession } = await import("next-auth");
      const { authOptions } = await import("@/lib/auth");
      const session = await getServerSession(authOptions);
      const sessionUser = session?.user as { id?: string; name?: string; email?: string } | undefined;

      if (sessionUser && sessionUser.id === userId) {
        verifiedUserId = userId;
        verifiedUserName = sessionUser.name || verifiedUserName;
        verifiedUserEmail = sessionUser.email || verifiedUserEmail;
      }
      // If userId doesn't match session, silently ignore it (don't trust client)
    }

    const trimmedMessage = message.trim().slice(0, 1000);

    // Rate limit check
    if (isRateLimited(sessionId)) {
      return NextResponse.json(
        { error: "Too many messages. Please wait a moment and try again." },
        { status: 429 }
      );
    }

    // Find or create conversation
    let conversation = await prisma.chatConversation.findUnique({
      where: { sessionId },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } },
    });

    if (!conversation) {
      conversation = await prisma.chatConversation.create({
        data: {
          sessionId,
          lastMessage: trimmedMessage,
          userName: verifiedUserName,
          userEmail: verifiedUserEmail,
          userId: verifiedUserId,
        },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } },
      });
    }

    // If conversation was CLOSED and user sends a new message, re-enable AI
    if (conversation.status === "CLOSED") {
      conversation = await prisma.chatConversation.update({
        where: { id: conversation.id },
        data: { status: "OPEN", aiPaused: false },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } },
      });
    }

    if (verifiedUserId && !conversation.userId) {
      // Link user if they logged in after starting the conversation
      await prisma.chatConversation.update({
        where: { id: conversation.id },
        data: {
          userId: verifiedUserId,
          userName: verifiedUserName || conversation.userName,
          userEmail: verifiedUserEmail || conversation.userEmail,
        },
      });
    }

    // Save user message
    await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: trimmedMessage,
      },
    });

    // Update last message
    await prisma.chatConversation.update({
      where: { id: conversation.id },
      data: { lastMessage: trimmedMessage },
    });

    // If AI is paused (admin is handling), don't generate AI response
    if (conversation.aiPaused) {
      return NextResponse.json({
        reply: null,
        aiPaused: true,
      });
    }

    // ─── SUPPORT TICKET FLOW ────────────────────────────────────────
    // Stages: null → AWAITING_PROBLEM → (AWAITING_EMAIL?) → OPEN_TICKET
    const stage = (conversation.ticketStage || null) as
      | null
      | "AWAITING_PROBLEM"
      | "AWAITING_EMAIL"
      | "OPEN_TICKET"
      | "RESOLVED";

    const knownEmail = verifiedUserEmail || conversation.userEmail;
    const ticketShort = conversation.id.slice(-8).toUpperCase();
    // Capture in const so closures below always see a non-null reference
    const conv = conversation;

    async function finalizeTicket(opts: { problem: string; emailToUse: string }) {
      await prisma.chatConversation.update({
        where: { id: conv.id },
        data: {
          userEmail: knownEmail || opts.emailToUse,
          ticketProblem: opts.problem,
          ticketStage: "OPEN_TICKET",
          isTicket: true,
          ticketCreatedAt: new Date(),
          aiPaused: true,
          lastMessage: `[🎫 TICKET] ${opts.problem.slice(0, 200)}`,
        },
      });

      const firstName = (verifiedUserName || conv.userName || "").split(" ")[0];
      const greeting = firstName ? `Thanks, ${firstName}! ` : "Thanks! ";
      const reply =
        `🎫 **Ticket #${ticketShort} created!**\n\n` +
        `${greeting}Our support team will email you at **${opts.emailToUse}** within **24–48 hours**.\n\n` +
        `📬 Please check both your **inbox** and your **junk/spam folder** so you don't miss our reply.\n\n` +
        `If anything else comes to mind, you can keep typing here and we'll see it. 🐾`;

      await prisma.chatMessage.create({
        data: { conversationId: conv.id, role: "ASSISTANT", content: reply },
      });

      // Pull full transcript and notify all admins
      const recentMessages = await prisma.chatMessage.findMany({
        where: { conversationId: conv.id },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      sendTicketCreatedEmail({
        conversationId: conv.id,
        userName: verifiedUserName || conv.userName,
        userEmail: opts.emailToUse,
        problem: opts.problem,
        recentMessages,
      });

      return reply;
    }

    // Step 2: User is providing the problem description
    if (stage === "AWAITING_PROBLEM") {
      const fromMessage = extractEmail(trimmedMessage);
      const emailToUse = knownEmail || fromMessage;

      if (!emailToUse) {
        // Save problem and ask for email
        await prisma.chatConversation.update({
          where: { id: conversation.id },
          data: { ticketProblem: trimmedMessage, ticketStage: "AWAITING_EMAIL" },
        });
        const reply =
          `Got it — thanks for the details! 🙏\n\n` +
          `What's the **best email address** to reach you at? ` +
          `We'll send our reply there within **24–48 hours** (please check **inbox AND junk/spam folder**).`;
        await prisma.chatMessage.create({
          data: { conversationId: conversation.id, role: "ASSISTANT", content: reply },
        });
        return NextResponse.json({ reply });
      }

      const reply = await finalizeTicket({ problem: trimmedMessage, emailToUse });
      return NextResponse.json({ reply, ticketCreated: true });
    }

    // Step 3: Awaiting email after problem captured
    if (stage === "AWAITING_EMAIL") {
      const fromMessage = extractEmail(trimmedMessage);
      if (!fromMessage) {
        const reply =
          `Hmm, I couldn't read an email there. ` +
          `Could you type it like **name@example.com**? Then I'll create your ticket. 🙏`;
        await prisma.chatMessage.create({
          data: { conversationId: conversation.id, role: "ASSISTANT", content: reply },
        });
        return NextResponse.json({ reply });
      }

      const problem = conversation.ticketProblem || trimmedMessage;
      const replyText = await finalizeTicket({ problem, emailToUse: fromMessage });
      return NextResponse.json({ reply: replyText, ticketCreated: true });
    }

    // Build message history
    const history: { role: "user" | "assistant"; content: string }[] =
      conversation.messages.map((m) => ({
        role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }));
    history.push({ role: "user", content: trimmedMessage });

    // Build dynamic system prompt with live data + user context
    const liveContext = await getLiveContext(verifiedUserId || conversation.userId || undefined);
    let fullPrompt = CHAT_SYSTEM_PROMPT;

    if (verifiedUserName || conversation.userName) {
      const name = verifiedUserName || conversation.userName;
      fullPrompt += `\n\n--- USER INFO ---\nThe user's name is "${name}". They are logged in. Address them by their first name naturally.`;
    } else {
      fullPrompt += `\n\n--- USER INFO ---\nThis is an anonymous visitor (not logged in). Be welcoming and suggest creating a free account when appropriate.`;
    }

    fullPrompt += liveContext;

    const aiResponse = await getAIResponse(history, fullPrompt);

    // Check if user is requesting human support → start TICKET flow
    const wantsHuman = isEscalationRequest(trimmedMessage, aiResponse);

    if (wantsHuman) {
      // Step 1: Ask the user to describe the problem (and gather email if missing)
      await prisma.chatConversation.update({
        where: { id: conversation.id },
        data: {
          ticketStage: "AWAITING_PROBLEM",
          lastMessage: `[⚡ Wants to open ticket] ${trimmedMessage}`,
        },
      });

      const firstName = (verifiedUserName || conversation.userName || "").split(" ")[0];
      const greet = firstName ? `Hey ${firstName}! ` : "Of course! ";
      const emailLine = knownEmail
        ? `Our team will reach out to you at **${knownEmail}** within **24–48 hours** — just make sure to check your **spam/junk folder** too, sometimes emails land there.`
        : `Once you describe what's happening, I'll need your **best email address** so our team can reply. We aim to get back to you within **24–48 hours** (don't forget to check **spam/junk** too!).`;

      const ticketReply =
        `${greet}No worries, let's get this sorted! 🐾\n\n` +
        `I'll create a support ticket and a real person from our team will follow up with you over email. ` +
        `${emailLine}\n\n` +
        `**Tell me what's going on** — what issue are you running into? 👇`;

      await prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: ticketReply,
        },
      });

      // Notify admins immediately so they can jump in early if they want (still useful for live chat)
      sendEscalationEmail(
        conversation.id,
        verifiedUserName || conversation.userName,
        verifiedUserEmail || conversation.userEmail,
        trimmedMessage,
      );

      return NextResponse.json({ reply: ticketReply });
    }

    // Save AI response
    await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: aiResponse,
      },
    });

    return NextResponse.json({ reply: aiResponse });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

// GET: Load conversation history for a session
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId || sessionId.length > 100) {
    return NextResponse.json({ messages: [] });
  }

  const conversation = await prisma.chatConversation.findUnique({
    where: { sessionId },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 100 },
    },
  });

  if (!conversation) {
    return NextResponse.json({ messages: [] });
  }

  return NextResponse.json({
    messages: conversation.messages.map((m) => ({
      role: m.role === "USER" ? "user" : m.role === "ADMIN" ? "admin" : "assistant",
      content: m.content,
      createdAt: m.createdAt,
    })),
    aiPaused: conversation.aiPaused,
  });
}
