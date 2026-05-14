# Session 3 — Backend API & Scoring Engine

You are a Senior Backend Engineer. Your job is to implement all API routes and the scoring logic.

**Prerequisite:** Session 1 must be complete. The project is already scaffolded with Next.js, Supabase clients, migration files, and empty placeholder files.

## Step 0 — Read the spec first

Read `ARCHITECTURE.md` in this directory completely before writing any code.

## Your file ownership (touch ONLY these files)

```
lib/scoring.ts
lib/admin.ts
app/api/seasons/route.ts
app/api/episodes/[id]/route.ts
app/api/episodes/[id]/predictions/route.ts
app/api/predictions/[id]/route.ts
app/api/profile/route.ts
app/api/profile/[username]/route.ts
app/api/admin/seasons/route.ts
app/api/admin/episodes/route.ts
app/api/admin/episodes/[id]/lock/route.ts
app/api/admin/questions/route.ts
app/api/admin/questions/[id]/result/route.ts
app/api/admin/questions/[id]/void/route.ts
```

Do NOT touch `app/` page files, `components/`, `supabase/migrations/`, `middleware.ts`, or any config files.

---

## Task 1 — lib/admin.ts

Admin authentication helper. All admin routes call this before doing anything.

```ts
import { NextRequest, NextResponse } from 'next/server'

export function validateAdminSecret(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization')
  const secret = process.env.ADMIN_SECRET

  if (!secret) throw new Error('ADMIN_SECRET not configured')

  if (!authHeader || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null // null means authorized, continue
}

export async function logAdminAction(
  adminClient: ReturnType<typeof import('@/lib/supabase/admin').adminClient.from>,
  action: string,
  payload: Record<string, unknown>
) {
  // Insert into admin_audit_log
  await (adminClient as any).from('admin_audit_log').insert({ action, payload })
}
```

Note: `logAdminAction` should import `adminClient` from `lib/supabase/admin.ts` and call `.from('admin_audit_log').insert(...)`. Adjust the signature as needed for TypeScript.

---

## Task 2 — lib/scoring.ts

The scoring engine. Pure functions, no DB calls.

```ts
export type QuestionType = 'categorical' | 'numeric'

export interface ScoringParams {
  type: QuestionType
  correctAnswer: string
  userAnswer: string
  feePaid: number
  payoutMultiplier: number
  toleranceUnit?: number   // numeric only
  maxSteps?: number        // numeric only
}

export function calculatePointsReturned(params: ScoringParams): number {
  const { type, correctAnswer, userAnswer, feePaid, payoutMultiplier } = params

  if (type === 'categorical') {
    return userAnswer === correctAnswer
      ? Math.floor(feePaid * payoutMultiplier)
      : 0
  }

  if (type === 'numeric') {
    const { toleranceUnit = 10, maxSteps = 4 } = params
    const correct = parseFloat(correctAnswer)
    const user = parseFloat(userAnswer)

    if (isNaN(correct) || isNaN(user)) return 0

    const stepsOff = Math.floor(Math.abs(user - correct) / toleranceUnit)

    if (stepsOff >= maxSteps) return 0

    const decayFactor = 1 - stepsOff / maxSteps
    return Math.floor(feePaid * payoutMultiplier * decayFactor)
  }

  return 0
}

export function calculateNetChange(pointsReturned: number, feePaid: number): number {
  return pointsReturned - feePaid
}
```

Note: `mm:ss` time strings (e.g. `"02:34"` for Ninja) must be converted to total seconds before scoring. Add a helper:

```ts
export function parseAnswerToNumber(answer: string): number {
  // If format is mm:ss, convert to seconds
  if (/^\d+:\d{2}$/.test(answer)) {
    const [min, sec] = answer.split(':').map(Number)
    return min * 60 + sec
  }
  return parseFloat(answer)
}
```

Update `calculatePointsReturned` for numeric type to use `parseAnswerToNumber` instead of `parseFloat`.

---

## Task 3 — User API Routes

### app/api/seasons/route.ts — GET

Returns all seasons with their show info. Used by the home page.

```ts
// GET /api/seasons
// Query params: ?status=active (optional filter)
// Returns: seasons array with show data
```

Get the authenticated user from the session (use `lib/supabase/server.ts`). Require auth (return 401 if no session).

Query:
```ts
let query = supabase.from('seasons').select('*, show:shows(*)')
if (status) query = query.eq('status', status)
const { data } = await query.order('created_at', { ascending: false })
```

### app/api/episodes/[id]/route.ts — GET

Returns episode + questions + current user's predictions + user's wallet balance for that season.

```ts
// GET /api/episodes/:id
// Returns: { episode, questions, predictions, walletBalance }
```

Steps:
1. Require auth.
2. Fetch episode with season_id.
3. Fetch questions for this episode, ordered by display_order.
4. Fetch user's predictions for these question IDs.
5. Fetch user's season_wallet balance for this episode's season_id.
   - If no wallet exists, return balance as 1000.
6. Return combined object.

### app/api/episodes/[id]/predictions/route.ts — POST

Submit a prediction. Deducts the entry_fee from the wallet.

```ts
// POST /api/episodes/:id/predictions
// Body: { question_id: string, answer: string }
```

Steps:
1. Require auth.
2. Fetch the question. Verify it belongs to this episode, status is 'open', episode status is 'upcoming'.
3. If any check fails → 403 with descriptive Hebrew-friendly error code.
4. Get or create season_wallet for user + season. Use upsert:
   ```ts
   await supabase.from('season_wallets').upsert(
     { user_id, season_id, balance: 1000 },
     { onConflict: 'user_id,season_id', ignoreDuplicates: true }
   )
   ```
5. Fetch wallet balance. If balance < question.entry_fee → 422 `insufficient_balance`.
6. Run both operations (deduct fee + insert prediction) as close to atomic as possible:
   ```ts
   // Deduct fee
   await supabase.from('season_wallets')
     .update({ balance: currentBalance - question.entry_fee })
     .eq('user_id', user_id).eq('season_id', season_id)

   // Upsert prediction (allow re-submission = edit)
   await supabase.from('predictions').upsert({
     user_id, question_id, answer, fee_paid: question.entry_fee
   }, { onConflict: 'user_id,question_id' })
   ```
7. Return the created/updated prediction.

### app/api/predictions/[id]/route.ts — PUT and DELETE

**PUT** (edit prediction):
1. Require auth.
2. Fetch prediction. Verify `prediction.user_id === user.id`.
3. Fetch the question. Verify status is 'open' and episode status is 'upcoming'.
4. Update `predictions.answer` and `updated_at`. Do NOT change fee_paid.
5. Return updated prediction.

**DELETE** (retract prediction):
1. Require auth.
2. Fetch prediction. Verify ownership.
3. Verify question status is 'open' and episode status is 'upcoming'.
4. Delete the prediction.
5. Refund fee_paid to season_wallet:
   ```ts
   await supabase.rpc('increment_wallet_balance', {
     p_user_id: user_id,
     p_season_id: season_id,
     p_amount: prediction.fee_paid
   })
   ```
   Or use a direct update with GREATEST guard. Simpler:
   ```ts
   await supabase.from('season_wallets')
     .update({ balance: currentBalance + prediction.fee_paid })
     .eq('user_id', user_id).eq('season_id', season_id)
   ```
6. Return 204.

### app/api/profile/route.ts — PUT and DELETE

**PUT** (update display_name):
1. Require auth.
2. Body: `{ display_name: string }`.
3. Validate: 3–20 chars, no spaces, only letters/numbers/underscores.
4. Update `profiles.display_name`. If unique constraint fails → 409.
5. Return updated profile.

**DELETE** (delete account):
1. Require auth.
2. Call `supabase.auth.admin.deleteUser(user.id)` using the **admin client** (service role key).
   Cascade deletes handle all data.
3. Sign out the session.
4. Return 204.

### app/api/profile/[username]/route.ts — GET

Returns public profile data.

1. Require auth (the site requires login to view anything).
2. Fetch profile by display_name.
3. Fetch all season_wallets for this user (with season info).
4. Fetch all predictions for this user where the episode is locked or completed (with question info).
5. Return combined object.

---

## Task 4 — Admin API Routes

All admin routes must call `validateAdminSecret(request)` first. Use the **adminClient** from `lib/supabase/admin.ts` (bypasses RLS).

### app/api/admin/seasons/route.ts — POST

```ts
// POST /api/admin/seasons
// Body: { show_id, number, name_he, start_date? }
```

1. Validate admin secret.
2. Insert into seasons with status='upcoming'.
3. Log to admin_audit_log: action='create_season'.
4. Return created season.

### app/api/admin/episodes/route.ts — POST

```ts
// POST /api/admin/episodes
// Body: { season_id, number, title_he?, scheduled_air_time }
```

1. Validate admin secret.
2. Validate scheduled_air_time is a valid future ISO timestamptz.
3. Insert into episodes with status='upcoming'.
4. Log action='create_episode'.
5. Return created episode.

### app/api/admin/episodes/[id]/lock/route.ts — POST

Manually locks an episode and all its open questions.

1. Validate admin secret.
2. Update episode status to 'locked', set locked_at=now().
3. Update all questions with status='open' on this episode → 'locked'.
4. Log action='manual_lock_episode'.
5. Return `{ locked_questions: N }`.

### app/api/admin/questions/route.ts — POST

```ts
// POST /api/admin/questions
// Body: {
//   episode_id, type, text_he, options?, entry_fee,
//   payout_multiplier, tolerance_unit?, max_steps?, display_order?
// }
// Can also accept an array to create multiple questions at once.
```

1. Validate admin secret.
2. Validate: entry_fee > 0, payout_multiplier > 1.
3. If type='numeric': require tolerance_unit and max_steps.
4. If type='categorical': require options (array, min 2 items).
5. Insert question(s).
6. Log action='create_questions'.
7. Return created question(s).

### app/api/admin/questions/[id]/result/route.ts — POST

The most important admin endpoint. Submits a result and triggers point recalculation.

```ts
// POST /api/admin/questions/:id/result
// Body: { correct_answer: string }
```

1. Validate admin secret.
2. Fetch question. Verify status is 'locked' (not open, resolved, or voided).
3. Call Supabase RPC:
   ```ts
   const { data, error } = await adminClient.rpc('resolve_question', {
     p_question_id: questionId,
     p_correct_answer: correctAnswer
   })
   ```
4. If error → return 500 with error details.
5. Log action='submit_result' with payload `{ question_id, correct_answer, ...data }`.
6. Return `{ success: true, resolved: data.resolved, total_points_distributed: data.total_points_distributed }`.

### app/api/admin/questions/[id]/void/route.ts — POST

Voids a question and refunds all entry fees.

1. Validate admin secret.
2. Fetch question. Verify status is 'locked' (only locked questions can be voided; open ones can just be deleted).
3. Get the season_id via the episode.
4. For each prediction on this question:
   a. Set `predictions.points_earned = 0`.
   b. Refund `fee_paid` to `season_wallets.balance` (with GREATEST guard).
5. Set `questions.status = 'voided'`.
6. Log action='void_question'.
7. Return `{ voided: true, refunded_count: N }`.

---

## Important Notes

- Every route that requires auth must return 401 if `supabase.auth.getUser()` returns no user.
- Admin routes use `adminClient` (service role key) for all DB operations. Never use the regular server client for admin routes.
- All error responses: `{ error: string }` with appropriate HTTP status codes.
- All success responses: consistent JSON objects (not just 200 OK with empty body, except 204 for deletes).
- Do not add any logic not described in `ARCHITECTURE.md`.

---

## Done Criteria

- All routes respond correctly (test with `curl` or a REST client).
- Admin routes reject requests without the correct `ADMIN_SECRET`.
- Prediction submission correctly deducts from wallet and enforces lock status.
- `/api/admin/questions/:id/result` correctly triggers the Supabase RPC and updates all wallets.
- Void correctly refunds all predictions.
- No user route bypasses authentication.
