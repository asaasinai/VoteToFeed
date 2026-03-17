import Link from "next/link";
import { PetCard } from "@/components/pets/PetCard";
import { ShelterBanner } from "@/components/layout/ShelterBanner";
import { getAnimalType, getWeeklyVoteGoal } from "@/lib/admin-settings";
import prisma from "@/lib/prisma";
import type { PetType } from "@prisma/client";
import { getCurrentWeekId, getWeekDateRange, formatDisplayName } from "@/lib/utils";

type PetsPageProps = {
  searchParams: {
    sort?: string;
    page?: string;
    type?: string;
  };
};

export default async function PetsPage({ searchParams }: PetsPageProps) {
  const sort = searchParams.sort === "popular" ? "popular" : "recent";
  const page = Math.max(1, parseInt(searchParams.page || "1"));
  const type = searchParams.type === "DOG" || searchParams.type === "CAT"
    ? (searchParams.type as PetType)
    : undefined;
  const limit = 20;
  const weekId = getCurrentWeekId();
  const { start, end } = getWeekDateRange();

  const [animalType, weeklyGoal, stats, weeklyMealsAgg] = await Promise.all([
    getAnimalType(),
    getWeeklyVoteGoal(),
    prisma.petWeeklyStats.aggregate({
      where: { weekId },
      _sum: { totalVotes: true, paidVotes: true },
    }),
    prisma.purchase.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: start, lt: end } },
      _sum: { mealsProvided: true },
    }),
  ]);

  let total = 0;
  let cards: Array<{
    id: string;
    name: string;
    ownerName: string;
    state?: string | null;
    photos: string[];
    type: string;
    weeklyVotes: number;
    weeklyRank?: number | null;
    isNew?: boolean;
  }> = [];

  if (sort === "popular") {
    const [entries, count] = await Promise.all([
      prisma.petWeeklyStats.findMany({
        where: { weekId, pet: { isActive: true, ...(type ? { type } : {}) } },
        include: {
          pet: {
            include: { user: { select: { name: true } } },
          },
        },
        orderBy: { totalVotes: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.petWeeklyStats.count({
        where: { weekId, pet: { isActive: true, ...(type ? { type } : {}) } },
      }),
    ]);

    total = count;
    cards = entries.map((entry, index) => ({
      id: entry.pet.id,
      name: entry.pet.name,
      ownerName: formatDisplayName(entry.pet.ownerFirstName, entry.pet.ownerLastName, entry.pet.ownerName),
      state: entry.pet.state,
      photos: entry.pet.photos,
      type: entry.pet.type,
      weeklyVotes: entry.totalVotes,
      weeklyRank: (page - 1) * limit + index + 1,
      isNew: new Date().getTime() - new Date(entry.pet.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000,
    }));
  } else {
    const where = { isActive: true, ...(type ? { type } : {}) };
    const [pets, count] = await Promise.all([
      prisma.pet.findMany({
        where,
        include: {
          user: { select: { name: true } },
          weeklyStats: { where: { weekId }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.pet.count({ where }),
    ]);

    total = count;
    cards = pets.map((pet) => ({
      id: pet.id,
      name: pet.name,
      ownerName: formatDisplayName(pet.ownerFirstName, pet.ownerLastName, pet.ownerName),
      state: pet.state,
      photos: pet.photos,
      type: pet.type,
      weeklyVotes: pet.weeklyStats[0]?.totalVotes ?? 0,
      weeklyRank: null,
      isNew: new Date().getTime() - new Date(pet.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000,
    }));
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const weeklyVotes = stats._sum.totalVotes ?? 0;
  const mealsHelped = Math.round(weeklyMealsAgg._sum.mealsProvided ?? 0);
  const title = sort === "popular" ? "Top Pets This Week" : "New Pets";
  const description = sort === "popular"
    ? "See the full weekly leaderboard of this week's most-voted pets."
    : "Browse the newest pets that just joined VoteToFeed.";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Link
          href="/pets?sort=popular"
          className={`px-4 py-3 rounded-lg text-base font-semibold transition-all ${
            sort === "popular" ? "bg-brand-500 text-white shadow-sm" : "text-surface-800 hover:bg-surface-100"
          }`}
        >
          Top Pets
        </Link>
        <Link
          href="/pets?sort=recent"
          className={`px-4 py-3 rounded-lg text-base font-semibold transition-all ${
            sort === "recent" ? "bg-brand-500 text-white shadow-sm" : "text-surface-800 hover:bg-surface-100"
          }`}
        >
          New Pets
        </Link>
      </div>

      <h1 className="text-3xl font-extrabold text-surface-900 mb-1">{title}</h1>
      <p className="text-base text-surface-800 mb-6">{description}</p>

      <ShelterBanner
        weeklyVotes={weeklyVotes}
        animalType={animalType}
        mealsHelped={mealsHelped}
        weeklyGoal={weeklyGoal}
      />

      <div className="mt-8 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {cards.map((pet) => (
          <PetCard key={pet.id} {...pet} animalType={animalType} />
        ))}
      </div>

      {cards.length === 0 && (
        <div className="card p-12 text-center mt-8">
          <p className="text-surface-800">No pets found.</p>
          <Link href="/pets/new" className="btn-primary mt-4">Add your pet</Link>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {page > 1 && (
            <Link href={`/pets?sort=${sort}&page=${page - 1}`} className="btn-secondary">
              Previous
            </Link>
          )}
          <span className="px-4 py-3 text-sm text-surface-800">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`/pets?sort=${sort}&page=${page + 1}`} className="btn-secondary">
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
