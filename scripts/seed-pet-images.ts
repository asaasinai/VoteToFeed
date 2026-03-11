/**
 * Seed pet images for pets with no photos
 * Uses free stock photo sources:
 * - Dogs: Dog CEO API (https://dog.ceo/dog-api/)
 * - Cats: Cat as a Service (https://cataas.com)
 * - Other: Unsplash placeholder images
 *
 * Run with: npx ts-node scripts/seed-pet-images.ts
 */

import { PrismaClient, PetType } from "@prisma/client";

const prisma = new PrismaClient();

// Stock photo sources
const DOG_PHOTO_SOURCES = [
  // Dog CEO API - high quality dog photos
  "https://images.dog.ceo/breeds/retriever-golden/n02099601_1003.jpg",
  "https://images.dog.ceo/breeds/retriever-golden/n02099601_1004.jpg",
  "https://images.dog.ceo/breeds/retriever-golden/n02099601_1005.jpg",
  "https://images.dog.ceo/breeds/retriever-golden/n02099601_1006.jpg",
  "https://images.dog.ceo/breeds/retriever-golden/n02099601_1007.jpg",
  "https://images.dog.ceo/breeds/retriever-golden/n02099601_1008.jpg",
  "https://images.dog.ceo/breeds/retriever-golden/n02099601_1009.jpg",
  "https://images.dog.ceo/breeds/retriever-golden/n02099601_1010.jpg",
  "https://images.dog.ceo/breeds/labrador/n02099712_1003.jpg",
  "https://images.dog.ceo/breeds/labrador/n02099712_1004.jpg",
  "https://images.dog.ceo/breeds/labrador/n02099712_1005.jpg",
  "https://images.dog.ceo/breeds/labrador/n02099712_1006.jpg",
  "https://images.dog.ceo/breeds/labrador/n02099712_1007.jpg",
  "https://images.dog.ceo/breeds/labrador/n02099712_1008.jpg",
  "https://images.dog.ceo/breeds/poodle-toy/n02113624_2148.jpg",
  "https://images.dog.ceo/breeds/poodle-toy/n02113624_2149.jpg",
  "https://images.dog.ceo/breeds/poodle-toy/n02113624_2150.jpg",
  "https://images.dog.ceo/breeds/poodle-toy/n02113624_2151.jpg",
  "https://images.dog.ceo/breeds/poodle-toy/n02113624_2152.jpg",
  "https://images.dog.ceo/breeds/beagle/n02088364_11136.jpg",
  "https://images.dog.ceo/breeds/beagle/n02088364_11137.jpg",
  "https://images.dog.ceo/breeds/beagle/n02088364_11138.jpg",
  "https://images.dog.ceo/breeds/husky/n02110185_11721.jpg",
  "https://images.dog.ceo/breeds/husky/n02110185_11722.jpg",
  "https://images.dog.ceo/breeds/husky/n02110185_11723.jpg",
  "https://images.dog.ceo/breeds/corgi-pembroke/n02113023_2958.jpg",
  "https://images.dog.ceo/breeds/corgi-pembroke/n02113023_2959.jpg",
  "https://images.dog.ceo/breeds/corgi-pembroke/n02113023_2960.jpg",
  "https://images.dog.ceo/breeds/bulldog/n02101388_100.jpg",
  "https://images.dog.ceo/breeds/bulldog/n02101388_101.jpg",
];

const CAT_PHOTO_SOURCES = [
  // Cat as a Service - free cat photos with ID-based variety
  "https://cataas.com/cat/5e71343450d82d0011a669ba",
  "https://cataas.com/cat/5e6fbfae050d82000e8c456c",
  "https://cataas.com/cat/5e63c34350d82d00118c4e6d",
  "https://cataas.com/cat/5e63d42850d82d0011a03e8a",
  "https://cataas.com/cat/5e6e17ff050d82000e8c4506",
  "https://cataas.com/cat/5e6e17f5050d82000e8c4501",
  "https://cataas.com/cat/5e6e17eb050d82000e8c44fc",
  "https://cataas.com/cat/5e6e17e0050d82000e8c44f7",
  "https://cataas.com/cat/5e6e17d6050d82000e8c44f2",
  "https://cataas.com/cat/5e6e17cb050d82000e8c44ed",
  "https://cataas.com/cat/5e6e17c0050d82000e8c44e8",
  "https://cataas.com/cat/5e6e17b5050d82000e8c44e3",
  "https://cataas.com/cat/5e6e17aa050d82000e8c44de",
  "https://cataas.com/cat/5e6e17a0050d82000e8c44d9",
  "https://cataas.com/cat/5e6e1795050d82000e8c44d4",
  "https://cataas.com/cat/5e6e178a050d82000e8c44cf",
  "https://cataas.com/cat/5e6e177f050d82000e8c44ca",
  "https://cataas.com/cat/5e6e1775050d82000e8c44c5",
  "https://cataas.com/cat/5e6e176a050d82000e8c44c0",
  "https://cataas.com/cat/5e6e175f050d82000e8c44bb",
];

const OTHER_PET_SOURCES = [
  // Unsplash placeholder for other pets
  "https://source.unsplash.com/400x400/?rabbit",
  "https://source.unsplash.com/400x400/?hamster",
  "https://source.unsplash.com/400x400/?bird",
  "https://source.unsplash.com/400x400/?pet",
  "https://source.unsplash.com/400x400/?animal",
];

function getRandomPhoto(photoList: string[]): string {
  return photoList[Math.floor(Math.random() * photoList.length)];
}

async function main() {
  console.log("🐾 Starting pet image seeding...\n");

  // Find all pets with empty photos
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
      type: true,
      ownerName: true,
    },
  });

  // Also check for pets with no photos in different way
  const allActivePets = await prisma.pet.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      type: true,
      ownerName: true,
      photos: true,
    },
  });

  const petsNeedingPhotos = allActivePets.filter(
    (p) => !p.photos || p.photos.length === 0
  );

  console.log(`Found ${petsNeedingPhotos.length} pets needing photos\n`);

  if (petsNeedingPhotos.length === 0) {
    console.log("✅ All pets already have photos!");
    return;
  }

  // Update each pet with a random stock photo
  let successCount = 0;
  let errorCount = 0;

  for (const pet of petsNeedingPhotos) {
    try {
      let photoUrl: string;

      // Select appropriate photo based on pet type
      if (pet.type === PetType.DOG) {
        photoUrl = getRandomPhoto(DOG_PHOTO_SOURCES);
      } else if (pet.type === PetType.CAT) {
        photoUrl = getRandomPhoto(CAT_PHOTO_SOURCES);
      } else {
        photoUrl = getRandomPhoto(OTHER_PET_SOURCES);
      }

      // Update pet with new photo
      await prisma.pet.update({
        where: { id: pet.id },
        data: {
          photos: [photoUrl],
        },
      });

      console.log(
        `✅ ${pet.name} (${pet.type}) - Added photo from ${photoUrl.split("/")[2]}`
      );
      successCount++;
    } catch (error) {
      console.error(`❌ Failed to update ${pet.name}:`, error);
      errorCount++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Seeding Summary:");
  console.log("=".repeat(60));
  console.log(`✅ Successfully seeded: ${successCount} pets`);
  console.log(`❌ Failed: ${errorCount} pets`);
  console.log(`📊 Total: ${petsNeedingPhotos.length} pets`);

  if (successCount > 0) {
    console.log("\n🎉 Pet image seeding complete!");
  }
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
