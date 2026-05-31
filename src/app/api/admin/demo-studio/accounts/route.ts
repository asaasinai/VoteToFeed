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
          city: true,
          state: true,
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

// PUT /api/admin/demo-studio/accounts — update user + pet
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { userId, petId, name, email, profileImage, city, state, petName, petType, petBreed, petBio, petPhotos } = body as {
    userId: string;
    petId?: string;
    name: string;
    email?: string;
    profileImage?: string;
    city?: string;
    state?: string;
    petName?: string;
    petType?: "DOG" | "CAT" | "OTHER";
    petBreed?: string;
    petBio?: string;
    petPhotos?: string[];
  };

  if (!userId || !name) {
    return NextResponse.json({ error: "userId and name required" }, { status: 400 });
  }

  if (email) {
    const conflict = await prisma.user.findFirst({ where: { email, id: { not: userId } } });
    if (conflict) return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { name, email: email || undefined, image: profileImage ?? undefined, city: city ?? undefined, state: state ?? undefined },
  });

  let updatedPet = null;
  if (petId && petName) {
    updatedPet = await prisma.pet.update({
      where: { id: petId },
      data: {
        name: petName,
        type: petType ?? "DOG",
        breed: petBreed ?? null,
        bio: petBio ?? null,
        photos: petPhotos ?? [],
        ownerName: name,
        ownerFirstName: name.split(" ")[0],
        ownerLastName: name.split(" ").slice(1).join(" ") || undefined,
      },
    });
  }

  return NextResponse.json({ user: updatedUser, pet: updatedPet });
}

// DELETE /api/admin/demo-studio/accounts?userId=xxx — delete demo account
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const demoAccount = await prisma.demoStudioAccount.findUnique({ where: { userId } });
  if (!demoAccount) return NextResponse.json({ error: "Not a demo studio account" }, { status: 404 });

  const userPets = await prisma.pet.findMany({ where: { userId }, select: { id: true } });
  const petIds = userPets.map((p) => p.id);
  if (petIds.length > 0) {
    await prisma.scheduledVote.deleteMany({ where: { petId: { in: petIds } } });
  }
  await prisma.scheduledPost.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ success: true });
}
