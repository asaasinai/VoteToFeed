# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Vote to Feed (petvoter) is a Next.js 14 (App Router) + TypeScript monolith. There is one service to run: the Next.js dev server. PostgreSQL is the only infrastructure dependency.

### Running services

- **PostgreSQL**: Must be running on port 5434 (mapped from container port 5432). Start with:
  ```
  docker run --name petvoter-db -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=petvoter -p 5434:5432 -d postgres:15
  ```
- **Next.js dev server**: `npm run dev` (port 3000)

### Database

- Prisma uses `POSTGRES_PRISMA_URL` (pooled) and `POSTGRES_URL_NON_POOLING` (direct). Vercel Postgres auto-sets these when the "vote-to-feed" database is linked. For local dev, both point to localhost:5434.
- Push schema: `npx prisma db push`
- Seed data (run in order):
  ```
  npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
  npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-breeds.ts
  npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-contests.ts
  npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-shelter-posts.ts
  ```

### Default accounts

The seed script creates these accounts (note: the README says `admin123`/`demo123` but the actual seed uses `password123` for both):

| Role  | Email                  | Password    |
|-------|------------------------|-------------|
| Admin | admin@petvoter.com     | password123 |
| User  | demo@petvoter.com      | password123 |

### Lint

`npm run lint` currently fails due to a pre-existing mismatch: `eslint.config.mjs` uses ESLint 9+ flat config API (`defineConfig`, `globalIgnores`) but `package.json` pins ESLint 8. This is not caused by environment setup.

### Build

`npm run build` runs `prisma generate && next build`.

### Email system

- Email is powered by **Resend** (replaced SendGrid). Configure via Admin > Email Alerts or `.env` (`RESEND_API_KEY`).
- `src/lib/resend.ts` contains all 7 email touchpoint functions with `{{variable}}` interpolation.
- `src/lib/sendgrid.ts` is a thin re-export shim kept for backwards compatibility.
- Email templates are stored in the `EmailTemplate` DB table and admin-editable.
- User notification preferences (`UserNotificationPrefs`) are per-user opt-in/out toggles.

### Key gotchas

- The `postinstall` script runs `npx prisma generate`, so `npm install` requires `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING` to be set.
- Vercel Postgres auto-injects these when the "vote-to-feed" database is linked to the project.
- File uploads go to `public/uploads/` (local disk), not cloud storage.
- Stripe, Resend, OAuth providers are all optional; the app works without them.
