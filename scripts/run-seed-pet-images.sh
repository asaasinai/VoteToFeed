#!/bin/bash

# Script to run the pet image seeding script
# This helper script checks for DATABASE_URL and runs the TypeScript seed script

set -e

echo "🐾 Pet Image Seeding Script Runner"
echo "===================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL environment variable is not set!"
  echo ""
  echo "To run this script, you need to set DATABASE_URL:"
  echo ""
  echo "Option 1: Set in .env file (recommended for local dev)"
  echo "  cp .env.example .env"
  echo "  # Edit .env and add your DATABASE_URL"
  echo "  npm run db:seed-images"
  echo ""
  echo "Option 2: Set as environment variable"
  echo "  export DATABASE_URL='postgresql://user:password@host:port/database'"
  echo "  npm run db:seed-images"
  echo ""
  echo "Option 3: For Vercel production"
  echo "  vercel env pull .env.local"
  echo "  npm run db:seed-images"
  echo ""
  exit 1
fi

echo "✅ DATABASE_URL is set"
echo "Running pet image seed script..."
echo ""

# Run the TypeScript seed script with tsx
npx tsx scripts/seed-pet-images.ts

echo ""
echo "✅ Seed script completed!"
echo ""
echo "Next steps:"
echo "  1. Verify the homepage shows pet images"
echo "  2. Commit script changes: git add scripts/seed-pet-images.ts && git commit -m 'feat: add pet image seeding script'"
echo "  3. Push to main: git push origin main"
