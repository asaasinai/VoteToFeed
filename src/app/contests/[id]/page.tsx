import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PetCard } from "@/components/pets/PetCard";
import { StorytellerEntry } from "@/components/contests/StorytellerEntry";
import { EntriesPaginator } from "@/components/contests/EntriesPaginator";
import { ContestCountdown } from "@/components/contests/ContestCountdown";
import { ContestLiveBattle } from "@/components/contests/ContestLiveBattle";
import { ContestEntriesLive } from "@/components/contests/ContestEntriesLive";
import { BuyVotesLink } from "@/components/voting/BuyVotesLink";
import { getAnimalType } from "@/lib/admin-settings";
import { formatDisplayName } from "@/lib/utils";

export const dynamic = "force-dynamic";

/* ─── Formats text with bullet points and line breaks ─── */
function FormattedText({ text }: { text: string }) {
  // Split on newlines OR "•" bullets, filter empty segments
  const sections = text.split(/\n|(?=•)/).map((s) => s.trim()).filter(Boolean);

  // Group into headings (ALL CAPS words followed by :) and bullet items
  return (
    <div className="space-y-1 text-sm text-surface-600 leading-relaxed">
      {sections.map((line, i) => {
        const isBullet = line.startsWith("•");
        const isHeading = !isBullet && /^[A-Z][A-Z\s]+:/.test(line);
        const content = isBullet ? line.replace(/^•\s*/, "") : line;

        if (isHeading) {
          return (
            <p key={i} className="font-semibold text-surface-800 mt-3 first:mt-0">
              {content}
            </p>
          );
        }
        if (isBullet) {
          return (
            <div key={i} className="flex gap-2">
              <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-brand-400" />
              <span>{content}</span>
            </div>
          );
        }
        return <p key={i}>{content}</p>;
      })}
    </div>
  );
}

export default async function ContestDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { reentry?: string; petId?: string };
}) {
  const animalType = await getAnimalType();
  const session = await getServerSession(authOptions);
  const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const now = new Date();

  const contest = await prisma.contest.findUnique({
    where: { id: params.id },
    include: {
      prizes: { orderBy: { placement: "asc" } },
      entries: {
        where: { isEliminated: false },
        include: {
          pet: {
            include: {
              user: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!contest) notFound();

  // Count votes per pet across the ENTIRE contest date range (not just current week)
  const petIds = [...new Set(contest.entries.map((e) => e.petId))];
  const dateFilter = { gte: contest.startDate, lte: contest.endDate };

  const [contestVotes, anonVotes] =
    petIds.length > 0
      ? await Promise.all([
          prisma.vote.groupBy({
            by: ["petId"],
            where: { petId: { in: petIds }, createdAt: dateFilter },
            _sum: { quantity: true },
          }),
          prisma.anonymousVote.groupBy({
            by: ["petId"],
            where: { petId: { in: petIds }, createdAt: dateFilter },
            _count: true,
          }),
        ])
      : [[], []];

  const votesByPet = new Map<string, number>();
  for (const v of contestVotes) votesByPet.set(v.petId, (votesByPet.get(v.petId) ?? 0) + (v._sum.quantity ?? 0));
  for (const v of anonVotes) votesByPet.set(v.petId, (votesByPet.get(v.petId) ?? 0) + v._count);

  const daysLeft = Math.max(0, Math.ceil((contest.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const hasEnded = contest.endDate < now;
  const prizeTotal = contest.prizes.reduce((s, p) => s + p.value, 0);

  const sortedEntries = contest.entries
    .filter((e) => e.pet.isActive && !e.isEliminated)
    .sort((a, b) => {
      const aVotes = votesByPet.get(a.petId) ?? 0;
      const bVotes = votesByPet.get(b.petId) ?? 0;
      return bVotes - aVotes;
    });

  // Find the current user's pets in this contest with their rank
  const myEntries = currentUserId
    ? sortedEntries
        .map((entry, idx) => ({ entry, rank: idx + 1, votes: votesByPet.get(entry.petId) ?? 0 }))
        .filter((row) => row.entry.pet.userId === currentUserId)
    : [];
  const totalEntries = sortedEntries.length;

  // Compute votes-needed-to-reach-next-rank for each owned pet (helps pitch buying votes)
  // Also compute who is chasing #1 (reverse gap)
  const myEntriesWithGap = myEntries.map(({ entry, rank, votes }) => {
    let gap = 0;
    let nextPetName: string | null = null;
    if (rank > 1) {
      const ahead = sortedEntries[rank - 2]; // 0-indexed: pet immediately above
      const aheadVotes = votesByPet.get(ahead.petId) ?? 0;
      gap = Math.max(1, aheadVotes - votes + 1);
      nextPetName = ahead.pet.name;
    }

    // Reverse: who is chasing this pet from below?
    let chaserGap = 0;
    let chaserName: string | null = null;
    if (rank <= sortedEntries.length - 1) {
      const below = sortedEntries[rank]; // 0-indexed: pet immediately below
      const belowVotes = votesByPet.get(below.petId) ?? 0;
      chaserGap = Math.max(1, votes - belowVotes);
      chaserName = below.pet.name;
    }

    // Smart package recommendation based on gap to beat
    const PACKAGES = [
      { tier: "STARTER", votes: 5, price: 99, label: "Starter" },
      { tier: "FRIEND", votes: 30, price: 499, label: "Friend" },
      { tier: "CHAMPION", votes: 150, price: 2499, label: "Champion" },
      { tier: "HERO", votes: 750, price: 9900, label: "Hero" },
      { tier: "LEGEND", votes: 2500, price: 24900, label: "Legend" },
      { tier: "ICON", votes: 6000, price: 49900, label: "Icon" },
    ];
    const targetGap = rank === 1 ? Math.max(50, chaserGap * 3) : gap;
    const recommended = PACKAGES.find((p) => p.votes >= targetGap) ?? PACKAGES[PACKAGES.length - 1];

    // What rank would the user be at with recommended package?
    const projectedVotes = votes + recommended.votes;
    let projectedRank = rank;
    for (let i = rank - 2; i >= 0; i--) {
      const theirVotes = votesByPet.get(sortedEntries[i].petId) ?? 0;
      if (projectedVotes > theirVotes) projectedRank = i + 1;
      else break;
    }

    return { entry, rank, votes, gap, nextPetName, chaserGap, chaserName, recommended, projectedRank };
  });

  function typeLabel(type: string) {
    const map: Record<string, string> = { NATIONAL: "Weekly", SEASONAL: "Seasonal", CHARITY: "Charity", CALENDAR: "Calendar", BREED: "Breed", STATE: "Regional", FLAGSHIP: "Flagship" };
    return map[type] || type;
  }
  function typeBadge(type: string) {
    const map: Record<string, string> = { NATIONAL: "bg-brand-100 text-brand-700", SEASONAL: "bg-amber-100 text-amber-700", CHARITY: "bg-emerald-100 text-emerald-700", CALENDAR: "bg-violet-100 text-violet-700", BREED: "bg-sky-100 text-sky-700", STATE: "bg-orange-100 text-orange-700", FLAGSHIP: "bg-yellow-400 text-yellow-900" };
    return map[type] || "bg-surface-100 text-surface-600";
  }

  const FLAGSHIP_PHASES = [
    { key: "OPEN",   label: "Open Entry", icon: "📋" },
    { key: "TOP100", label: "Top 100",     icon: "💯" },
    { key: "TOP25",  label: "Top 25",      icon: "🔥" },
    { key: "TOP5",   label: "Top 5",       icon: "⭐" },
    { key: "ENDED",  label: "Winner",      icon: "🏆" },
  ];
  const currentPhaseIdx = FLAGSHIP_PHASES.findIndex((p) => p.key === contest.currentPhase);
  const phaseDescriptions: Record<string, string> = {
    TOP100: `${sortedEntries.length} pets remain after the open round — only the top 100 advance.`,
    TOP25:  `${sortedEntries.length} pets remain — the field is cut to the top 25.`,
    TOP5:   `${sortedEntries.length} finalists remain — only the top 5 compete for the championship.`,
    ENDED:  "The championship has concluded. See the final results below.",
  };

  return (
    <div className="min-h-screen">
      <div className="relative h-48 sm:h-64 lg:h-72 bg-surface-100 overflow-hidden">
        {contest.coverImage ? (
          <img src={contest.coverImage} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-brand-200 to-brand-400 flex items-center justify-center">
            <span className="text-7xl">{contest.petType === "DOG" ? "🐶" : contest.petType === "CAT" ? "🐱" : contest.petType === "ALL" ? "🐶🐱" : "🐾"}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${typeBadge(contest.type)}`}>
                {typeLabel(contest.type)}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/20 text-white backdrop-blur-sm">
                {contest.petType === "DOG" ? "Dogs" : contest.petType === "CAT" ? "Cats" : contest.petType === "ALL" ? "Dogs & Cats" : "Pets"}
              </span>
              {contest.isFeatured && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-yellow-100/90 text-yellow-700">Featured</span>
              )}
              {hasEnded && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-red-500/80 text-white">Contest Ended</span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">{contest.name}</h1>
            {contest.sponsorName && (
              <p className="text-sm text-white/70 mt-1">Sponsored by {contest.sponsorName}</p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {searchParams?.reentry === "success" && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            ✅ Your pet is entered! Share to get more votes.
          </div>
        )}

        {contest.type === "FLAGSHIP" && contest.currentPhase !== "OPEN" && (
          <div className="mb-6 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">👑</span>
              <p className="text-sm font-extrabold text-amber-800 uppercase tracking-wider">Championship Progress</p>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 mb-3 overflow-x-auto pb-1">
              {FLAGSHIP_PHASES.map((phase, idx) => {
                const isActive = idx === currentPhaseIdx;
                const isPast   = idx < currentPhaseIdx;
                return (
                  <div key={phase.key} className="flex items-center gap-1 sm:gap-2 shrink-0">
                    <div className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl text-center min-w-[60px] transition-all ${
                      isActive ? "bg-amber-400 text-amber-900 shadow font-bold ring-2 ring-amber-300" :
                      isPast   ? "bg-amber-200 text-amber-700" :
                                 "bg-white/60 text-surface-400"
                    }`}>
                      <span className="text-base leading-none">{phase.icon}</span>
                      <span className="text-[10px] font-semibold whitespace-nowrap">{phase.label}</span>
                      {isActive && <span className="text-[8px] font-bold uppercase tracking-wider">NOW</span>}
                    </div>
                    {idx < FLAGSHIP_PHASES.length - 1 && (
                      <div className={`h-0.5 w-3 sm:w-5 rounded-full shrink-0 ${
                        idx < currentPhaseIdx ? "bg-amber-400" : "bg-surface-200"
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>
            {phaseDescriptions[contest.currentPhase] && (
              <p className="text-xs text-amber-700 font-medium">{phaseDescriptions[contest.currentPhase]}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="card p-4 text-center">
            <p className="text-xs font-medium text-surface-400 uppercase">Entries</p>
            <p className="text-2xl font-bold text-surface-900 mt-1">{sortedEntries.length}</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs font-medium text-surface-400 uppercase">{hasEnded ? "Duration" : "Time Left"}</p>
            <div className="mt-1">
              {hasEnded ? (
                <p className="text-2xl font-bold text-surface-900">Ended</p>
              ) : (
                <ContestCountdown endDate={contest.endDate.toISOString()} />
              )}
            </div>
            {!hasEnded && daysLeft <= 2 && (
              <p className="text-[10px] text-red-500 font-semibold mt-0.5 animate-pulse">⚡ Ending soon!</p>
            )}
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs font-medium text-surface-400 uppercase">Prize Pack Value</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{prizeTotal > 0 ? `$${(prizeTotal / 100).toLocaleString()}` : "TBD"}</p>
            <p className="text-[10px] text-surface-400 mt-0.5">in prizes</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs font-medium text-surface-400 uppercase">Entry Fee</p>
            <p className="text-2xl font-bold text-surface-900 mt-1">{contest.entryFee === 0 ? "Free" : `$${(contest.entryFee / 100).toFixed(2)}`}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {/* Personal "your pets in this contest" panel — designed to convert votes purchases */}
            {myEntries.length > 0 && (
              <div className="mb-6 rounded-3xl overflow-hidden shadow-xl shadow-brand-200/40 ring-1 ring-brand-200/60">
                {/* Gradient header */}
                <div className="relative bg-gradient-to-r from-brand-600 via-pink-500 to-amber-500 px-5 py-4 text-white overflow-hidden">
                  <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                  <div className="absolute -bottom-12 -left-4 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                  <div className="relative flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-white/80">
                        {myEntries.length === 1 ? "Your contestant" : "Your contestants"}
                      </p>
                      <h3 className="text-lg sm:text-xl font-extrabold mt-0.5 drop-shadow-sm">
                        {myEntries.length === 1
                          ? `${myEntries[0].entry.pet.name} is in the race! 🎉`
                          : `You have ${myEntries.length} pets competing 🎉`}
                      </h3>
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-widest bg-white/20 backdrop-blur px-3 py-1.5 rounded-full">
                      {totalEntries.toLocaleString()} pets
                    </span>
                  </div>
                </div>

                {/* Cards */}
                <div className="bg-white p-3 sm:p-4 space-y-3">
                  {myEntriesWithGap.map(({ entry, rank, votes, gap, nextPetName, chaserGap, chaserName, recommended, projectedRank }) => {
                    const photo = entry.pet.photos?.[0];
                    const placement =
                      rank === 1 ? "🥇 #1" : rank === 2 ? "🥈 #2" : rank === 3 ? "🥉 #3" : `#${rank}`;
                    const aheadOfPct =
                      totalEntries > 1
                        ? Math.round(((totalEntries - rank) / (totalEntries - 1)) * 100)
                        : 100;

                    // Contextual urgency message
                    let pitch = "";
                    let pitchAccent = "";
                    if (rank === 1) {
                      pitch = "👑 You're in the lead — defend your spot before someone overtakes you!";
                      pitchAccent = "from-yellow-50 to-amber-50 text-amber-800 border-amber-200";
                    } else if (rank <= 3) {
                      pitch = `🔥 Only ${gap.toLocaleString()} ${gap === 1 ? "vote" : "votes"} away from #${rank - 1}${nextPetName ? ` (${nextPetName})` : ""}. Take the crown!`;
                      pitchAccent = "from-rose-50 to-pink-50 text-rose-700 border-rose-200";
                    } else if (rank <= 10) {
                      pitch = `💪 ${gap.toLocaleString()} more ${gap === 1 ? "vote" : "votes"} to break into the top ${rank - 1}. You've got this!`;
                      pitchAccent = "from-brand-50 to-pink-50 text-brand-700 border-brand-200";
                    } else {
                      pitch = `🚀 You're ahead of ${aheadOfPct}% of pets — a vote boost can rocket ${entry.pet.name} into the top 10!`;
                      pitchAccent = "from-violet-50 to-fuchsia-50 text-violet-700 border-violet-200";
                    }

                    return (
                      <div
                        key={entry.pet.id}
                        className="rounded-2xl border border-surface-200 bg-white overflow-hidden hover:border-brand-300 hover:shadow-lg transition-all"
                      >
                        {/* Top row: photo + name + rank */}
                        <Link href={`/pets/${entry.pet.id}`} className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 group">
                          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-surface-100 flex-shrink-0 ring-2 ring-white shadow-md">
                            {photo ? (
                              <img src={photo} alt={entry.pet.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-3xl">
                                {entry.pet.type === "DOG" ? "🐶" : entry.pet.type === "CAT" ? "🐱" : "🐾"}
                              </div>
                            )}
                            {/* Rank chip overlay */}
                            <span
                              className={`absolute -top-1 -left-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-md border-2 border-white ${
                                rank === 1
                                  ? "bg-yellow-400 text-yellow-900"
                                  : rank === 2
                                    ? "bg-surface-300 text-surface-800"
                                    : rank === 3
                                      ? "bg-orange-400 text-orange-900"
                                      : "bg-brand-500 text-white"
                              }`}
                            >
                              {placement.split(" ")[1] ?? `#${rank}`}
                            </span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <p className="font-extrabold text-base sm:text-lg text-surface-900 group-hover:text-brand-600 transition-colors truncate">
                                {entry.pet.name}
                              </p>
                              <span
                                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                  rank === 1
                                    ? "bg-yellow-100 text-yellow-700"
                                    : rank <= 3
                                      ? "bg-rose-100 text-rose-700"
                                      : rank <= 10
                                        ? "bg-emerald-100 text-emerald-700"
                                        : "bg-surface-100 text-surface-600"
                                }`}
                              >
                                Ranked {placement}
                              </span>
                            </div>
                            <p className="text-xs sm:text-sm text-surface-500 mt-1">
                              <span className="font-bold text-surface-800">{votes.toLocaleString()}</span>{" "}
                              {votes === 1 ? "vote" : "votes"}
                              <span className="text-surface-300 mx-1.5">·</span>
                              <span>#{rank} of {totalEntries.toLocaleString()}</span>
                              {totalEntries > 1 && (
                                <>
                                  <span className="text-surface-300 mx-1.5">·</span>
                                  <span>ahead of {aheadOfPct}% of pets</span>
                                </>
                              )}
                            </p>
                          </div>
                        </Link>

                        {/* Pitch banner */}
                        <div className={`mx-3 sm:mx-4 rounded-xl border bg-gradient-to-r ${pitchAccent} px-3 py-2 text-xs sm:text-[13px] font-semibold leading-snug`}>
                          {pitch}
                        </div>

                        {/* Vote gap progress bar */}
                        {rank > 1 && gap > 0 && (() => {
                          const aheadVotes = votes + gap;
                          const pct = Math.min(99, Math.round((votes / aheadVotes) * 100));
                          return (
                            <div className="mx-3 sm:mx-4 mt-2 mb-1">
                              <div className="flex justify-between text-[10px] text-surface-500 mb-1">
                                <span>Your votes: <strong className="text-surface-800">{votes.toLocaleString()}</strong></span>
                                <span>Need <strong className="text-brand-600">+{gap.toLocaleString()}</strong> to beat {nextPetName ?? `#${rank - 1}`}</span>
                              </div>
                              <div className="h-2 rounded-full bg-surface-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })()}

                        {/* Danger alert: who is chasing you */}
                        {rank === 1 && chaserName && chaserGap <= 20 && (
                          <div className="mx-3 sm:mx-4 mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold animate-pulse">
                            <span className="text-base">⚠️</span>
                            <span><strong>{chaserName}</strong> is only <strong>{chaserGap} {chaserGap === 1 ? "vote" : "votes"}</strong> behind — defend your lead NOW!</span>
                          </div>
                        )}
                        {rank === 1 && chaserName && chaserGap > 20 && chaserGap <= 80 && (
                          <div className="mx-3 sm:mx-4 mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 font-semibold">
                            <span className="text-base">👀</span>
                            <span><strong>{chaserName}</strong> is <strong>{chaserGap} votes</strong> behind — keep your lead while you can!</span>
                          </div>
                        )}

                        {/* Smart package recommendation */}
                        {!hasEnded && (
                          <div className="mx-3 sm:mx-4 mt-3 rounded-xl border border-brand-200 bg-brand-50 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-brand-500 mb-2">
                              {rank === 1 ? "🛡️ Recommended to stay #1" : `🎯 Recommended to reach #${projectedRank < rank ? projectedRank : rank - 1}`}
                            </p>
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-extrabold text-surface-900">{recommended.label} Pack</p>
                                <p className="text-xs text-surface-500"><span className="font-bold text-brand-600">{recommended.votes} votes</span> · ${(recommended.price / 100).toFixed(2)}</p>
                                {projectedRank < rank && (
                                  <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">📈 Puts you at rank #{projectedRank}</p>
                                )}
                                {rank === 1 && (
                                  <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">📈 Extends your lead by {recommended.votes} votes</p>
                                )}
                              </div>
                              <BuyVotesLink
                                href={`/dashboard?buy=${recommended.tier}&pet=${entry.pet.id}`}
                                source="contest_recommended_pack"
                                petId={entry.pet.id}
                                petName={entry.pet.name}
                                packageTier={recommended.tier}
                                votesNeeded={rank === 1 ? chaserGap : gap}
                                currentRank={rank}
                                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition-colors shadow-sm"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                                Get it
                              </BuyVotesLink>
                            </div>
                          </div>
                        )}

                        {/* Action row: Buy Votes (primary) + Share */}
                        {!hasEnded && (
                          <div className="p-3 sm:p-4 pt-3 flex items-center gap-2 flex-wrap">
                            <BuyVotesLink
                              href={`/dashboard?buy=${recommended.tier}&pet=${entry.pet.id}`}
                              source="contest_entry_primary_cta"
                              petId={entry.pet.id}
                              petName={entry.pet.name}
                              packageTier={recommended.tier}
                              votesNeeded={rank === 1 ? chaserGap : gap}
                              currentRank={rank}
                              className="flex-1 min-w-[180px] inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                              </svg>
                              {rank === 1
                                ? "Buy votes — defend #1"
                                : rank <= 3
                                  ? "Buy votes — take the crown"
                                  : rank <= 10
                                    ? "Buy votes — climb the ranks"
                                    : "Buy votes — boost ranking"}
                            </BuyVotesLink>
                            <Link
                              href={`/pets/${entry.pet.id}`}
                              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-3 rounded-xl border border-surface-200 text-surface-700 hover:bg-surface-50 text-sm font-semibold transition-colors"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                              </svg>
                              Share
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Footer reassurance */}
                  {!hasEnded && (
                    <p className="text-[11px] text-center text-surface-400 pt-1">
                      🐾 Every vote helps shelter pets — proceeds support shelter rescue partners.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Prompt non-logged users / users without entry to add their pet */}
            {currentUserId && myEntries.length === 0 && !hasEnded && (
              <div className="mb-6 rounded-2xl border border-dashed border-brand-300 bg-brand-50/40 px-4 py-3 text-sm text-brand-700 flex items-center justify-between gap-3 flex-wrap">
                <span>You don&apos;t have a pet in this contest yet.</span>
                <Link href="/pets/new" className="btn-primary text-xs px-4 py-2">
                  Enter your pet
                </Link>
              </div>
            )}

            {/* Top 3 Battle section — live polling client component */}
            {sortedEntries.length >= 2 && !hasEnded && (
              <ContestLiveBattle
                contestId={contest.id}
                initialEntries={sortedEntries.slice(0, 5).map((e) => ({
                  id: e.pet.id,
                  name: e.pet.name,
                  photos: e.pet.photos,
                  type: e.pet.type,
                  votes: votesByPet.get(e.petId) ?? 0,
                }))}
                pollInterval={8000}
              />
            )}

            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">Contestants ({sortedEntries.length})</h2>              {!hasEnded && (
                <Link href="/pets/new" className="btn-primary text-sm px-4 py-2">
                  Enter your pet
                </Link>
              )}
            </div>

            {sortedEntries.length > 0 ? (
              <ContestEntriesLive
                contestId={contest.id}
                initialEntries={sortedEntries.map((e) => ({
                  petId: e.petId,
                  story: e.story ?? null,
                  pet: {
                    id: e.pet.id,
                    name: e.pet.name,
                    photos: e.pet.photos,
                    type: e.pet.type,
                    ownerFirstName: e.pet.ownerFirstName ?? null,
                    ownerLastName: e.pet.ownerLastName ?? null,
                    ownerName: e.pet.ownerName ?? null,
                    state: e.pet.state ?? null,
                    createdAt: e.pet.createdAt.toISOString(),
                    bio: e.pet.bio ?? null,
                  },
                }))}
                initialVotes={Object.fromEntries(
                  sortedEntries.map((e) => [e.pet.id, votesByPet.get(e.petId) ?? 0])
                )}
                isStoryteller={contest.isStoryteller}
                animalType={animalType}
                pollInterval={10000}
              />
            ) : (
              <div className="card p-12 text-center">
                <p className="text-surface-500">No entries yet. Be the first!</p>
                <Link href="/pets/new" className="btn-primary mt-4 inline-flex">Enter your pet</Link>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="card p-5">
              <h3 className="text-sm font-bold text-surface-900 mb-3">Contest Details</h3>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-surface-500">Starts</span>
                  <span className="font-medium text-surface-800">{contest.startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-surface-500">Ends</span>
                  <span className="font-medium text-surface-800">{contest.endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-surface-500">Pet Type</span>
                  <span className="font-medium text-surface-800">{contest.petType === "DOG" ? "Dogs" : contest.petType === "CAT" ? "Cats" : contest.petType === "ALL" ? "Dogs & Cats" : "Pets"}</span>
                </div>
                {contest.maxEntries && (
                  <div className="flex justify-between">
                    <span className="text-surface-500">Max Entries</span>
                    <span className="font-medium text-surface-800">{contest.maxEntries}</span>
                  </div>
                )}
              </div>
            </div>

            {contest.description && (
              <div className="card p-5">
                <h3 className="text-sm font-bold text-surface-900 mb-3">About</h3>
                <FormattedText text={contest.description} />
              </div>
            )}

            {contest.rules && (
              <div className="card p-5">
                <h3 className="text-sm font-bold text-surface-900 mb-3">Rules</h3>
                <FormattedText text={contest.rules} />
              </div>
            )}

            {contest.prizes.length > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-bold text-surface-900 mb-3">Prizes</h3>
                <div className="space-y-3">
                  {contest.prizes.map((prize) => (
                    <div key={prize.id} className="flex items-start gap-3">
                      <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        prize.placement === 1 ? "bg-yellow-100 text-yellow-700" :
                        prize.placement === 2 ? "bg-surface-200 text-surface-600" :
                        prize.placement === 3 ? "bg-orange-100 text-orange-700" :
                        "bg-surface-100 text-surface-500"
                      }`}>
                        {prize.placement}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-surface-800">{prize.title}</span>
                          <span className="text-xs font-bold text-emerald-600">${(prize.value / 100).toLocaleString()}</span>
                        </div>
                        {prize.description && <p className="text-xs text-surface-500 mt-0.5">{prize.description}</p>}
                        {prize.items.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5">
                            {prize.items.map((item, i) => (
                              <li key={i} className="text-xs text-surface-500 flex items-start gap-1.5">
                                <span className="text-brand-400 mt-0.5">•</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {contest.prizes.length === 0 && contest.prizeDescription && (
              <div className="card p-5">
                <h3 className="text-sm font-bold text-surface-900 mb-2">Prizes</h3>
                <p className="text-sm text-surface-600">{contest.prizeDescription}</p>
              </div>
            )}

            {!hasEnded && (
              <Link href="/pets/new" className="btn-primary w-full py-3 text-center block">
                Enter your pet — free
              </Link>
            )}

            {/* Sticky buy-votes urgency card */}
            {!hasEnded && myEntries.length > 0 && (
              <div className="sticky top-4">
                <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-pink-500 p-5 text-white shadow-xl shadow-brand-200/50">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/70 mb-1">Want to win?</p>
                  <p className="text-lg font-extrabold leading-tight">More votes = higher rank</p>
                  <p className="text-xs text-white/80 mt-1 mb-4">Every vote counts. Boost your pet before time runs out!</p>
                  <Link
                    href={`/pets/${myEntries[0].entry.pet.id}#buy-votes`}
                    className="block w-full text-center py-2.5 rounded-xl bg-white text-brand-600 font-bold text-sm hover:bg-brand-50 transition-colors shadow-md"
                  >
                    ⚡ Buy Votes Now
                  </Link>
                  <p className="text-[10px] text-white/60 text-center mt-2.5">🔒 Secure via Stripe · Instant delivery</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
