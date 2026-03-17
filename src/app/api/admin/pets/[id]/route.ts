import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if ((session.user as { role?: string }).role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const pet = await prisma.pet.findUnique({ where: { id: params.id } });
    if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

    const updated = await prisma.pet.update({
      where: { id: params.id },
      data: {
        name: typeof body.name === "string" ? body.name.trim() : pet.name,
        ownerName: typeof body.ownerName === "string" ? body.ownerName.trim() : pet.ownerName,
        ownerFirstName: typeof body.ownerFirstName === "string" ? body.ownerFirstName.trim() || null : pet.ownerFirstName,
        ownerLastName: typeof body.ownerLastName === "string" ? body.ownerLastName.trim() || null : pet.ownerLastName,
        bio: typeof body.bio === "string" ? body.bio.trim() || null : pet.bio,
        type: typeof body.type === "string" ? body.type : pet.type,
        breed: typeof body.breed === "string" ? body.breed.trim() || null : pet.breed,
        state: typeof body.state === "string" ? body.state.trim() || null : pet.state,
        tags: Array.isArray(body.tags)
          ? body.tags
              .filter((tag: unknown): tag is string => typeof tag === "string" && tag.trim().length > 0)
              .map((tag: string) => tag.trim())
          : pet.tags,
        photos: Array.isArray(body.photos)
          ? body.photos
              .filter((photo: unknown): photo is string => typeof photo === "string" && photo.trim().length > 0)
              .map((photo: string) => photo.trim())
          : pet.photos,
        isActive: typeof body.isActive === "boolean" ? body.isActive : pet.isActive,
      },
    });

    return NextResponse.json({ pet: updated });
  } catch (error) {
    console.error("Admin pet patch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
