import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Resend Inbound Email webhook
//
// SETUP REQUIRED (in Resend dashboard, using your existing RESEND_API_KEY domain):
//   1. Add MX records for votetofeed.com pointing at Resend inbound mail servers
//   2. Add an inbound route for support@votetofeed.com
//   3. Set the webhook URL to: https://www.votetofeed.com/api/inbound/email
//   4. Copy the signing secret into env var: RESEND_INBOUND_SECRET
//
// When a customer replies to a support email, Resend POSTs the parsed message
// to this endpoint. We match it back to the open ticket by sender email and
// append the reply as a USER chat message so the admin sees it in real time.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ResendInboundPayload = {
  type?: string;
  data?: {
    from?: string | { email?: string; name?: string };
    to?: string | string[] | Array<{ email?: string }>;
    subject?: string;
    text?: string;
    html?: string;
    headers?: Array<{ name: string; value: string }> | Record<string, string>;
    in_reply_to?: string;
    references?: string | string[];
  };
};

function timingSafeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifySvixSignature(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.RESEND_INBOUND_SECRET;
  if (!secret) {
    // No secret configured — accept (dev only). In production set RESEND_INBOUND_SECRET.
    console.warn("[inbound/email] RESEND_INBOUND_SECRET is not set — skipping signature verification");
    return true;
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Resend uses Svix-style signing: secret can be raw or "whsec_<base64>"
  const secretBytes = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice(6), "base64")
    : Buffer.from(secret, "utf8");

  const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedPayload).digest("base64");

  // Header may contain space-separated entries like "v1,signature1 v1,signature2"
  const candidates = svixSignature.split(" ").map((part) => part.split(",")[1]).filter(Boolean);
  return candidates.some((cand) => timingSafeEqual(cand, expected));
}

function extractFromAddress(
  from: string | { email?: string; name?: string } | undefined,
): string | null {
  if (!from) return null;
  if (typeof from === "string") {
    const m = from.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    return m ? m[0].toLowerCase() : null;
  }
  if (typeof from === "object" && from.email) return from.email.toLowerCase();
  return null;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>(?!\n)/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Strip the quoted reply portion ("On X, Y wrote:" and everything after)
function stripQuotedReply(body: string): string {
  const lines = body.split(/\r?\n/);
  const cutoffPatterns = [
    /^On .+ wrote:$/i,
    /^>+\s/,
    /^-+\s*Original Message\s*-+$/i,
    /^From:\s/i,
    /^________________________________$/,
  ];

  let cutoff = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (cutoffPatterns.some((p) => p.test(lines[i].trim()))) {
      cutoff = i;
      break;
    }
  }
  return lines.slice(0, cutoff).join("\n").trim();
}

export async function POST(req: NextRequest) {
  try {
    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    if (!verifySvixSignature(req, rawBody)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: ResendInboundPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const data = payload.data;
    if (!data) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const fromEmail = extractFromAddress(data.from);
    if (!fromEmail) {
      console.warn("[inbound/email] No usable From address in payload");
      return NextResponse.json({ ok: true, skipped: "no-from" });
    }

    const rawText = data.text?.trim()
      || (data.html ? htmlToPlainText(data.html) : "")
      || "";
    const cleanBody = stripQuotedReply(rawText).slice(0, 5000) || "(empty reply)";
    const subject = data.subject?.trim() || "(no subject)";

    // Match by sender email: most recent ticket first, else most recent conversation
    const conversation = await prisma.chatConversation.findFirst({
      where: { userEmail: { equals: fromEmail, mode: "insensitive" } },
      orderBy: [
        { isTicket: "desc" },
        { updatedAt: "desc" },
      ],
    });

    if (!conversation) {
      console.warn("[inbound/email] No conversation found for", fromEmail);
      return NextResponse.json({ ok: true, skipped: "no-conversation" });
    }

    const formatted = `📧 Email reply (subject: ${subject})\n\n${cleanBody}`;

    await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: formatted,
      },
    });

    await prisma.chatConversation.update({
      where: { id: conversation.id },
      data: {
        status: "OPEN",
        lastMessage: `📧 ${cleanBody.slice(0, 120)}`,
        aiPaused: true,
      },
    });

    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      matchedBy: "from-email",
    });
  } catch (e) {
    console.error("[inbound/email] POST:", e);
    return NextResponse.json(
      { error: "Couldn't process inbound email. Please try again later." },
      { status: 500 },
    );
  }
}

// GET for quick health check / Resend webhook URL validation
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "Resend Inbound Email webhook",
    secretConfigured: !!process.env.RESEND_INBOUND_SECRET,
  });
}
