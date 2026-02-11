import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SAMPLE_SHELTER_PHOTOS = [
  "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=600&h=600&fit=crop",
  "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=600&h=600&fit=crop",
  "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&h=600&fit=crop",
  "https://images.unsplash.com/photo-1450778869180-e50e0b562345?w=600&h=600&fit=crop",
  "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=600&h=600&fit=crop",
  "https://images.unsplash.com/photo-1574158622682-e40e69881006?w=600&h=600&fit=crop",
  "https://images.unsplash.com/photo-1526336024174-e58f5cdd8e13?w=600&h=600&fit=crop",
  "https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=600&h=600&fit=crop",
  "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&h=600&fit=crop",
  "https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=600&h=600&fit=crop",
  "https://images.unsplash.com/photo-1561037404-61cd46aa615b?w=600&h=600&fit=crop",
  "https://images.unsplash.com/photo-1596854407944-bf87f6fdd49e?w=600&h=600&fit=crop",
];

const CAPTIONS = [
  "30 shelter dogs received meals today thanks to your votes! These pups were so grateful for the food and love.",
  "Our partner shelter in Tennessee just got their weekly delivery. Look at those happy faces!",
  "Every vote counts! This week's donations helped feed 45 cats at Happy Paws Rescue.",
  "Big delivery day at Sunshine Animal Shelter! Your votes made this possible.",
  "Meet some of the shelter pets your votes have helped. They're getting stronger every day!",
  "Food bank drop-off at Central City Animal Shelter. 200 meals delivered this month alone!",
  "These sweet cats at Whisker Haven got a special treat today because of the Vote to Feed community.",
  "Another successful delivery! Riverside Rescue is stocked up for the week thanks to you all.",
];

const LOCATIONS = [
  "Happy Paws Rescue, Nashville TN",
  "Sunshine Animal Shelter, Austin TX",
  "Central City Animal Shelter, Los Angeles CA",
  "Whisker Haven Rescue, Portland OR",
  "Riverside Rescue, Denver CO",
  "Furry Friends Foundation, Miami FL",
  "Second Chance Shelter, Chicago IL",
  "Paws & Claws Rescue, Seattle WA",
];

async function main() {
  console.log("Seeding shelter posts...");

  // Get admin user
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) {
    console.log("No admin user found. Run main seed first.");
    return;
  }

  // Get some contests to tag
  const contests = await prisma.contest.findMany({ take: 4, select: { id: true } });

  // Clear existing shelter posts
  await prisma.shelterPost.deleteMany();

  // Create sample posts (newest at top)
  for (let i = 0; i < 8; i++) {
    const photoCount = Math.random() > 0.5 ? 2 : Math.random() > 0.5 ? 3 : 1;
    const startIdx = (i * 2) % SAMPLE_SHELTER_PHOTOS.length;
    const photos: string[] = [];
    for (let j = 0; j < photoCount; j++) {
      photos.push(SAMPLE_SHELTER_PHOTOS[(startIdx + j) % SAMPLE_SHELTER_PHOTOS.length]);
    }

    await prisma.shelterPost.create({
      data: {
        photos,
        caption: CAPTIONS[i % CAPTIONS.length],
        location: LOCATIONS[i % LOCATIONS.length],
        contestId: i < contests.length ? contests[i].id : null,
        authorId: admin.id,
        isPublished: true,
        createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000), // Stagger by days
      },
    });
  }

  console.log("Created 8 sample shelter posts.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
