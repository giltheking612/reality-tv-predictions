# Session 2 — Frontend (Pages & Components)

You are a Senior Frontend Engineer. Your job is to implement all UI pages and React components.

**Prerequisite:** Session 1 must be complete. The project is already scaffolded with Next.js, Tailwind, Supabase clients, and empty placeholder files.

## Step 0 — Read the spec first

Read `ARCHITECTURE.md` in this directory completely before writing any code.

## Your file ownership (touch ONLY these files)

```
app/layout.tsx
middleware.ts
app/auth/callback/route.ts
app/login/page.tsx
app/onboarding/page.tsx
app/page.tsx
app/season/[id]/page.tsx
app/episode/[id]/page.tsx
app/profile/page.tsx
app/profile/[username]/page.tsx
components/Nav.tsx
components/WalletBadge.tsx
components/EpisodeCountdown.tsx
components/QuestionCard.tsx
components/PredictionForm.tsx
components/Leaderboard.tsx
components/ProfileCard.tsx
```

Do NOT touch `app/api/`, `lib/scoring.ts`, `lib/admin.ts`, `supabase/`, or any config files.

---

## Design Rules

- **Language:** All user-facing text is in Hebrew.
- **Direction:** RTL. The `<html dir="rtl">` is already set by Session 1. Use `rtl:` Tailwind variants only when the default RTL behavior isn't enough.
- **Font:** Rubik (already configured by Session 1). Use it everywhere.
- **Desktop-first:** No mobile optimization needed.
- **Color scheme:** Your choice — pick something clean and dark or light that works well with Hebrew text. Be consistent.
- **No comments** unless the WHY is non-obvious.
- **No features** not specified in ARCHITECTURE.md.

---

## Task 1 — app/layout.tsx

Complete the root layout:

- Persistent top nav bar containing:
  - Site name: "חיזויי ריאליטי" (right side, since RTL)
  - `<WalletBadge />` — shows current season balance (left side)
  - User display_name + "התנתק" (logout) button (left side)
- Logout calls `supabase.auth.signOut()` then redirects to `/login`.
- `<main>` with `max-w-5xl mx-auto px-6 py-8` or similar.
- Import and apply Rubik font.

---

## Task 2 — middleware.ts

Complete the auth guard (Session 1 left a TODO for the display_name check):

1. If no session → redirect to `/login`.
2. If session exists but `profiles.display_name` is null → redirect to `/onboarding`.
3. If already on `/onboarding` and display_name is null → allow through (don't loop).
4. All other routes → allow through.

Use the server Supabase client from `lib/supabase/server.ts`. To check display_name, query:
```ts
const { data: profile } = await supabase
  .from('profiles')
  .select('display_name')
  .eq('id', user.id)
  .single()
```

---

## Task 3 — app/auth/callback/route.ts

Exchanges the OAuth code for a session:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}/`)
}
```

---

## Task 4 — app/login/page.tsx

Simple centered login page:

- Site logo/name: "חיזויי ריאליטי"
- Tagline: "התחבר כדי לחזות ולנצח"
- Google login button: "התחבר עם Google"
- Calls: `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '<origin>/auth/callback' } })`
- This is a client component (`'use client'`).

---

## Task 5 — app/onboarding/page.tsx

Shown once after first login when display_name is not set:

- Title: "ברוך הבא! בחר שם משתמש"
- Single text input for display_name (Hebrew label: "שם משתמש")
- Validation: 3–20 characters, no spaces.
- Submit button: "המשך"
- On submit: `PUT /api/profile` with `{ display_name }`.
- On success: redirect to `/`.
- Show error if display_name is already taken (API returns 409).
- Client component.

---

## Task 6 — app/page.tsx (Home)

Server component. Fetches and displays the list of shows with their active seasons.

Layout:
- Page title: "חיזויי ריאליטי"
- Grid of show cards, one per show (currently: Rokdim, Ninja).
- Each show card shows:
  - Show name in Hebrew
  - Active season name (if any)
  - Button: "לעונה הנוכחית" → links to `/season/[active_season_id]`
  - If no active season: "אין עונה פעילה כרגע"

Fetch: `GET /api/seasons` — the API returns seasons with their show info. Use server-side fetch with Supabase directly:
```ts
const supabase = await createClient()
const { data: seasons } = await supabase
  .from('seasons')
  .select('*, show:shows(*)')
  .eq('status', 'active')
```

---

## Task 7 — app/season/[id]/page.tsx

Server component. Shows the season overview.

Layout (two columns):
- **Left column:** Episode list
  - Sorted by episode number ascending.
  - Each episode: number, title_he, status badge (פתוח / נעול / הושלם), link to `/episode/[id]`.
- **Right column:** `<Leaderboard />` component

Fetch:
```ts
const { data: season } = await supabase
  .from('seasons')
  .select('*, show:shows(*), episodes(*)')
  .eq('id', params.id)
  .single()

const { data: wallets } = await supabase
  .from('season_wallets')
  .select('balance, user:profiles(display_name)')
  .eq('season_id', params.id)
  .order('balance', { ascending: false })
```

---

## Task 8 — app/episode/[id]/page.tsx

This is the main prediction page. Mix of server + client.

Server-side fetch:
- Episode details + questions (ordered by display_order).
- Current user's predictions for this episode.
- User's current season wallet balance.

Layout:
- Episode title and number.
- `<EpisodeCountdown scheduledAirTime={...} />` — if status is 'upcoming'.
- If status is 'locked' or 'completed': show "הפרק נעול" banner.
- List of `<QuestionCard />` for each question, passing:
  - The question data
  - The user's existing prediction (if any)
  - Episode lock status
  - User's wallet balance

---

## Task 9 — app/profile/page.tsx

Own profile page. Redirect to `/profile/[display_name]` using the current user's display_name.

---

## Task 10 — app/profile/[username]/page.tsx

Public profile page.

Layout:
- `<ProfileCard />` with display_name and avatar.
- Season selector (if user participated in multiple seasons).
- Per-season stats: total points earned, correct predictions / total predictions.
- List of past predictions (question text + their answer + correct answer + points earned/lost).
  - Only shows predictions for locked/completed episodes.
- If viewing own profile: show current balance and an edit display_name button.

---

## Task 11 — components/WalletBadge.tsx

Client component. Displays the user's balance for the currently active season.

- Shows: "💰 {balance} נקודות" (or a coin icon via any icon library already in the project).
- Subscribes to Supabase Realtime on `season_wallets` for live updates when points change.
- If user has no wallet for the current season yet: show "1000 נקודות" (starting balance).

---

## Task 12 — components/EpisodeCountdown.tsx

Client component. Takes `scheduledAirTime: string` (ISO timestamptz).

- Shows countdown in format: `שעות:דקות:שניות` until lock.
- Uses `setInterval` (1 second). Cleans up on unmount.
- When countdown reaches 0: shows "הפרק התחיל — ניחושים נעולים" and stops.

---

## Task 13 — components/QuestionCard.tsx

Client component. The core prediction UI.

Props:
```ts
{
  question: Question          // full question object from DB
  prediction: Prediction | null  // user's existing prediction, or null
  isLocked: boolean           // episode locked?
  userBalance: number         // current wallet balance
}
```

Behavior:
- **Categorical question (type='categorical'):**
  - Before lock, no prediction: show option buttons. Each shows the option name and the entry fee cost. Clicking submits the prediction.
  - Before lock, prediction exists: show their chosen option highlighted. "שנה" (Change) and "בטל" (Retract) buttons.
  - After lock: show all options. Highlight the user's pick. If resolved, highlight correct answer in green and wrong answers in red. Show points earned/lost.
- **Numeric question (type='numeric'):**
  - Before lock, no prediction: number/time input + submit button. Show entry fee.
  - Before lock, prediction exists: show their answer + change/retract buttons.
  - After lock, resolved: show correct answer, user's answer, and points earned/lost.
- If user balance < entry_fee and no prediction yet: disable submit, show "אין לך מספיק נקודות".
- If question is voided: show "שאלה זו בוטלה — הנקודות הוחזרו".

API calls:
- Submit: `POST /api/episodes/:episodeId/predictions` with `{ question_id, answer }`.
- Edit: `PUT /api/predictions/:predictionId` with `{ answer }`.
- Retract: `DELETE /api/predictions/:predictionId`.

---

## Task 14 — components/Leaderboard.tsx

Props: `wallets: { balance: number, user: { display_name: string } }[]`

- Renders a ranked table: rank, display_name, balance.
- Ties: both show the same rank number. Within a tie, order alphabetically.
- Highlight the current user's row.
- Column headers: "מקום" | "שם משתמש" | "נקודות"

---

## Task 15 — components/ProfileCard.tsx

Props: `profile: { display_name: string, avatar_url: string | null }`

- Shows avatar (or a default initial-based avatar if null) and display_name.
- Clean card layout.

---

## Done Criteria

- All pages render without errors in `next dev`.
- Login → onboarding → home flow works end-to-end.
- Episode page shows questions and allows prediction submission.
- Leaderboard displays and updates after results.
- All text is in Hebrew.
