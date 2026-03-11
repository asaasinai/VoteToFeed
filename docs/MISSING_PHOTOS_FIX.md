# Missing Pet Photos - Documentation & Fix

## Problem

Some pet cards were showing blank/missing images on the site. This happened because:

1. **Auto-engagement cron jobs** (seed accounts with emails like `vote@iheartdogs.com` through `vote+19@iheartdogs.com`) were uploading random internet memes as pet photos
2. When these meme images were removed/filtered, some pets were left with **zero valid photos** in their `photos` array
3. The UI previously had no fallback/placeholder for truly missing photos

## Solution

### 1. **Updated Pet Card Component** (`src/components/pets/PetCard.tsx`)

- Detects when a pet has **zero photos**
- Shows a **colorful placeholder** with the pet's initials
- Displays a "No Photo" badge and "Photo Pending" text
- Each pet gets a consistent color based on their ID

**Example:**
```
┌─────────────┐
│   [Color]   │  ← Background color based on pet ID
│     LF      │  ← Pet initials (Luna Fido → LF)
│ Photo       │
│ Pending     │
└─────────────┘
```

### 2. **Updated Pet Image Component** (`src/app/pets/[id]/PetImage.tsx`)

- Handles truly missing/empty photo URLs
- Shows the same placeholder for detail pages
- Graceful fallback if external image URLs fail to load
- No more random placedog images for missing photos

### 3. **Database Query Script** (`scripts/check-missing-photos.ts`)

Helps admins identify which pets have missing photos:

```bash
npx ts-node scripts/check-missing-photos.ts
```

**Output includes:**
- List of all pets with zero photos
- Pet details (name, owner, created date)
- Seed account emails
- Photo distribution statistics

### 4. **Vercel Blob Storage Configuration**

**IMPORTANT:** If image uploads are broken, check if `BLOB_READ_WRITE_TOKEN` is set in Vercel environment:

1. Go to Vercel project settings
2. Check "Environment Variables"
3. Look for `BLOB_READ_WRITE_TOKEN`
4. If missing, you'll need to:
   - Generate a new Vercel Blob API token
   - Add it to the project environment variables
   - Redeploy the application

Users won't be able to upload pet photos without this token.

## Seed/Auto-Engage Accounts

The auto-engagement cron job uses seed accounts to provide initial engagement for new users:

- **Email pattern:** `vote@iheartdogs.com` through `vote+19@iheartdogs.com`
- **Action:** Creates votes and comments on new pets
- **Restriction:** ✅ **NO LONGER** modifies pet photos (this was the bug)
- **Location:** `src/app/api/cron/auto-engage/route.ts`

The auto-engage cron is now **explicitly blocked** from touching the `photos` field.

## Admin Actions

### To Fix Individual Pets with Missing Photos

Option 1: **Edit pet via admin dashboard**
- Upload a proper photo for the pet
- Pet card will update to show the real photo

Option 2: **Bulk photo cleanup**
- Run the check script to identify pets
- Contact pet owners to upload photos
- Show them where their "Photo Pending" pets are

### To Check Image Upload Status

Call the admin endpoint:
```
GET /api/admin/cleanup-pet-photos?action=list
```

This returns:
- All pets with multiple photos (old issue)
- Lists all photos for cleanup

## User Experience

### Before Fix
```
Pet card shows:
- Blank/broken image  OR
- Random internet meme image
- No indication that photo is missing
```

### After Fix
```
Pet card shows:
- Colorful placeholder with initials
- "No Photo" badge
- "Photo Pending" text
- Clear indication to upload a real photo
```

Users see that the pet is missing a photo and can easily identify which pets need photos.

## Technical Details

### Photo Array Storage

In Prisma schema (`prisma/schema.prisma`):
```typescript
model Pet {
  id      String   @id @default(cuid())
  photos  String[] // Array of photo URLs
  // ... other fields
}
```

**Empty photos array** (`[]`): Pet has no photos yet
**Single photo** (`["https://..."]`): Standard state
**Multiple photos**: Old issue (users shouldn't have this)

### Color Generation

Placeholder colors are deterministic based on pet ID:
```typescript
const colors = [
  "bg-blue-400",      // Pets with ID starting with certain hashes
  "bg-purple-400",
  "bg-pink-400",
  // ... 10 total colors
];
// Same pet always gets same color
```

### Initials Generation

From pet name (up to 2 characters):
- "Max" → "M"
- "Luna Fido" → "LF"
- "Buddy Bear" → "BB"

## Testing

### Local Testing

1. Create a test pet with empty photos:
```sql
UPDATE pet SET photos = '[]' WHERE id = 'some-pet-id';
```

2. View the pet card on homepage
3. Should show: Colored placeholder + initials + "No Photo" badge

4. View the pet detail page
5. Should show: Larger placeholder in image area

### Production Verification

1. Run the check script:
```bash
npx ts-node scripts/check-missing-photos.ts
```

2. Check Vercel logs for any upload errors:
```
[upload/blob] BLOB_READ_WRITE_TOKEN is not set
```

3. Visit affected pets and verify they show placeholders correctly

## Prevention

To prevent this issue in the future:

1. ✅ **Auto-engage cron** — Cannot modify `pet.photos` (enforced in code)
2. **Image validation** — Uploads are validated by file type, not source
3. **Monitoring** — Admin dashboard shows pets with photo issues
4. **Alerts** — Email owners if pets have no photos for >7 days

## References

- **Auto-engage cron:** `src/app/api/cron/auto-engage/route.ts`
- **Pet Card Component:** `src/components/pets/PetCard.tsx`
- **Pet Image Component:** `src/app/pets/[id]/PetImage.tsx`
- **Image Upload Endpoint:** `src/app/api/upload/blob/route.ts`
- **Database Schema:** `prisma/schema.prisma`

## Questions?

Check the commit message:
```
git log --grep="missing photos" --oneline
```

Or review the specific commit for technical details.
