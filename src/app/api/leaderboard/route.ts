import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentWeekId } from "@/lib/utils";
import { getMealRate, getAnimalType } from "@/lib/admin-settings";
import { getWeeklyVoteSummaryMap } from "@/lib/weekly-vote-stats";

// GET /api/leaderboard - Get leaderboard data
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const petType = searchParams.get("type") || "DOG"; // DOG or CAT
    const state = searchParams.get("state");
    const breed = searchParams.get("breed");
    const view = searchParams.get("view") || "weekly"; // weekly or alltime
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const weekId = getCurrentWeekId();

    if (view === "weekly") {
      const petWhere: Record<string, unknown> = {
        isActive: true,
        type: petType,
      };
      if (state) petWhere.state = state;
      if (breed) petWhere.breed = { contains: breed, mode: "insensitive" };

      const pets = await prisma.pet.findMany({
        where: petWhere,
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      });

      const summaryMap = await getWeeklyVoteSummaryMap(
        pets.map((pet) => pet.id),
        weekId,
      );

      const sortedPets = [...pets].sort((a, b) => {
        const aVotes = summaryMap.get(a.id)?.totalVotes || 0;
        const bVotes = summaryMap.get(b.id)?.totalVotes || 0;
        if (bVotes !== aVotes) return bVotes - aVotes;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      const total = sortedPets.length;
      const pagePets = sortedPets.slice((page - 1) * limit, page * limit);

      const [mealRate, animalType] = await Promise.all([
        getMealRate(),
        getAnimalType(),
      ]);

      const summaries = Array.from(summaryMap.values());
      const totalWeeklyVotes = summaries.reduce((sum, item) => sum + item.totalVotes, 0);
      const totalPaidVotes = summaries.reduce((sum, item) => sum + item.paidVotes, 0);

      return NextResponse.json({
        entries: pagePets.map((pet, i) => ({
          rank: (page - 1) * limit + i + 1,
          pet: {
            id: pet.id,
            name: pet.name,
            type: pet.type,
            breed: pet.breed,
            ownerName: pet.ownerName,
            state: pet.state,
            photos: pet.photos,
            user: pet.user,
            createdAt: pet.createdAt,
          },
          weeklyVotes: summaryMap.get(pet.id)?.totalVotes || 0,
          isNew:
            new Date().getTime() - new Date(pet.createdAt).getTime() <
            7 * 24 * 60 * 60 * 1000,
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit),
        weekId,
        meta: {
          totalWeeklyVotes,
          totalPaidVotes,
          mealRate,
          animalType,
        },
      });
    } else {
      // All-time leaderboard
      const petWhere: Record<string, unknown> = {
        isActive: true,
        type: petType,
      };
      if (state) petWhere.state = state;
      if (breed) petWhere.breed = { contains: breed, mode: "insensitive" };

      const pets = await prisma.pet.findMany({
        where: petWhere,
        include: {
          user: { select: { id: true, name: true, image: true } },
          _count: { select: { votes: true } },
          weeklyStats: {
            where: { weekId },
            take: 1,
          },
        },
        orderBy: { votes: { _count: "desc" } },
        skip: (page - 1) * limit,
        take: limit,
      });

      const total = await prisma.pet.count({ where: petWhere });
      const summaryMap = await getWeeklyVoteSummaryMap(
        pets.map((pet) => pet.id),
        weekId,
      );

      return NextResponse.json({
        entries: pets.map((pet, i) => ({
          rank: (page - 1) * limit + i + 1,
          pet: {
            id: pet.id,
            name: pet.name,
            type: pet.type,
            breed: pet.breed,
            ownerName: pet.ownerName,
            state: pet.state,
            photos: pet.photos,
            user: pet.user,
            createdAt: pet.createdAt,
          },
          totalVotes: pet._count.votes,
          weeklyVotes: summaryMap.get(pet.id)?.totalVotes || 0,
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    }
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
