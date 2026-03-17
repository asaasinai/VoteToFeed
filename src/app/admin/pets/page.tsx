import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";

const PAGE_SIZE = 20;

export const dynamic = "force-dynamic";

export default async function AdminPetsPage({
  searchParams,
}: {
  searchParams?: { page?: string; search?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");
  if ((session.user as { role?: string }).role !== "ADMIN") redirect("/dashboard");

  const page = Math.max(1, Number(searchParams?.page || "1"));
  const search = (searchParams?.search || "").trim();
  const skip = (page - 1) * PAGE_SIZE;

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { ownerName: { contains: search, mode: "insensitive" as const } },
          { ownerFirstName: { contains: search, mode: "insensitive" as const } },
          { ownerLastName: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [pets, total, voteTotals] = await Promise.all([
    prisma.pet.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        ownerName: true,
        ownerFirstName: true,
        ownerLastName: true,
        type: true,
        isActive: true,
        photos: true,
        createdAt: true,
      },
    }),
    prisma.pet.count({ where }),
    prisma.vote.groupBy({
      by: ["petId"],
      _sum: { quantity: true },
      where: {
        petId: {
          in: (
            await prisma.pet.findMany({
              where,
              orderBy: { createdAt: "desc" },
              skip,
              take: PAGE_SIZE,
              select: { id: true },
            })
          ).map((pet) => pet.id),
        },
      },
    }),
  ]);

  const voteMap = new Map(voteTotals.map((row) => [row.petId, row._sum.quantity ?? 0]));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <AdminSectionNav currentPath="/admin/pets" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Pet Management</h1>
            <p className="text-sm text-surface-500 mt-1">Search, edit, deactivate, and restore pet entries.</p>
          </div>
          <form className="flex gap-2" action="/admin/pets" method="GET">
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Search by pet or owner"
              className="input-field min-w-[260px]"
            />
            <button type="submit" className="btn-primary px-4 py-2 text-sm">Search</button>
          </form>
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">Pet</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">Owner</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">Type</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-surface-400">Status</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-surface-400">Votes</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-surface-400">Created</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-surface-400">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {pets.map((pet) => {
                  const ownerName = pet.ownerName || [pet.ownerFirstName, pet.ownerLastName].filter(Boolean).join(" ") || "—";
                  return (
                    <tr key={pet.id} className="hover:bg-surface-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {pet.photos[0] ? (
                            <img src={pet.photos[0]} alt="" className="h-12 w-12 rounded-lg object-cover" />
                          ) : (
                            <div className="h-12 w-12 rounded-lg bg-surface-100 flex items-center justify-center text-xl">🐾</div>
                          )}
                          <div>
                            <p className="font-semibold text-surface-900">{pet.name}</p>
                            <p className="text-xs text-surface-400">{pet.id.slice(0, 8)}…</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-surface-700">{ownerName}</td>
                      <td className="px-4 py-3 text-surface-700">{pet.type}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${pet.isActive ? "bg-emerald-100 text-emerald-700" : "bg-surface-200 text-surface-500"}`}>
                          {pet.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-surface-800">{(voteMap.get(pet.id) ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-surface-500">{pet.createdAt.toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/pets/${pet.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                          Edit →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {pets.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-surface-400">No pets found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-surface-400">Page {page} of {totalPages} · {total.toLocaleString()} pets</p>
          <div className="flex gap-2">
            <Link
              href={`/admin/pets?page=${Math.max(1, page - 1)}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
              className={`rounded-lg border px-3 py-1.5 text-sm ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-surface-50"}`}
            >
              Previous
            </Link>
            <Link
              href={`/admin/pets?page=${Math.min(totalPages, page + 1)}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
              className={`rounded-lg border px-3 py-1.5 text-sm ${page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-surface-50"}`}
            >
              Next
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
