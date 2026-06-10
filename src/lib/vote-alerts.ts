import prisma from "@/lib/prisma";
import { sendBatchedVoteAlert } from "@/lib/email";
import { getCurrentWeekId } from "@/lib/utils";

export const VOTE_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export async function triggerVoteAlert(
  petId: string,
  ownerId: string,
  ownerEmail: string,
  ownerName: string,
  weeklyVotes: number,
) {
  const now = new Date();
  const cooldown = await prisma.voteEmailCooldown.findUnique({
    where: { petId_ownerId: { petId, ownerId } },
  });

  if (cooldown && now.getTime() - cooldown.lastSentAt.getTime() < VOTE_ALERT_COOLDOWN_MS) {
    await prisma.voteEmailCooldown.update({
      where: { petId_ownerId: { petId, ownerId } },
      data: { pendingCount: { increment: 1 } },
    });
    return;
  }

  const pendingFromBefore = cooldown?.pendingCount ?? 0;
  const totalNew = pendingFromBefore + 1;

  await prisma.voteEmailCooldown.upsert({
    where: { petId_ownerId: { petId, ownerId } },
    create: { petId, ownerId, lastSentAt: now, pendingCount: 0 },
    update: { lastSentAt: now, pendingCount: 0 },
  });

  const pet = await prisma.pet.findUnique({ where: { id: petId }, select: { name: true } });
  if (!pet) return;

  const weekId = getCurrentWeekId();
  const allStats = await prisma.petWeeklyStats.findMany({
    where: { weekId },
    orderBy: { totalVotes: "desc" },
    select: { petId: true },
  });
  const rank = allStats.findIndex((s) => s.petId === petId) + 1 || null;
  const ownerFirstName = ownerName?.split(" ")[0] ?? "there";

  sendBatchedVoteAlert(ownerEmail, ownerFirstName, pet.name, petId, totalNew, weeklyVotes, rank || null).catch(
    (err) => console.error("[email] batched vote alert failed:", err),
  );
}
