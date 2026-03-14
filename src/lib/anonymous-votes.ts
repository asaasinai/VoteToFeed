import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getWeekDateRange } from "@/lib/utils";

export const ANONYMOUS_VOTE_LIMIT = 3;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function getClientIp(req: NextRequest): string {
  const headerCandidates = [
    "x-forwarded-for",
    "x-real-ip",
    "client-ip",
    "cf-connecting-ip",
    "x-client-ip",
    "fastly-client-ip",
    "x-cluster-client-ip",
    "forwarded",
  ];

  for (const header of headerCandidates) {
    const value = req.headers.get(header);
    if (!value) continue;

    if (header === "forwarded") {
      const match = value.match(/for=(?:"?)(\[?[a-fA-F0-9:.]+\]?)/i);
      if (match?.[1]) return normalizeIp(match[1]);
      continue;
    }

    const first = value.split(",")[0]?.trim();
    if (first) return normalizeIp(first);
  }

  return "unknown";
}

export function normalizeIp(ip: string): string {
  return ip.replace(/^::ffff:/, "").replace(/^\[(.*)\]$/, "$1").trim();
}

export async function cleanupOldAnonymousVotes() {
  const cutoff = new Date(Date.now() - ONE_WEEK_MS);

  await prisma.anonymousVote.deleteMany({
    where: {
      createdAt: { lt: cutoff },
    },
  });
}

export async function getAnonymousVotesUsedThisWeek(ipAddress: string) {
  const { start } = getWeekDateRange();

  return prisma.anonymousVote.count({
    where: {
      ipAddress,
      createdAt: { gte: start },
    },
  });
}

export async function getAnonymousVotesRemaining(ipAddress: string) {
  if (!ipAddress || ipAddress === "unknown") {
    return 0;
  }

  await cleanupOldAnonymousVotes();
  const used = await getAnonymousVotesUsedThisWeek(ipAddress);

  return Math.max(0, ANONYMOUS_VOTE_LIMIT - used);
}
