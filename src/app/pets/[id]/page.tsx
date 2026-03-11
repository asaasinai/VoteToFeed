import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCurrentWeekId } from "@/lib/utils";
import { getAnimalType } from "@/lib/admin-settings";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  return { title: `Pet ${params.id}` };
}

export default async function PetDetailPage({
  params,
}: {
  params: { id: string };
}) {
  try {
    const session = await getServerSession(authOptions);
    const weekId = getCurrentWeekId();
    const animalType = await getAnimalType();
    const pet = await prisma.pet.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { id: true, name: true, image: true } },
        weeklyStats: { where: { weekId }, take: 1 },
        votes: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { user: { select: { name: true, image: true } } },
        },
        comments: {
          where: { parentId: null },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            user: { select: { name: true, image: true } },
            replies: {
              include: { user: { select: { name: true, image: true } } },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });
    if (!pet) return notFound();
    return (
      <div>
        <p>Pet: {pet.name}</p>
        <p>Session: {session?.user?.email ?? "none"}</p>
        <p>Animal type: {animalType}</p>
        <p>Votes: {pet.votes.length}</p>
        <p>Comments: {pet.comments.length}</p>
      </div>
    );
  } catch (e: unknown) {
    const err = e as Error;
    return (
      <div style={{ padding: 40, fontFamily: "monospace", background: "#fee", color: "#900" }}>
        <h1>Caught Error</h1>
        <pre>{err?.message}</pre>
        <pre style={{ fontSize: 11 }}>{err?.stack}</pre>
      </div>
    );
  }
}
