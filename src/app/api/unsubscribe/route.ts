import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

function verifyUnsubToken(email: string, token: string): boolean {
  const secret = process.env.NEXTAUTH_SECRET || "";
  const expected = createHmac("sha256", secret).update(email.toLowerCase()).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(token, "hex"));
  } catch {
    return false;
  }
}

async function unsubscribeEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) return;

  await prisma.userNotificationPrefs.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      voteAlerts: false,
      commentAlerts: false,
      designAlerts: false,
      weeklyDigest: false,
      freeVoteReminder: false,
      contestAlerts: false,
    },
    update: {
      voteAlerts: false,
      commentAlerts: false,
      designAlerts: false,
      weeklyDigest: false,
      freeVoteReminder: false,
      contestAlerts: false,
    },
  });
}

// One-click browser unsubscribe link
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email") ?? "";
  const token = searchParams.get("token") ?? "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.votetofeed.com";

  if (!email || !token || !verifyUnsubToken(email, token)) {
    return NextResponse.redirect(`${appUrl}/?unsub=invalid`);
  }

  await unsubscribeEmail(email);
  return NextResponse.redirect(`${appUrl}/?unsub=success`);
}

// RFC 8058 one-click POST (required by Gmail/Yahoo for bulk senders)
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email") ?? "";
  const token = searchParams.get("token") ?? "";

  if (!email || !token || !verifyUnsubToken(email, token)) {
    return new NextResponse("Invalid token", { status: 403 });
  }

  await unsubscribeEmail(email);
  return new NextResponse("Unsubscribed", { status: 200 });
}
