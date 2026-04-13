import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5min for large batches

// POST /api/admin/emails/broadcast — send email to users
// Body: { subject, html, contestId?, sendToAll? }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subject, html, contestId, sendToAll } = await req.json();

  if (!subject || typeof subject !== "string") {
    return NextResponse.json({ error: "Subject required" }, { status: 400 });
  }
  if (!html || typeof html !== "string") {
    return NextResponse.json({ error: "HTML content required" }, { status: 400 });
  }
  if (!contestId && !sendToAll) {
    return NextResponse.json(
      { error: "Must specify contestId or sendToAll" },
      { status: 400 }
    );
  }

  // Build recipient list with per-user pet details for personalization
  type Recipient = {
    email: string;
    name: string | null;
    petName?: string;
    voteCount?: number;
    rank?: number;
    votesNeeded?: number;
  };

  let recipients: Recipient[] = [];

  if (sendToAll) {
    // Fetch all users with their best pet (most votes) for personalization
    const raw = await prisma.user.findMany({
      where: { email: { not: null } },
      select: {
        email: true,
        name: true,
        pets: {
          select: {
            name: true,
            votes: { select: { quantity: true } },
          },
        },
      },
    });
    for (const u of raw) {
      if (!u.email) continue;
      // Pick the pet with the most votes as the "featured" pet
      let bestPet: { name: string; totalVotes: number } | null = null;
      for (const p of u.pets) {
        const total = p.votes.reduce((s, v) => s + v.quantity, 0);
        if (!bestPet || total > bestPet.totalVotes) {
          bestPet = { name: p.name, totalVotes: total };
        }
      }
      recipients.push({
        email: u.email,
        name: u.name,
        petName: bestPet?.name,
        voteCount: bestPet?.totalVotes ?? 0,
      });
    }
  } else if (contestId) {
    // Users who have entries in this contest — include pet info + vote counts for personalization
    const entries = await prisma.contestEntry.findMany({
      where: { contestId },
      select: {
        pet: {
          select: {
            name: true,
            user: {
              select: { email: true, name: true },
            },
          },
        },
      },
    });

    // Get vote totals for this contest to calculate ranks
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      select: { weekId: true },
    });

    // Build vote counts per pet in this contest
    const voteCounts = new Map<string, number>();
    if (contest) {
      const allEntries = await prisma.contestEntry.findMany({
        where: { contestId },
        select: {
          petId: true,
          pet: {
            select: {
              votes: {
                where: contest.weekId ? { contestWeek: contest.weekId } : undefined,
                select: { quantity: true },
              },
            },
          },
        },
      });
      for (const e of allEntries) {
        const total = e.pet.votes.reduce((sum, v) => sum + v.quantity, 0);
        voteCounts.set(e.petId, total);
      }
    }

    // Sort by votes descending to compute ranks
    const sorted = [...voteCounts.entries()].sort((a, b) => b[1] - a[1]);
    const rankMap = new Map<string, number>();
    sorted.forEach(([petId], idx) => rankMap.set(petId, idx + 1));

    // 3rd place vote count (for "votes needed to crack top 3")
    const thirdPlaceVotes = sorted.length >= 3 ? sorted[2][1] : 0;

    const seen = new Set<string>();
    for (const entry of entries) {
      const u = entry.pet?.user;
      if (u?.email && !seen.has(u.email)) {
        seen.add(u.email);

        // Find this user's entry in the vote/rank data
        const petEntry = await prisma.contestEntry.findFirst({
          where: {
            contestId,
            pet: { user: { email: u.email } },
          },
          select: { petId: true },
        });

        const votes = petEntry ? (voteCounts.get(petEntry.petId) ?? 0) : 0;
        const rank = petEntry ? (rankMap.get(petEntry.petId) ?? 999) : 999;
        const needed = rank > 3 ? Math.max(thirdPlaceVotes - votes + 1, 1) : 0;

        recipients.push({
          email: u.email,
          name: u.name,
          petName: entry.pet?.name,
          voteCount: votes,
          rank,
          votesNeeded: needed,
        });
      }
    }
  }

  if (recipients.length === 0) {
    return NextResponse.json({ error: "No recipients found" }, { status: 400 });
  }

  // Send in batches with rate limiting  
  const BATCH_SIZE = 10;
  const DELAY_MS = 1000;
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((u) => {
        // Personalize HTML and subject per user
        const firstName = u.name?.split(" ")[0] || "Pet Parent";
        const personalizedHtml = html
          .replace(/\{\{userName\}\}/g, firstName)
          .replace(/\{\{petName\}\}/g, u.petName || "your pet")
          .replace(/\{\{voteCount\}\}/g, String(u.voteCount ?? 0))
          .replace(/\{\{rank\}\}/g, u.rank ? `#${u.rank}` : "")
          .replace(/\{\{votesNeeded\}\}/g, String(u.votesNeeded ?? 0));
        const personalizedSubject = subject
          .replace(/\{\{userName\}\}/g, firstName)
          .replace(/\{\{petName\}\}/g, u.petName || "your pet");

        return sendEmail({
          from: "VoteToFeed <noreply@votetofeed.com>",
          to: u.email,
          subject: personalizedSubject,
          html: personalizedHtml,
        });
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled") sent++;
      else {
        failed++;
        errors.push(String(r.reason));
      }
    }

    // Rate limit between batches
    if (i + BATCH_SIZE < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  return NextResponse.json({
    total: recipients.length,
    sent,
    failed,
    errors: errors.slice(0, 5), // first 5 errors
  });
}
