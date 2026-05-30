import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

// GET /api/admin/demo-studio/accounts — list demo studio accounts
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const demoAccounts = await prisma.demoStudioAccount.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
          pets: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              type: true,
              breed: true,
              photos: true,
              contestEntries: {
                select: {
                  contestId: true,
                  contest: { select: { id: true, name: true, isActive: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  return NextResponse.json({ accounts: demoAccounts });
}

// POST /api/admin/demo-studio/accounts — create demo user + pet
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    // User fields
    name,
    email,
    profileImage,
    city,
    state,
    country = "US",
    // Pet fields
    petName,
    petType = "DOG",
    petBreed,
    petBio,
    petPhotos = [],
  } = body as {
    name: string;
    email: string;
    profileImage?: string;
    city?: string;
    state?: string;
    country?: string;
    petName: string;
    petType?: "DOG" | "CAT" | "OTHER";
    petBreed?: string;
    petBio?: string;
    petPhotos?: string[];
  };

  if (!name || !email || !petName) {
    return NextResponse.json({ error: "name, email, and petName are required" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const password = await bcrypt.hash(`demo_${Date.now()}`, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password,
      image: profileImage,
      city,
      state,
      country,
      freeVotesRemaining: 5,
      paidVoteBalance: 0,
    },
  });

  const pet = await prisma.pet.create({
    data: {
      name: petName,
      type: petType,
      breed: petBreed,
      bio: petBio,
      photos: petPhotos,
      isActive: true,
      country,
      city,
      state,
      ownerName: name,
      ownerFirstName: name.split(" ")[0],
      ownerLastName: name.split(" ").slice(1).join(" ") || undefined,
      userId: user.id,
    },
  });

  await prisma.demoStudioAccount.create({
    data: { userId: user.id },
  });

  return NextResponse.json({ user, pet }, { status: 201 });
}
