import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tokenValue = searchParams.get("token");

  if (!tokenValue) {
    return NextResponse.redirect(new URL("/contests?error=invalid-token", req.url));
  }

  const token = await prisma.reEntryToken.findFirst({
    where: {
      token: tokenValue,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!token) {
    return NextResponse.redirect(new URL("/contests?error=invalid-token", req.url));
  }

  await prisma.$transaction(async (tx) => {
    await tx.contestEntry.upsert({
      where: {
        contestId_petId: {
          contestId: token.toContestId,
          petId: token.petId,
        },
      },
      create: {
        contestId: token.toContestId,
        petId: token.petId,
      },
      update: {},
    });

    await tx.reEntryToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });
  });

  return NextResponse.redirect(new URL(`/contests/${token.toContestId}?reentry=success&petId=${token.petId}`, req.url));
}
