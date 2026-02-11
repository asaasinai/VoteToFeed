import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/breeds?type=DOG|CAT
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type")?.toUpperCase();

    const where: Record<string, unknown> = {};
    if (type === "DOG" || type === "CAT") {
      where.petType = type;
    }

    const breeds = await prisma.breed.findMany({
      where,
      select: { id: true, name: true, petType: true, slug: true },
      orderBy: { name: "asc" },
    });

    // Move "Other / Mixed / Rescued" to the top for each type
    const sorted = breeds.sort((a, b) => {
      const aIsOther = a.name.startsWith("Other");
      const bIsOther = b.name.startsWith("Other");
      if (aIsOther && !bIsOther) return -1;
      if (!aIsOther && bIsOther) return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json(sorted);
  } catch (error) {
    console.error("Error fetching breeds:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
