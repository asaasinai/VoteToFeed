import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCurrentWeekId, calculateMeals } from "@/lib/utils";
import { getMealRate, getAnimalType } from "@/lib/admin-settings";

// POST /api/votes - Cast a vote
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as Record<string, unknown>).id as string;
    const { petId, quantity = 1 } = await req.json();

    if (!petId) {
      return NextResponse.json(
        { error: "Pet ID required" },
        { status: 400 }
      );
    }

    // Check pet exists and user doesn't own it
    const pet = await prisma.pet.findUnique({
      where: { id: petId },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    if (!pet || !pet.isActive) {
      return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    }

    if (pet.userId === userId) {
      return NextResponse.json(
        { error: "Cannot vote for your own pet" },
        { status: 400 }
      );
    }

    // Get user's vote info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        freeVotesRemaining: true,
        paidVoteBalance: true,
        lastFreeVoteReset: true,
        votingStreak: true,
        lastVotedWeek: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const weekId = getCurrentWeekId();

    // Rate limiting: check IP
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const recentVotesFromIP = await prisma.vote.count({
      where: {
        ipAddress: ip,
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // last hour
      },
    });

    if (recentVotesFromIP > 200) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again later." },
        { status: 429 }
      );
    }

    // Determine vote type
    let voteType: "FREE" | "PAID";
    let votesToCast = quantity;

    if (user.freeVotesRemaining > 0 && quantity === 1) {
      voteType = "FREE";
      votesToCast = 1;
    } else if (user.paidVoteBalance >= quantity) {
      voteType = "PAID";
    } else if (user.freeVotesRemaining > 0) {
      // Use free vote first, rest from paid
      voteType = "FREE";
      votesToCast = 1;
    } else {
      return NextResponse.json(
        {
          error: "No votes available",
          freeVotesRemaining: 0,
          paidVoteBalance: user.paidVoteBalance,
        },
        { status: 400 }
      );
    }

    // Process the vote
    const vote = await prisma.$transaction(async (tx) => {
      // Deduct vote
      if (voteType === "FREE") {
        await tx.user.update({
          where: { id: userId },
          data: {
            freeVotesRemaining: { decrement: 1 },
            lastVotedWeek: weekId,
            votingStreak:
              user.lastVotedWeek && user.lastVotedWeek !== weekId
                ? { increment: 1 }
                : user.votingStreak || 1,
          },
        });
      } else {
        await tx.user.update({
          where: { id: userId },
          data: {
            paidVoteBalance: { decrement: votesToCast },
            lastVotedWeek: weekId,
          },
        });
      }

      // Create vote record
      const newVote = await tx.vote.create({
        data: {
          petId,
          userId,
          voteType,
          quantity: votesToCast,
          ipAddress: ip,
          userAgent: req.headers.get("user-agent") || undefined,
          contestWeek: weekId,
        },
      });

      // Update weekly stats
      await tx.petWeeklyStats.upsert({
        where: { petId_weekId: { petId, weekId } },
        create: {
          petId,
          weekId,
          totalVotes: votesToCast,
          freeVotes: voteType === "FREE" ? votesToCast : 0,
          paidVotes: voteType === "PAID" ? votesToCast : 0,
        },
        update: {
          totalVotes: { increment: votesToCast },
          ...(voteType === "FREE"
            ? { freeVotes: { increment: votesToCast } }
            : { paidVotes: { increment: votesToCast } }),
        },
      });

      return newVote;
    });

    // Get updated stats
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { freeVotesRemaining: true, paidVoteBalance: true, votingStreak: true },
    });

    const updatedStats = await prisma.petWeeklyStats.findUnique({
      where: { petId_weekId: { petId, weekId } },
    });

    // Get admin settings for response
    const mealRate = await getMealRate();
    const animalType = await getAnimalType();

    return NextResponse.json({
      success: true,
      vote: {
        id: vote.id,
        type: voteType,
        quantity: votesToCast,
      },
      pet: {
        weeklyVotes: updatedStats?.totalVotes || 0,
      },
      user: {
        freeVotesRemaining: updatedUser?.freeVotesRemaining || 0,
        paidVoteBalance: updatedUser?.paidVoteBalance || 0,
        votingStreak: updatedUser?.votingStreak || 0,
      },
      impact: {
        animalType,
        mealRate,
      },
    });
  } catch (error) {
    console.error("Error casting vote:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/votes - Recent vote feed
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20");

    const votes = await prisma.vote.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, name: true, image: true } },
        pet: { select: { id: true, name: true, photos: true, type: true } },
      },
    });

    return NextResponse.json(votes);
  } catch (error) {
    console.error("Error fetching votes:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
