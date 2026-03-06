import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const DEFAULT_TEMPLATES: Record<
  string,
  { subject: string; body: string; label: string; description: string }
> = {
  WELCOME: {
    label: "Welcome Email",
    description:
      "Sent on signup. Includes how it works, active contests, and account management info.",
    subject: "Welcome to Vote to Feed! 🐾",
    body: "Default template — edit to customize. Available variables: {{userName}}, {{activeContestCount}}, {{appUrl}}",
  },
  VOTE_RECEIVED: {
    label: "Vote Received",
    description:
      "Sent to pet owner when their pet gets a vote. Optional per-user (default: on).",
    subject: "🐾 {{petName}} got a vote!",
    body: "Default template — edit to customize. Available variables: {{petName}}, {{voterName}}, {{voteCount}}, {{rank}}, {{voteType}}, {{petId}}, {{appUrl}}",
  },
  COMMENT_RECEIVED: {
    label: "Comment Received",
    description:
      "Sent to pet owner when someone comments. Optional per-user (default: on).",
    subject: "💬 New comment on {{petName}}'s profile",
    body: "Default template — edit to customize. Available variables: {{petName}}, {{commenterName}}, {{commentText}}, {{petId}}, {{appUrl}}",
  },
  PURCHASE_CONFIRMATION: {
    label: "Purchase Confirmation",
    description: "Transaction notice sent after a successful vote purchase.",
    subject: "✅ {{votes}} Votes Added — Thank You!",
    body: "Default template — edit to customize. Available variables: {{votes}}, {{amount}}, {{mealsProvided}}, {{animalType}}, {{appUrl}}",
  },
  FREE_VOTES_ADDED: {
    label: "Free Votes Added",
    description:
      "Sent when free votes are refreshed. Optional per-user (default: on).",
    subject: "🎉 Your {{freeVotes}} free votes are ready!",
    body: "Default template — edit to customize. Available variables: {{userName}}, {{freeVotes}}, {{animalType}}, {{appUrl}}",
  },
  CONTEST_CLOSING: {
    label: "Contest Closing Reminder",
    description:
      "Sent at day 5, day 3, day 2, and ending day. Encourages votes and sharing.",
    subject:
      "{{urgency}} — {{contestName}} ends in {{daysLeft}} day(s)!",
    body: "Default template — edit to customize. Available variables: {{userName}}, {{contestName}}, {{daysLeft}}, {{petName}}, {{petId}}, {{currentRank}}, {{urgency}}, {{appUrl}}",
  },
  CONTEST_RESULT: {
    label: "Contest Result (Win / No-Win + Gift)",
    description:
      "Sent when a contest ends. Winners get prize details. Non-winners get a thank you + gift.",
    subject: "🏆 {{petName}} — {{contestName}} Results",
    body: "Default template — edit to customize. Available variables: {{petName}}, {{contestName}}, {{placement}}, {{prizeValue}}, {{prizeItemsList}}, {{isWinner}}, {{appUrl}}",
  },
};

// GET /api/admin/email-templates
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = (session.user as Record<string, unknown>).role;
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const templates = await prisma.emailTemplate.findMany({
      orderBy: { createdAt: "asc" },
    });

    const templateMap: Record<string, unknown> = {};
    for (const [type, defaults] of Object.entries(DEFAULT_TEMPLATES)) {
      const existing = templates.find((t) => t.type === type);
      templateMap[type] = {
        type,
        label: defaults.label,
        description: defaults.description,
        subject: existing?.subject || defaults.subject,
        body: existing?.body || defaults.body,
        enabled: existing?.enabled ?? true,
        isCustomized: !!existing,
      };
    }

    // Get Resend config from admin settings
    const [resendApiKey, resendFromEmail] = await Promise.all([
      prisma.adminSetting.findUnique({ where: { key: "resend_api_key" } }),
      prisma.adminSetting.findUnique({ where: { key: "resend_from_email" } }),
    ]);

    return NextResponse.json({
      templates: templateMap,
      config: {
        resendApiKey: resendApiKey?.value
          ? "••••••••" + resendApiKey.value.slice(-4)
          : "",
        resendFromEmail:
          resendFromEmail?.value ||
          process.env.RESEND_FROM_EMAIL ||
          "",
        isConfigured: !!(resendApiKey?.value || process.env.RESEND_API_KEY),
      },
    });
  } catch (error) {
    console.error("Error fetching email templates:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/email-templates
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = (session.user as Record<string, unknown>).role;
    const userId = (session.user as Record<string, unknown>).id as string;
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { action, type, subject, body, enabled, key, value } =
      await req.json();

    // Handle Resend config updates
    if (action === "updateConfig") {
      if (key === "resend_api_key" || key === "resend_from_email") {
        const existing = await prisma.adminSetting.findUnique({
          where: { key },
        });
        if (existing) {
          await prisma.adminSetting.update({
            where: { key },
            data: { value, updatedBy: userId },
          });
        } else {
          await prisma.adminSetting.create({
            data: { key, value, updatedBy: userId },
          });
        }
        // Reset the cached Resend client when API key changes
        if (key === "resend_api_key") {
          const { resetResendClient } = await import("@/lib/resend");
          resetResendClient();
        }
        return NextResponse.json({ success: true });
      }
      return NextResponse.json({ error: "Invalid config key" }, { status: 400 });
    }

    // Handle template updates
    if (!type || !DEFAULT_TEMPLATES[type]) {
      return NextResponse.json(
        { error: "Invalid template type" },
        { status: 400 }
      );
    }

    await prisma.emailTemplate.upsert({
      where: { type },
      create: {
        type,
        subject: subject || DEFAULT_TEMPLATES[type].subject,
        body: body || DEFAULT_TEMPLATES[type].body,
        enabled: enabled ?? true,
        updatedBy: userId,
      },
      update: {
        ...(subject !== undefined ? { subject } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
        updatedBy: userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating email template:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
