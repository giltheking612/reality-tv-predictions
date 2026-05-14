# Session 4 — Integration, Wiring & End-to-End Testing

You are a Senior Full-Stack Engineer. Sessions 1, 2, and 3 are complete. Your job is to make everything work together end-to-end.

## Step 0 — Read the spec first

Read `ARCHITECTURE.md` in this directory completely before writing any code.

## Step 1 — Audit what was built

Before fixing anything, read every file that Sessions 2 and 3 produced and build a mental model of what they did. Look for:
- Inconsistent import paths between sessions
- API routes that don't match what the frontend is calling
- Missing TypeScript types shared between frontend and backend
- Any file that still has a `// TODO` that blocks functionality

Run:
```bash
grep -r "TODO" app/ lib/ components/ --include="*.ts" --include="*.tsx" -l
```

## Step 2 — Create shared types

Create `lib/types.ts` with TypeScript interfaces matching the database schema exactly. Both sessions may have defined their own local types inconsistently. Consolidate them here:

```ts
export interface Show {
  id: string
  slug: string
  name_he: string
  name_en: string
  type: 'elimination_score' | 'time_trial'
  created_at: string
}

export interface Season {
  id: string
  show_id: string
  number: number
  name_he: string
  status: 'upcoming' | 'active' | 'completed'
  start_date: string | null
  end_date: string | null
  created_at: string
  show?: Show
}

export interface Episode {
  id: string
  season_id: string
  number: number
  title_he: string | null
  scheduled_air_time: string
  status: 'upcoming' | 'locked' | 'completed'
  locked_at: string | null
  created_at: string
}

export interface Question {
  id: string
  episode_id: string
  type: 'categorical' | 'numeric'
  text_he: string
  options: string[] | null
  correct_answer: string | null
  entry_fee: number
  payout_multiplier: number
  tolerance_unit: number | null
  max_steps: number | null
  status: 'open' | 'locked' | 'resolved' | 'voided'
  display_order: number
  created_at: string
}

export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
}

export interface SeasonWallet {
  id: string
  user_id: string
  season_id: string
  balance: number
  created_at: string
  user?: Profile
}

export interface Prediction {
  id: string
  user_id: string
  question_id: string
  answer: string
  fee_paid: number
  points_earned: number | null
  created_at: string
  updated_at: string
}
```

Then update any files in `app/` and `lib/` that define their own local versions of these types to import from `lib/types.ts` instead.

## Step 3 — Fix the middleware

Open `middleware.ts` and verify the display_name check is fully implemented (Session 1 left a TODO stub, Session 2 was supposed to complete it). If it still has a TODO, implement it now:

```ts
// After confirming user exists, check display_name
const { data: profile } = await supabase
  .from('profiles')
  .select('display_name')
  .eq('id', user.id)
  .single()

const isOnboarding = request.nextUrl.pathname === '/onboarding'

if (!profile?.display_name && !isOnboarding) {
  return NextResponse.redirect(new URL('/onboarding', request.url))
}
```

## Step 4 — Fix the CLAUDE.md to add Session 4

Update `CLAUDE.md` to add:
```
- **Session 4** → read `SESSION_4.md` (Integration & Testing — requires Sessions 1-3 done)
```

## Step 5 — Verify the Supabase client is used consistently

Check that:
- Server Components use `lib/supabase/server.ts`
- Client Components use `lib/supabase/client.ts`
- Admin API routes use `lib/supabase/admin.ts`

Fix any mismatches.

## Step 6 — Run the dev server and fix errors

```bash
npm run dev
```

Fix every TypeScript error and every runtime error that appears. Common issues to watch for:
- `cookies()` must be awaited in Next.js 15 — `const cookieStore = await cookies()`
- Missing `'use client'` directives on components that use hooks
- Missing `async` on Server Component functions that use `await`
- Import paths using `../` instead of `@/`

Do not move on until `npm run dev` runs with zero errors in the terminal.

## Step 7 — Walk through the user flow manually

With `npm run dev` running, mentally trace (and fix issues in) each flow:

**Auth flow:**
1. Visit `http://localhost:3000` → should redirect to `/login`
2. Login page renders with Google button
3. After OAuth → `/auth/callback` → redirects to `/onboarding` (first time) or `/` (returning user)
4. Onboarding form saves display_name → redirects to `/`

**Prediction flow:**
1. Home page shows shows/seasons
2. Season page shows leaderboard + episode list
3. Episode page shows questions with entry fees
4. Submitting a prediction deducts from wallet balance (visible in nav)
5. Retracting a prediction refunds the fee

**Admin flow:**
1. `POST /api/admin/questions/:id/result` with correct `Authorization: Bearer <ADMIN_SECRET>` header returns success
2. Without the header → 401

## Step 8 — Check the scoring logic

Open `lib/scoring.ts` and verify:
- `parseAnswerToNumber` handles `"mm:ss"` format correctly
- `calculatePointsReturned` for categorical returns `floor(fee * multiplier)` on correct, 0 on wrong
- `calculatePointsReturned` for numeric uses decay formula correctly
- Edge case: `stepsOff >= maxSteps` returns 0

Write a quick inline test (just `console.log` calls at the bottom of the file, remove after verifying):
```ts
// Temporary sanity check — delete after verifying
console.log(calculatePointsReturned({ type: 'categorical', correctAnswer: 'A', userAnswer: 'A', feePaid: 100, payoutMultiplier: 2.5 })) // expect 250
console.log(calculatePointsReturned({ type: 'categorical', correctAnswer: 'A', userAnswer: 'B', feePaid: 100, payoutMultiplier: 2.5 })) // expect 0
console.log(calculatePointsReturned({ type: 'numeric', correctAnswer: '120', userAnswer: '125', feePaid: 100, payoutMultiplier: 3, toleranceUnit: 10, maxSteps: 4 })) // expect 225 (1 step off, decay=0.75)
console.log(calculatePointsReturned({ type: 'numeric', correctAnswer: '120', userAnswer: '160', feePaid: 100, payoutMultiplier: 3, toleranceUnit: 10, maxSteps: 4 })) // expect 0 (4 steps off = full loss)
```

## Step 9 — Final build check

```bash
npm run build
```

Fix any build errors. The build must succeed with zero errors before you're done.

## Done Criteria

- `npm run build` succeeds with zero errors
- `lib/types.ts` exists and is used consistently
- `middleware.ts` fully implements the display_name check
- No `// TODO` stubs remain in any file that blocks a user flow
- Scoring logic passes the sanity checks
- All Supabase client usages are consistent (server/client/admin)
