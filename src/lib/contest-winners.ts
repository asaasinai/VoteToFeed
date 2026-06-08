import prisma from "@/lib/prisma";
import { getContestLeaderboard } from "@/lib/contest-growth";

function buildAddress(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(", ");
}

function placementLabel(placement: number) {
  if (placement === 1) return "1st";
  if (placement === 2) return "2nd";
  if (placement === 3) return "3rd";
  return `${placement}th`;
}

export async function ensureContestWinnersResolved(contestId?: string) {
  const now = new Date();

  const contests = await prisma.contest.findMany({
    where: {
      ...(contestId ? { id: contestId } : {}),
      endDate: { lt: now },
      prizes: { some: {} },
    },
    include: {
      prizes: {
        orderBy: { placement: "asc" },
      },
    },
  });

  for (const contest of contests) {
    // Only resolve prizes that have no winner yet; once a contest ends, votes are final.
    const prizesToResolve = contest.prizes.filter((prize) => !prize.winnerId);
    if (prizesToResolve.length === 0) continue;

    const leaderboard = await getContestLeaderboard(contest.id);
    if (leaderboard.length === 0) continue;

    const topThreePetIds = new Set(leaderboard.slice(0, 3).map((r) => r.petId));
    const nonTopRows = leaderboard.filter((r) => !topThreePetIds.has(r.petId));

    for (const prize of prizesToResolve) {
      if (prize.placement === 0) {
        const randomWinner = nonTopRows[Math.floor(Math.random() * nonTopRows.length)];
        if (!randomWinner) continue;

        await prisma.prize.update({
          where: { id: prize.id },
          data: {
            winnerId: randomWinner.petId,
            awardedAt: now,
            status: prize.fulfilledAt ? "SHIPPED" : "AWARDED",
          },
        });

        continue;
      }

      const winner = leaderboard[prize.placement - 1];
      if (!winner) continue;

      await prisma.prize.update({
        where: { id: prize.id },
        data: {
          winnerId: winner.petId,
          awardedAt: now,
          status: prize.fulfilledAt ? "SHIPPED" : "AWARDED",
        },
      });
    }

    // Deactivate ended contests so cron-missed ones are properly closed.
    if (contest.isActive) {
      await prisma.contest.update({
        where: { id: contest.id },
        data: { isActive: false },
      });
    }
  }
}

export async function getAdminContestWinners() {
  await ensureContestWinnersResolved();

  const contests = await prisma.contest.findMany({
    where: {
      endDate: { lt: new Date() },
      entries: { some: {} },
    },
    include: {
      _count: { select: { entries: true } },
      prizes: {
        orderBy: { placement: "asc" },
        select: {
          id: true,
          placement: true,
          title: true,
          value: true,
          status: true,
          winnerId: true,
          awardedAt: true,
          fulfilledAt: true,
        },
      },
    },
    orderBy: { endDate: "desc" },
  });

  const contestLeaders = await Promise.all(
    contests.map(async (contest) => ({
      contest,
      leaders: (await getContestLeaderboard(contest.id)).slice(0, 3),
    }))
  );

  const topPetIds = [
    ...new Set(contestLeaders.flatMap(({ leaders }) => leaders.map((leader) => leader.petId))),
  ];

  const pets = topPetIds.length
    ? await prisma.pet.findMany({
        where: { id: { in: topPetIds } },
        select: {
          id: true,
          name: true,
          type: true,
          breed: true,
          photos: true,
          ownerName: true,
          ownerFirstName: true,
          ownerLastName: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          country: true,
          userId: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              city: true,
              state: true,
              country: true,
              zipCode: true,
            },
          },
        },
      })
    : [];

  const petMap = new Map(
    pets.map((pet) => [
      pet.id,
      {
        petName: pet.name,
        petType: pet.type,
        petBreed: pet.breed,
        petPhoto: pet.photos[0] ?? null,
        ownerUserId: pet.userId,
        ownerEmail: pet.user.email,
        ownerUserName:
          buildAddress([pet.ownerFirstName, pet.ownerLastName]) ||
          pet.user.name?.trim() ||
          pet.ownerName ||
          "-",
        ownerAddress:
          buildAddress([
            pet.address,
            pet.city || pet.user.city,
            pet.state || pet.user.state,
            pet.zipCode || pet.user.zipCode,
            pet.country || pet.user.country,
          ]) || "-",
      },
    ])
  );

  return contestLeaders.map(({ contest, leaders }) => {
    const prizesByPlacement = new Map(contest.prizes.map((prize) => [prize.placement, prize]));

    return {
      contestId: contest.id,
      contestName: contest.name,
      contestType: contest.type,
      contestPetType: contest.petType,
      contestEndedAt: contest.endDate.toISOString(),
      entryCount: contest._count.entries,
      winners: leaders.map((leader, index) => {
        const placement = index + 1;
        const prize = prizesByPlacement.get(placement);
        const pet = petMap.get(leader.petId);

        return {
          id: `${contest.id}-${placement}-${leader.petId}`,
          prizeId: prize?.id ?? null,
          contestId: contest.id,
          placement,
          placementLabel: placementLabel(placement),
          rank: leader.rank,
          winnerPetId: leader.petId,
          winnerPetName: pet?.petName || leader.petName || "-",
          petType: pet?.petType ?? null,
          petBreed: pet?.petBreed ?? null,
          petPhoto: pet?.petPhoto ?? null,
          totalVotes: leader.totalVotes,
          ownerUserId: pet?.ownerUserId || leader.userId || null,
          ownerUserName: pet?.ownerUserName || leader.userName || "-",
          ownerEmail: pet?.ownerEmail || leader.userEmail || null,
          ownerAddress: pet?.ownerAddress || "-",
          prizeTitle: prize?.title ?? `${placementLabel(placement)} place`,
          prizeValue: prize?.value ?? 0,
          prizeSent: Boolean(prize?.fulfilledAt || prize?.status === "SHIPPED" || prize?.status === "FULFILLED"),
          fulfilledAt: prize?.fulfilledAt?.toISOString() ?? null,
          awardedAt: prize?.awardedAt?.toISOString() ?? null,
          status: prize?.status ?? "UNCONFIGURED",
        };
      }),
    };
  });
}
