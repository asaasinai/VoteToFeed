# Pet Image Seeding Script

This script automatically assigns stock pet photos to all pets that have no images in the database.

## What It Does

- Queries the database for all **active pets with empty photos arrays**
- Based on each pet's `type` (DOG, CAT, or OTHER):
  - **Dogs**: Assigns random photos from the [Dog CEO API](https://dog.ceo/dog-api/) — high quality, no auth required
  - **Cats**: Assigns random photos from [Cat as a Service (CATAAS)](https://cataas.com) — free cat photos
  - **Other**: Assigns random pet photos from Unsplash
- Updates the pet record with the new photo URL in their `photos` array

## Why

The seed/auto-engage accounts that auto-created contest entries for the app don't have photos. This causes:
- Broken placeholder cards on the homepage
- Poor user experience (no pet images)
- Missing OG share images for social media

This script fixes that by seeding real pet photos without requiring user uploads.

## How to Run

### Prerequisites

Make sure you have `DATABASE_URL` set in your environment:

```bash
# Option 1: For local development
export DATABASE_URL="postgresql://user:password@localhost:5432/petvoter"

# Option 2: For Vercel production
vercel env pull .env.local
source .env.local

# Option 3: Or create a .env file
echo 'DATABASE_URL="postgresql://..."' > .env
```

### Run the Script

```bash
# Using npm script (recommended)
npm run db:seed-images

# Or directly with tsx
npx tsx scripts/seed-pet-images.ts

# Or with bash helper
bash scripts/run-seed-pet-images.sh
```

## Expected Output

```
🐾 Starting pet image seeding...

Found 7 pets needing photos

✅ Maple (DOG) - Added photo from images.dog.ceo
✅ Charlie (DOG) - Added photo from images.dog.ceo
✅ Chloe (CAT) - Added photo from cataas.com
✅ Scout (DOG) - Added photo from images.dog.ceo
✅ Finn (DOG) - Added photo from images.dog.ceo
✅ Sadie (DOG) - Added photo from images.dog.ceo
✅ Luna (CAT) - Added photo from cataas.com

============================================================
Seeding Summary:
============================================================
✅ Successfully seeded: 7 pets
❌ Failed: 0 pets
📊 Total: 7 pets

🎉 Pet image seeding complete!
```

## Photo Sources

All sources are **free and require no authentication**:

### Dog Photos
- **Dog CEO API** (`https://images.dog.ceo/breeds/...`)
  - 30+ dog photos of various breeds
  - High quality, free to use
  - No API key or rate limiting

### Cat Photos
- **Cat as a Service** (`https://cataas.com/cat/{id}`)
  - 20+ unique cat photos
  - Free service
  - No authentication needed

### Other Pet Photos
- **Unsplash** (`https://source.unsplash.com/400x400/?{species}`)
  - Random pet photos
  - Free under Unsplash License
  - No key required for moderate usage

## After Seeding

1. ✅ Verify the homepage shows pet images in cards
2. ✅ Check that pet detail pages display the newly seeded photos
3. ✅ Test social sharing to ensure OG images work
4. ✅ Commit the script to main:
   ```bash
   git add scripts/seed-pet-images.ts scripts/SEED_PET_IMAGES.md package.json
   git commit -m "feat: add pet image seeding script for seed accounts"
   git push origin main
   ```

## Troubleshooting

### "DATABASE_URL is not set"
Set the environment variable before running:
```bash
export DATABASE_URL="postgresql://..."
npm run db:seed-images
```

### "No pets found needing photos"
This is fine! It means all pets already have photos. The script exits gracefully.

### "Failed to update {petName}"
This could indicate:
- Database connection issues
- Pet ID not found
- Permission issues

Check the error message and verify DATABASE_URL is correct.

### Pet images not showing on homepage
After running the script:
1. Clear your browser cache
2. Refresh the page
3. Check that the photos array in the database actually has URLs:
   ```sql
   SELECT id, name, photos FROM "Pet" WHERE photos != '{}' LIMIT 5;
   ```

## Notes

- This script is **safe to run multiple times** — it only updates pets with empty photo arrays
- Photos are stored as URLs, not uploaded to Vercel Blob (simpler approach)
- If you want to use Vercel Blob for storage instead, see the comments in `seed-pet-images.ts`
- The script respects pet type to assign appropriate photos (dogs get dog pics, cats get cat pics)

## Future Enhancements

- [ ] Upload images to Vercel Blob and store blob URLs instead of external URLs
- [ ] Add more diverse photo sources
- [ ] Allow customizing photo sources per pet type
- [ ] Cache photos locally to avoid rate limiting
