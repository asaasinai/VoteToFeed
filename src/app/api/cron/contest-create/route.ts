import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { createBiWeeklyContest } from "@/lib/contest-growth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  try {
    const [dogContest, catContest] = await Promise.all([
      createBiWeeklyContest("DOG", "NATIONAL"),
      createBiWeeklyContest("CAT", "NATIONAL"),
    ]);

    return NextResponse.json({
      ok: true,
      createdOrFound: [
        { id: dogContest.id, name: dogContest.name, petType: dogContest.petType, startDate: dogContest.startDate, endDate: dogContest.endDate },
        { id: catContest.id, name: catContest.name, petType: catContest.petType, startDate: catContest.startDate, endDate: catContest.endDate },
      ],
    });
  } catch (error) {
    console.error("contest-create cron failed:", error);
    return NextResponse.json({ error: "Failed to create recurring contests" }, { status: 500 });
  }
}
