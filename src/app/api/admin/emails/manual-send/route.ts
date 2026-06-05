import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { emailShell, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const FROM_EMAIL = "VoteToFeed <hello@votetofeed.com>";
const MAX_RECIPIENTS = 10;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseRecipients(value: unknown) {
  if (typeof value !== "string") return [];

  return Array.from(
    new Set(
      value
        .split(/[,\n;]/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function bodyToHtml(body: string) {
  return body
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => {
      const text = escapeHtml(paragraph.trim()).replace(/\n/g, "<br />");
      return `<p style="margin:0 0 18px;color:#3f3f46;font-size:16px;line-height:1.7;">${text}</p>`;
    })
    .join("");
}

// POST /api/admin/emails/manual-send - send a direct email from the admin dashboard
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { to, subject, body } = await req.json();
  const recipients = parseRecipients(to);
  const cleanSubject = typeof subject === "string" ? subject.trim() : "";
  const cleanBody = typeof body === "string" ? body.trim() : "";

  if (recipients.length === 0) {
    return NextResponse.json({ error: "Email to is required" }, { status: 400 });
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return NextResponse.json({ error: `Manual send supports up to ${MAX_RECIPIENTS} recipients` }, { status: 400 });
  }
  const invalidRecipients = recipients.filter((email) => !isValidEmail(email));
  if (invalidRecipients.length > 0) {
    return NextResponse.json({ error: `Invalid email address: ${invalidRecipients[0]}` }, { status: 400 });
  }
  if (!cleanSubject) {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }
  if (!cleanBody) {
    return NextResponse.json({ error: "Body is required" }, { status: 400 });
  }

  const html = emailShell(bodyToHtml(cleanBody), escapeHtml(cleanBody.slice(0, 120)));
  let sent = 0;
  const errors: string[] = [];

  const results = await Promise.allSettled(
    recipients.map((recipient) =>
      sendEmail({
        from: FROM_EMAIL,
        to: recipient,
        subject: cleanSubject,
        html,
      }),
    ),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      sent++;
    } else {
      errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  }

  if (sent === 0) {
    return NextResponse.json({ error: errors[0] || "Failed to send email" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    total: recipients.length,
    sent,
    failed: recipients.length - sent,
    errors: errors.slice(0, 3),
  });
}
