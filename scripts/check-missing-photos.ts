/**
 * Check for pets with missing/empty photos
 * Run with: npx ts-node scripts/check-missing-photos.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Checking for pets with missing or empty photos...\n");

  // Find pets with empty photos array
  const petsWithNoPhotos = await prisma.pet.findMany({
    where: {
      photos: {
        equals: [],
      },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      ownerName: true,
      type: true,
      createdAt: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  // Find all pets to check for those that might have null/undefined in photos
  const allActivePets = await prisma.pet.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      ownerName: true,
      type: true,
      photos: true,
      createdAt: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  const petsWithEmptyOrMissingPhotos = allActivePets.filter(
    (p) => !p.photos || p.photos.length === 0
  );

  // Find seed/auto-engage accounts (emails containing @iheartdogs.com)
  const seedAccounts = await prisma.user.findMany({
    where: {
      email: {
        contains: "@iheartdogs.com",
      },
    },
    select: {
      id: true,
      email: true,
    },
  });

  console.log(`Found ${seedAccounts.length} seed/auto-engage accounts:`);
  seedAccounts.forEach((acc) => {
    console.log(`  - ${acc.email}`);
  });

  console.log("\n" + "=".repeat(60));
  console.log(`Pets with NO photos (${petsWithEmptyOrMissingPhotos.length}):`);
  console.log("=".repeat(60));

  if (petsWithEmptyOrMissingPhotos.length === 0) {
    console.log("✅ All active pets have at least one photo!\n");
  } else {
    petsWithEmptyOrMissingPhotos.forEach((pet) => {
      console.log(`\n📷 ${pet.name} (${pet.type})`);
      console.log(`   ID: ${pet.id}`);
      console.log(`   Owner: ${pet.ownerName} (${pet.user.email})`);
      console.log(`   Created: ${pet.createdAt.toISOString()}`);
      console.log(`   Photos: ${pet.photos?.length || 0}`);
    });
  }

  // Check for pets with only auto-engage photos (if we had stored who uploaded them)
  console.log("\n" + "=".repeat(60));
  console.log("Summary:");
  console.log("=".repeat(60));
  console.log(`Total active pets: ${allActivePets.length}`);
  console.log(`Pets with missing photos: ${petsWithEmptyOrMissingPhotos.length}`);
  console.log(`Seed accounts (auto-engage): ${seedAccounts.length}`);

  if (petsWithEmptyOrMissingPhotos.length > 0) {
    console.log(
      "\n⚠️  These pets will show a placeholder card with their initials"
    );
    console.log("    Users should upload photos for these pets ASAP");
  }

  // Show photo distribution
  const photoDistribution = allActivePets.reduce(
    (acc, pet) => {
      const photoCount = pet.photos?.length || 0;
      const key = `${photoCount} photo${photoCount === 1 ? "" : "s"}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.log("\nPhoto distribution:");
  Object.entries(photoDistribution)
    .sort()
    .forEach(([count, num]) => {
      console.log(`  ${count}: ${num} pets`);
    });
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
