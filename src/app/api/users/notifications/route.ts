import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/users/notifications
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as Record<string, unknown>).id as string;

    let prefs = await prisma.userNotificationPrefs.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = await prisma.userNotificationPrefs.create({
        data: { userId },
      });
    }

    return NextResponse.json(prefs);
  } catch (error) {
    console.error("Error fetching notification prefs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/users/notifications
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as Record<string, unknown>).id as string;
    const updates = await req.json();

    const allowed = [
      "voteAlerts",
      "commentAlerts",
      "purchaseAlerts",
      "freeVoteReminder",
      "contestAlerts",
      "designAlerts",
      "weeklyDigest",
      "maxVoteAlertsPerDay",
    ];

    const data: Record<string, boolean | number> = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        data[key] = updates[key];
      }
    }

    const prefs = await prisma.userNotificationPrefs.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    return NextResponse.json(prefs);
  } catch (error) {
    console.error("Error updating notification prefs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
