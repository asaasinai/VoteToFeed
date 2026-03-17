import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { AdminPetEditor } from "./AdminPetEditor";

export const dynamic = "force-dynamic";

export default async function AdminPetDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");
  if ((session.user as { role?: string }).role !== "ADMIN") redirect("/dashboard");

  const pet = await prisma.pet.findUnique({
    where: { id: params.id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          city: true,
          state: true,
          createdAt: true,
        },
      },
      contestEntries: {
        include: {
          contest: {
            select: {
              id: true,
              name: true,
              startDate: true,
              endDate: true,
              isActive: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      _count: {
        select: {
          votes: true,
          contestEntries: true,
          comments: true,
        },
      },
    },
  });

  if (!pet) notFound();

  const voteAggregate = await prisma.vote.aggregate({
    where: { petId: pet.id },
    _sum: { quantity: true },
  });

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <AdminSectionNav currentPath="/admin/pets" />

        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <Link href="/admin/pets" className="text-sm font-medium text-brand-600 hover:text-brand-700">← Back to pets</Link>
            <h1 className="mt-2 text-2xl font-bold text-surface-900 tracking-tight">Edit {pet.name}</h1>
            <p className="text-sm text-surface-500 mt-1">Admin pet editor and contest status controls.</p>
          </div>
        </div>

        <AdminPetEditor
          pet={{
            id: pet.id,
            name: pet.name,
            ownerName: pet.ownerName,
            ownerFirstName: pet.ownerFirstName,
            ownerLastName: pet.ownerLastName,
            bio: pet.bio,
            type: pet.type,
            breed: pet.breed,
            state: pet.state,
            tags: pet.tags,
            photos: pet.photos,
            isActive: pet.isActive,
            createdAt: pet.createdAt.toISOString(),
            voteCount: voteAggregate._sum.quantity ?? 0,
            commentCount: pet._count.comments,
            contestEntryCount: pet._count.contestEntries,
            user: {
              id: pet.user.id,
              name: pet.user.name,
              email: pet.user.email,
              role: pet.user.role,
              city: pet.user.city,
              state: pet.user.state,
              createdAt: pet.user.createdAt.toISOString(),
            },
            contestEntries: pet.contestEntries.map((entry) => ({
              id: entry.id,
              createdAt: entry.createdAt.toISOString(),
              contest: {
                id: entry.contest.id,
                name: entry.contest.name,
                startDate: entry.contest.startDate.toISOString(),
                endDate: entry.contest.endDate.toISOString(),
                isActive: entry.contest.isActive,
              },
            })),
          }}
        />
      </div>
    </div>
  );
}
