import Link from "next/link";
import prisma from "@/lib/prisma";

export default async function BreedsPage() {
  const breeds = await prisma.breed.findMany({
    orderBy: { name: "asc" },
    take: 200,
  });

  const dogs = breeds.filter((b) => b.petType === "DOG");
  const cats = breeds.filter((b) => b.petType === "CAT");

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-xl sm:text-2xl font-bold text-surface-900 mb-1">Breed Directory</h1>
      <p className="text-sm text-surface-500 mb-8">Browse dog and cat breeds.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
        <div className="card p-5">
          <h2 className="text-lg font-bold text-surface-900 mb-4">Dogs</h2>
          <ul className="space-y-2">
            {dogs.length === 0 ? (
              <li className="text-sm text-surface-400">No breeds in database yet.</li>
            ) : (
              dogs.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/breeds/${b.slug}`}
                    className="text-sm text-brand-600 hover:underline"
                  >
                    {b.name}
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="text-lg font-bold text-surface-900 mb-4">Cats</h2>
          <ul className="space-y-2">
            {cats.length === 0 ? (
              <li className="text-sm text-surface-400">No breeds in database yet.</li>
            ) : (
              cats.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/breeds/${b.slug}`}
                    className="text-sm text-brand-600 hover:underline"
                  >
                    {b.name}
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
