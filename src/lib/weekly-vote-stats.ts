import prisma from "@/lib/prisma";

type PetIdentity = {
  id: string;
  createdAt: Date;
};

export type WeeklyVoteSummary = {
  totalVotes: number;
  freeVotes: number;
  paidVotes: number;
  anonymousVotes: number;
  loggedVotes: number;
};

export async function getWeeklyVoteSummaryMap(
  petIds: string[],
  weekId: string,
): Promise<Map<string, WeeklyVoteSummary>> {
  const ids = Array.from(new Set(petIds.filter(Boolean)));
  const map = new Map<string, WeeklyVoteSummary>();

  for (const id of ids) {
    map.set(id, {
      totalVotes: 0,
      freeVotes: 0,
      paidVotes: 0,
      anonymousVotes: 0,
      loggedVotes: 0,
    });
  }

  if (ids.length === 0) return map;

  const [voteGroups, anonymousGroups] = await Promise.all([
    prisma.vote.groupBy({
      by: ["petId", "voteType"],
      where: {
        petId: { in: ids },
        contestWeek: weekId,
      },
      _sum: { quantity: true },
    }),
    prisma.anonymousVote.groupBy({
      by: ["petId"],
      where: {
        petId: { in: ids },
        contestWeek: weekId,
      },
      _count: { _all: true },
    }),
  ]);

  for (const row of voteGroups) {
    const current = map.get(row.petId) ?? {
      totalVotes: 0,
      freeVotes: 0,
      paidVotes: 0,
      anonymousVotes: 0,
      loggedVotes: 0,
    };
    const qty = row._sum.quantity ?? 0;
    current.loggedVotes += qty;
    current.totalVotes += qty;
    if (row.voteType === "FREE") current.freeVotes += qty;
    if (row.voteType === "PAID") current.paidVotes += qty;
    map.set(row.petId, current);
  }

  for (const row of anonymousGroups) {
    const current = map.get(row.petId) ?? {
      totalVotes: 0,
      freeVotes: 0,
      paidVotes: 0,
      anonymousVotes: 0,
      loggedVotes: 0,
    };
    const anonCount = row._count._all ?? 0;
    current.anonymousVotes += anonCount;
    current.freeVotes += anonCount;
    current.totalVotes += anonCount;
    map.set(row.petId, current);
  }

  return map;
}

export async function getWeeklyVoteSummary(
  petId: string,
  weekId: string,
): Promise<WeeklyVoteSummary> {
  const map = await getWeeklyVoteSummaryMap([petId], weekId);
  return (
    map.get(petId) ?? {
      totalVotes: 0,
      freeVotes: 0,
      paidVotes: 0,
      anonymousVotes: 0,
      loggedVotes: 0,
    }
  );
}

export function getRankedPetIds(
  pets: PetIdentity[],
  summaryMap: Map<string, WeeklyVoteSummary>,
): string[] {
  return [...pets]
    .sort((a, b) => {
      const aVotes = summaryMap.get(a.id)?.totalVotes ?? 0;
      const bVotes = summaryMap.get(b.id)?.totalVotes ?? 0;
      if (bVotes !== aVotes) return bVotes - aVotes;
      const createdDiff = a.createdAt.getTime() - b.createdAt.getTime();
      if (createdDiff !== 0) return createdDiff;
      return a.id.localeCompare(b.id);
    })
    .map((pet) => pet.id);
}

export function getRankMap(
  pets: PetIdentity[],
  summaryMap: Map<string, WeeklyVoteSummary>,
): Map<string, number> {
  const rankedIds = getRankedPetIds(pets, summaryMap);
  return new Map(rankedIds.map((id, index) => [id, index + 1]));
}
