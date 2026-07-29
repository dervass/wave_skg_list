# Wave-SKG Guest List

Private, mobile-first guest-list, entrance check-in, and PR settlement software for
Wave-SKG events. Guests and PRs never receive accounts; reservations continue to
arrive through Instagram and are entered by Wave-SKG organizers.

## What is included

- Next.js App Router, strict TypeScript, Tailwind CSS, and installable PWA
- Supabase Auth with staff-only usernames mapped to private internal email aliases
- PostgreSQL migrations, normalized records, RLS policies, atomic database functions,
  immutable check-in/correction ledger, and immutable settlement snapshots
- Organizer reservation entry, persistent PR selection, bulk paste/preview, duplicate
  review, guest list, CSV export, closure/reopening, and simple PR settlement
- Door search, partial arrivals, touch-friendly increments, walk-ins, live attendance,
  cached guest list, IndexedDB outbox, automatic sync, idempotency, and conflict flags
- Admin-only server route for account creation, disable/enable, and credential reset
- Seed data and automated business-rule tests

## Local setup

Requirements: Node.js 20.9+, npm, Docker, and the Supabase CLI.

1. Copy `.env.example` to `.env.local`.
2. Install packages with `npm install`.
3. Run `supabase start`.
4. Copy the local project URL, anon/publishable key, and service-role key printed by
   the CLI into `.env.local`.
5. Apply the database with `supabase db reset`.
6. Set a temporary `SEED_DEFAULT_PASSWORD` of at least 12 characters and run
   `npm run seed`.
7. Start the app with `npm run dev` and open `http://localhost:3000`.

The seeded usernames are `waveadmin`, `organizer1`, `organizer2`, `door1`, and
`door2`. They initially share only the local temporary seed password. Reset every
production credential immediately after provisioning.

## Supabase production setup in the EU

1. In the Supabase dashboard create one production project and select an available
   European region (for example Frankfurt, Ireland, London, Paris, Stockholm, or
   Zurich). Region choice is permanent, so confirm it before creating the project.
2. Store guest phone and Instagram data only in that project. Do not create a second
   browser-only or per-device source of truth.
3. Link this directory with `supabase link --project-ref YOUR_PROJECT_REF`.
4. Review the migration, then run `supabase db push`.
5. Set the production values in a secure local `.env.local` only long enough to run
   `npm run seed`, or run the seeding command from a protected CI job.
6. In Authentication settings:
   - Disable public sign-ups.
   - Keep email confirmation enabled even though admin-created accounts are confirmed
     server-side.
   - Use the default refresh-token reuse detection.
   - Set an appropriate JWT lifetime and review active sessions when disabling staff.
7. Never place `SUPABASE_SERVICE_ROLE_KEY` in a `NEXT_PUBLIC_` variable. It is used
   only by the login-throttle, seeding, and admin-account server routes.
8. Use the Supabase dashboard backups/PITR appropriate to the event calendar and
   organization’s retention policy. Guest contact data is personal data; define and
   document a deletion/retention policy outside the immutable operational audit period.

The migration enables RLS on every permanent table. Door users cannot query
`event_financial_settings`, `event_settlements`, reservation audit detail, or direct
ledger tables. Their search and mutations run through narrowly scoped PostgreSQL
functions that verify event assignment and active account status.

## Vercel deployment

1. Push this directory to a private Git repository.
2. Import it into Vercel as a Next.js project. Keep the root directory set to this
   application folder if it lives inside a monorepo.
3. Add these environment variables to Production and Preview:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only and marked sensitive)
   - `APP_ORIGIN` (the canonical HTTPS deployment URL)
4. Do not add `SEED_DEFAULT_PASSWORD` to Vercel.
5. Deploy from the protected production branch, or run `vercel --prod`.
6. Add the Vercel production and preview URLs to Supabase Auth redirect allowlists.
7. Test organizer and door accounts separately before the first live event. Install
   the PWA on each entrance phone, open the active event while online to cache the
   guest list, then perform a short airplane-mode sync drill.

Vercel hosts the application; Supabase PostgreSQL remains the one official durable
database. The service worker caches only the application shell. IndexedDB holds a
temporary event guest-list cache and pending entrance operations until they are
idempotently synchronized.

## Operations

- Main organizer home: exactly Add PR Reservation, Add Direct Reservation, Guest
  List, and Door Check-In.
- Emergency CSV: organizers can export the complete event and audit history. Door
  mode exposes a separate financial-free guest-list CSV containing only the fields
  required to keep entrance moving; entrance leads should also download it before
  doors open.
- Corrections never modify ledger rows. They add positive or negative adjustment
  rows with an operator, timestamp, original record, and mandatory reason.
- Event closure changes untouched active reservations to no-show, locks routine
  reservation mutations, calculates the final totals, and writes a versioned immutable
  settlement snapshot. Reopening requires an organizer and a written audited reason.
- A PR attribution is locked by the first check-in. The database rejects later changes.
- Offline idempotency keys are generated once on the phone and are unique in both the
  offline-operation table and the check-in ledger.

## Validation

Run the complete local gate:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The Vitest suite covers the specified settlement arithmetic, actual-versus-reserved
attendance, no-shows, same-event duplicate detection, attribution locks and override
reasons, idempotency/offline replay, corrections, non-revenue attendance, financial
role access, and closed-event edit guards. Database functions and RLS enforce the
same rules in production.
