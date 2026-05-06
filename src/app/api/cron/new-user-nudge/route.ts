import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyCronSecret } from "@/lib/cron-auth";
import { sendNewUserNudge } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const now = new Date();
  const windowStart = new Date(now.getTime() - 25 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() - 23 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: {
      email: { not: null },
      createdAt: { gte: windowStart, lte: windowEnd },
      purchases: { none: { status: "COMPLETED" } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      pets: {
        where: { isActive: true },
        select: {
          name: true,
          contestEntries: {
            where: {
              contest: {
                isActive: true,
                startDate: { lte: now },
                endDate: { gt: now },
              },
            },
            select: { contestId: true },
            take: 1,
          },
        },
        take: 1,
      },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    if (!user.email) continue;

    const firstName = user.name?.split(" ")[0] ?? "there";
    const pet = user.pets[0] ?? null;
    const contestEntry = pet?.contestEntries[0] ?? null;

    const petName = pet?.name ?? null;
    const contestId = contestEntry?.contestId ?? null;

    try {
      await sendNewUserNudge(user.email, firstName, petName, contestId);
      sent++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ success: true, sent, failed });
}
