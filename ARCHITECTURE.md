# Reality TV Predictions — Project Blueprint & System Specification

> Non-profit Israeli reality TV fan prediction platform. Virtual points only. No real money, no ads.
> Written for: independent Claude Code sessions that will implement this system from scratch.
> Language: Hebrew UI (RTL). Desktop-first.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [Database Schema](#4-database-schema)
5. [Points & Scoring System](#5-points--scoring-system)
6. [Lock-out Logic](#6-lock-out-logic)
7. [Admin & AI Integration](#7-admin--ai-integration)
8. [API Surface](#8-api-surface)
9. [Frontend Architecture](#9-frontend-architecture)
10. [Authentication & Authorization](#10-authentication--authorization)
11. [RLS Policies](#11-rls-policies)
12. [Deployment & Infrastructure](#12-deployment--infrastructure)
13. [Key Flows](#13-key-flows)
14. [Design Decisions & Rationale](#14-design-decisions--rationale)

---

## 1. Project Overview

A fan website where registered users predict outcomes for Israeli reality TV shows each episode. Users spend virtual points to make predictions, and earn points back (with profit) for correct answers. The platform is non-profit, has no ads, and uses Google OAuth for authentication.

**Shows at launch:**
- רוקדים עם כוכבים (Rokdim Im Cochavim) — elimination + score-based
- נינג'ה ישראל (Ninja Israel) — time-trial based

**Core loop:**
1. Admin/AI creates episode + questions before the episode airs.
2. Users spend points to submit predictions while episode is open.
3. At the scheduled air time, predictions lock automatically.
4. After the episode, the AI submits verified results.
5. Points are calculated and wallets updated automatically.
6. Leaderboard reflects the current season standings.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14+ (App Router) |
| Styling | Tailwind CSS (RTL support via `rtl:` variants) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth — Google OAuth only |
| Backend Logic | Next.js API Routes + Supabase Edge Functions + Supabase pg_cron |
| Hosting | Vercel (Next.js app) |
| DNS / CDN / DDoS | Cloudflare (proxying Vercel) |
| Admin Client | AI agent (separate Claude Code session) with Supabase service role key |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Cloudflare                       │
│              (DNS, CDN, DDoS shield)                │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│                  Vercel (Next.js)                   │
│                                                     │
│   ┌─────────────────────┐  ┌─────────────────────┐  │
│   │   App (RSC + Pages)  │  │   API Routes        │  │
│   │   Hebrew RTL UI      │  │   /api/admin/*      │  │
│   │   Google OAuth       │  │   /api/user/*       │  │
│   └─────────────────────┘  └──────────┬──────────┘  │
└──────────────────────────────────────┼──────────────┘
                                       │
┌──────────────────────────────────────▼──────────────┐
│                    Supabase                         │
│                                                     │
│   PostgreSQL DB      Auth (Google OAuth)            │
│   RLS Policies       Edge Functions                 │
│   pg_cron            Storage (avatars)              │
└─────────────────────────────────────────────────────┘
                        ▲
                        │ Service Role Key (bypasses RLS)
┌───────────────────────┴─────────────────────────────┐
│              AI Agent (Claude Code session)         │
│   - Reads show schedules from Google                │
│   - Creates/updates episodes and questions          │
│   - Submits verified results                        │
│   - Handles season lifecycle                        │
└─────────────────────────────────────────────────────┘
```

---

## 4. Database Schema

### 4.1 `shows`

```sql
CREATE TABLE shows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,              -- 'rokdim', 'ninja'
  name_he     text NOT NULL,                     -- 'רוקדים עם כוכבים'
  name_en     text NOT NULL,                     -- 'Rokdim Im Cochavim'
  type        text NOT NULL                      -- 'elimination_score' | 'time_trial'
              CHECK (type IN ('elimination_score', 'time_trial')),
  created_at  timestamptz DEFAULT now()
);
```

### 4.2 `seasons`

```sql
CREATE TABLE seasons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id     uuid NOT NULL REFERENCES shows(id),
  number      int NOT NULL,
  name_he     text NOT NULL,                     -- 'עונה 1'
  status      text NOT NULL DEFAULT 'upcoming'
              CHECK (status IN ('upcoming', 'active', 'completed')),
  start_date  date,
  end_date    date,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(show_id, number)
);
```

### 4.3 `episodes`

```sql
CREATE TABLE episodes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id           uuid NOT NULL REFERENCES seasons(id),
  number              int NOT NULL,
  title_he            text,
  scheduled_air_time  timestamptz NOT NULL,      -- used for auto-lock trigger
  status              text NOT NULL DEFAULT 'upcoming'
                      CHECK (status IN ('upcoming', 'locked', 'completed')),
  locked_at           timestamptz,
  created_at          timestamptz DEFAULT now(),
  UNIQUE(season_id, number)
);
```

### 4.4 `questions`

```sql
CREATE TABLE questions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id        uuid NOT NULL REFERENCES episodes(id),
  type              text NOT NULL
                    CHECK (type IN ('categorical', 'numeric')),
  text_he           text NOT NULL,               -- question text in Hebrew
  options           jsonb,                        -- categorical only: ["name1", "name2", ...]
  correct_answer    text,                         -- filled after episode resolves
  entry_fee         int NOT NULL,                 -- points cost to answer
  payout_multiplier numeric(4,2) NOT NULL,        -- e.g. 2.50 means 2.5x fee returned if correct
  tolerance_unit    int,                          -- numeric only: 10 = "per 10 seconds/points"
  max_steps         int,                          -- numeric only: steps beyond which full fee is lost
  status            text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'locked', 'resolved', 'voided')),
  display_order     int NOT NULL DEFAULT 0,
  created_at        timestamptz DEFAULT now()
);
```

### 4.5 `profiles`

```sql
CREATE TABLE profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text UNIQUE NOT NULL,
  avatar_url    text,
  created_at    timestamptz DEFAULT now()
);
```

### 4.6 `season_wallets`

Each user gets one wallet per season. Created automatically on first prediction in that season.

```sql
CREATE TABLE season_wallets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  season_id   uuid NOT NULL REFERENCES seasons(id),
  balance     int NOT NULL DEFAULT 1000
              CHECK (balance >= 0),              -- zero floor enforced at DB level
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, season_id)
);
```

### 4.7 `predictions`

```sql
CREATE TABLE predictions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_id   uuid NOT NULL REFERENCES questions(id),
  answer        text NOT NULL,                   -- chosen option string OR numeric value as text
  fee_paid      int NOT NULL,                    -- snapshot of entry_fee at time of prediction
  points_earned int,                             -- null until question resolved; can be negative net
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(user_id, question_id)
);
```

### 4.8 `admin_audit_log`

All AI/admin actions are logged here for accountability.

```sql
CREATE TABLE admin_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action      text NOT NULL,                     -- 'submit_result', 'void_question', 'lock_episode', etc.
  payload     jsonb,
  created_at  timestamptz DEFAULT now()
);
```

---

## 5. Points & Scoring System

### 5.1 Starting Balance

Every user gets **1,000 points** at the start of each season. Points are per-season: a new season is an entirely fresh game. Profile and display name persist across seasons; points do not.

A `season_wallet` row is created with `balance = 1000` when a user makes their first prediction in a season (or can be pre-created when the season activates).

### 5.2 Making a Prediction

When a user submits a prediction on question `q`:

1. Check `season_wallet.balance >= q.entry_fee`. If not, block the action.
2. Deduct `entry_fee` from `season_wallet.balance`.
3. Insert `predictions` row with `fee_paid = q.entry_fee`, `points_earned = null`.
4. Users can edit or retract a prediction for free, before lock:
   - **Edit**: update `predictions.answer`. Fee stays deducted.
   - **Retract**: delete the `predictions` row, refund `entry_fee` to wallet.

### 5.3 Scoring Formula — Categorical Questions

Used for: "Who gets eliminated?", "Who wins first place?"

```
If prediction.answer == correct_answer:
  points_returned = fee_paid × payout_multiplier   (rounded down)
  net_change      = points_returned - fee_paid      (always positive)
Else:
  points_returned = 0
  net_change      = -fee_paid                       (negative, but wallet floors at 0)
```

**Example:** Fee = 100, multiplier = 2.5. Correct → receive 250, net +150. Wrong → net -100.

### 5.4 Scoring Formula — Numeric Questions

Used for: "What will first place's time be?", "What will first place's score be?"

```
steps_off = floor( abs(prediction - correct) / tolerance_unit )

If steps_off >= max_steps:
  points_returned = 0                               (full loss, like wrong answer)
Else:
  decay_factor    = 1 - (steps_off / max_steps)
  points_returned = floor(fee_paid × payout_multiplier × decay_factor)

net_change = points_returned - fee_paid             (can be positive or negative)
```

**Example:** Fee = 100, multiplier = 3.0, tolerance_unit = 10 (seconds), max_steps = 4.
- Exact (0 steps off): return 300, net +200
- 1–9 sec off (1 step): decay = 0.75 → return 225, net +125
- 10–19 sec off (2 steps): decay = 0.50 → return 150, net +50
- 20–29 sec off (3 steps): decay = 0.25 → return 75, net -25
- 30+ sec off (4 steps): return 0, net -100

The numeric answer is stored as text (e.g., `"02:34"` for mm:ss or `"157"` for score). The scoring function parses and compares numerically. The AI/admin sets `tolerance_unit` and `max_steps` per question.

### 5.5 Wallet Update (Zero Floor)

```sql
UPDATE season_wallets
SET balance = GREATEST(0, balance + net_change)
WHERE user_id = ? AND season_id = ?;
```

The `GREATEST(0, ...)` enforces the zero floor. A user cannot go below zero regardless of how many points they lose.

### 5.6 Suggested Fee & Multiplier Ranges (AI Guidance)

| Difficulty | Criteria | Entry Fee | Multiplier | Max Net Gain | Max Net Loss |
|---|---|---|---|---|---|
| Easy | 2 options, clear favorite | 25–50 | 1.8x | ~40 | ~50 |
| Medium | 3–8 options, moderate clarity | 75–150 | 2.5x | ~225 | ~150 |
| Hard | 8+ options, or no clear favorite | 200–500 | 4.0x | ~1,500 | ~500 |
| Numeric | Time/score prediction | 100–300 | 3.0x | varies | varies |

These are guidelines. The AI should adjust based on context.

---

## 6. Lock-out Logic

### 6.1 Automatic Lock (Primary Mechanism)

A Supabase `pg_cron` job runs every minute:

```sql
-- Runs every minute via pg_cron
UPDATE episodes
SET status = 'locked', locked_at = now()
WHERE status = 'upcoming'
  AND scheduled_air_time <= now();

-- Cascade: lock all open questions in locked episodes
UPDATE questions
SET status = 'locked'
WHERE status = 'open'
  AND episode_id IN (
    SELECT id FROM episodes WHERE status = 'locked'
  );
```

### 6.2 Manual Lock (AI Override)

The AI can call `POST /api/admin/episodes/:id/lock` at any time to immediately lock an episode and all its questions. This is used when a schedule changes or the episode starts earlier than expected.

### 6.3 User Experience

- Before lock: users see a countdown timer to the air time.
- After lock: all prediction inputs are disabled. The submitted answers of ALL users become visible (not just their own).
- Attempts to submit/edit after lock: HTTP 403 returned by API. Frontend also blocks the UI.
- Users with insufficient balance to pay the entry fee see the question grayed out with "אין לך מספיק נקודות" (Not enough points).

---

## 7. Admin & AI Integration

### 7.1 The AI Admin Agent

There is no human admin UI. All administrative actions are performed by an AI agent (a separate Claude Code session). The AI authenticates using a `ADMIN_SECRET` header on all `/api/admin/*` routes and uses the Supabase service role key for direct DB operations when needed.

### 7.2 AI Responsibilities

| Task | How |
|---|---|
| Find episode air times | Google search for channel broadcast schedule |
| Create episode + questions | `POST /api/admin/episodes`, `POST /api/admin/questions` |
| Lock episode (if needed early) | `POST /api/admin/episodes/:id/lock` |
| Verify episode results | Google search + cross-reference multiple sources |
| Submit results | `POST /api/admin/questions/:id/result` |
| Void a question | `POST /api/admin/questions/:id/void` |
| Start a new season | `POST /api/admin/seasons` |

### 7.3 Result Verification Protocol (AI-side)

Before submitting any result, the AI must:
1. Search Google for the result (e.g., "נינג'ה ישראל פרק 5 תוצאות").
2. Find at least 2 independent confirming sources.
3. Only then submit. If uncertain, the AI voids the question.

### 7.4 Admin Audit Log

Every admin API call automatically creates an `admin_audit_log` entry with the action type and payload. This provides a full paper trail.

---

## 8. API Surface

All routes are Next.js App Router API routes (`app/api/`).

### 8.1 Authentication Middleware

- **User routes**: validated via Supabase session JWT (cookie-based).
- **Admin routes**: validated via `Authorization: Bearer <ADMIN_SECRET>` header. `ADMIN_SECRET` is an environment variable, never exposed to the frontend.

### 8.2 User Routes

```
GET  /api/seasons                        List active/recent seasons
GET  /api/seasons/:id                    Season detail + leaderboard
GET  /api/episodes/:id                   Episode + questions + user's predictions
POST /api/episodes/:id/predictions       Submit prediction batch for an episode
PUT  /api/predictions/:id               Edit a prediction (before lock only)
DEL  /api/predictions/:id               Retract a prediction (before lock only)
GET  /api/profile/:username             Public profile + prediction history
PUT  /api/profile                       Update own display_name
DEL  /api/profile                       Delete own account (GDPR)
```

### 8.3 Admin Routes

```
POST /api/admin/seasons                  Create a new season
PATCH /api/admin/seasons/:id            Update season status (active → completed)
POST /api/admin/episodes                 Create episode with scheduled_air_time
POST /api/admin/episodes/:id/lock       Manually lock episode
POST /api/admin/questions               Create question(s) for an episode
POST /api/admin/questions/:id/result    Submit result → triggers point recalculation
POST /api/admin/questions/:id/void      Void a question → refund all entry fees
```

### 8.4 Result Submission Flow (Server-side)

`POST /api/admin/questions/:id/result` with body `{ "correct_answer": "..." }`:

1. Validate `ADMIN_SECRET`.
2. Confirm question status is `'locked'` (not already resolved/voided).
3. Call Supabase RPC `resolve_question(question_id, correct_answer)`.
4. RPC function (runs in a transaction):
   a. Set `questions.status = 'resolved'`, `questions.correct_answer = ?`.
   b. For each prediction on this question: calculate `points_earned` using the scoring formula.
   c. Update each `predictions.points_earned`.
   d. Update each user's `season_wallets.balance` with `GREATEST(0, balance + net_change)`.
5. Log to `admin_audit_log`.
6. Return summary: `{ resolved: n, total_points_distributed: X }`.

### 8.5 Void Flow

`POST /api/admin/questions/:id/void`:

1. Validate `ADMIN_SECRET`.
2. Set `questions.status = 'voided'`.
3. For each prediction: refund `fee_paid` to wallet.
4. Set `predictions.points_earned = 0` (no gain, no loss).
5. Log to `admin_audit_log`.

---

## 9. Frontend Architecture

### 9.1 RTL Setup

```html
<!-- app/layout.tsx -->
<html lang="he" dir="rtl">
```

Use **Rubik** or **Heebo** from Google Fonts — both have excellent Hebrew glyph support.

Tailwind RTL: use `rtl:` prefix for directional utilities where needed (e.g., `rtl:text-right`). Tailwind v3+ supports this natively.

### 9.2 Pages & Routes

```
app/
├── layout.tsx                        Root layout (RTL, fonts, nav, auth guard)
├── page.tsx                          Home: list of shows + active seasons
├── login/
│   └── page.tsx                      Google OAuth button
├── onboarding/
│   └── page.tsx                      Set display_name (shown once after first login)
├── season/
│   └── [id]/
│       └── page.tsx                  Season: leaderboard + episode list
├── episode/
│   └── [id]/
│       └── page.tsx                  Episode: questions + prediction form + countdown
├── profile/
│   ├── page.tsx                      Own profile
│   └── [username]/
│       └── page.tsx                  Public profile + prediction history
└── api/
    ├── admin/                        All admin routes (server-side only)
    └── ...                           User routes
```

### 9.3 Auth Guard

A Next.js middleware (`middleware.ts`) redirects unauthenticated users to `/login` for all routes except `/login` itself. After login, if `profiles.display_name` is not set, redirect to `/onboarding`.

```ts
// middleware.ts (pseudocode)
const session = await supabase.auth.getSession()
if (!session) return redirect('/login')
if (!profile.display_name) return redirect('/onboarding')
```

### 9.4 Key UI Components

**Countdown Timer** (`<EpisodeCountdown />`): Shows time remaining until lock. Refreshes every second. Disappears and shows "נעול" (Locked) after air time.

**Prediction Card** (`<QuestionCard />`): 
- Categorical: radio buttons or clickable option cards with contestant names.
- Numeric: number/time input field.
- Shows entry fee prominently.
- If user already submitted: shows their answer and the fee paid.
- After lock: shows all users' answers (public).
- After resolve: shows correct answer, color-coded (green/red), and points earned/lost.

**Leaderboard** (`<Leaderboard />`): Ranked by `season_wallets.balance DESC`. Ties: identical rank shown (both "1st"), ordered alphabetically by `display_name` within the tie.

**Wallet Display** (`<WalletBadge />`): Persistent in the nav bar — shows current season balance.

### 9.5 Data Fetching

Use Next.js Server Components for initial page data (fast, no client JS needed). Use client-side `SWR` or `@supabase/realtime` for:
- The countdown timer.
- Live balance updates after results post.
- Leaderboard refresh after results post.

---

## 10. Authentication & Authorization

### 10.1 Google OAuth Setup

Configure in Supabase Dashboard → Auth → Providers → Google. Set redirect URL to `https://yourdomain.com/auth/callback`.

Create a Supabase Auth callback route:
```
app/auth/callback/route.ts    -- exchanges code for session, redirects to /
```

### 10.2 Profile Creation Trigger

A Supabase database trigger on `auth.users` INSERT creates a row in `profiles` with a null `display_name`, prompting the onboarding flow:

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

### 10.3 Account Deletion (GDPR)

`DELETE /api/profile` calls `supabase.auth.admin.deleteUser(user_id)`. Cascade deletes handle all user data (predictions, wallets, profile) via `ON DELETE CASCADE` FK constraints.

---

## 11. RLS Policies

Row Level Security is enabled on all tables. The service role key (used by the AI agent) bypasses RLS.

```sql
-- profiles: anyone authenticated can read; only own row to write
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_write" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- season_wallets: anyone authenticated can read (for leaderboard); no user writes
ALTER TABLE season_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallets_read" ON season_wallets FOR SELECT TO authenticated USING (true);

-- predictions: before lock → read own only; after lock → read all; users can write own
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "predictions_read_own" ON predictions FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM questions q
      JOIN episodes e ON q.episode_id = e.id
      WHERE q.id = question_id AND e.status IN ('locked', 'completed')
    )
  );
CREATE POLICY "predictions_insert" ON predictions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "predictions_update" ON predictions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "predictions_delete" ON predictions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- questions, episodes, seasons, shows: read-only for users
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questions_read" ON questions FOR SELECT TO authenticated USING (true);
-- (repeat for episodes, seasons, shows)
```

---

## 12. Deployment & Infrastructure

### 12.1 Environment Variables

```bash
# .env.local (Vercel environment variables)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # server-side only, never NEXT_PUBLIC_
ADMIN_SECRET=<random 64-char string>  # shared with AI agent, never NEXT_PUBLIC_
```

### 12.2 Vercel Configuration

- Framework: Next.js
- Build command: `next build`
- Enable Vercel Analytics (optional, privacy-friendly)
- Set all env vars in Vercel Dashboard → Settings → Environment Variables

### 12.3 Cloudflare Configuration

- Add site to Cloudflare, point nameservers.
- Create a CNAME record pointing your domain to `cname.vercel-dns.com`.
- Enable Proxy (orange cloud) for DDoS protection and CDN.
- SSL/TLS: Full (Strict) mode.
- No special Cloudflare Workers needed at launch.

### 12.4 Supabase pg_cron Setup

Enable the `pg_cron` extension in Supabase Dashboard → Database → Extensions.

```sql
-- Schedule auto-lock to run every minute
SELECT cron.schedule(
  'auto-lock-episodes',
  '* * * * *',
  $$
    UPDATE episodes
    SET status = 'locked', locked_at = now()
    WHERE status = 'upcoming' AND scheduled_air_time <= now();

    UPDATE questions
    SET status = 'locked'
    WHERE status = 'open'
      AND episode_id IN (SELECT id FROM episodes WHERE status = 'locked');
  $$
);
```

---

## 13. Key Flows

### 13.1 New Episode Setup (AI Agent)

```
1. AI searches Google for next episode air time.
2. AI calls: POST /api/admin/episodes
   Body: { season_id, number, title_he, scheduled_air_time }
3. For each question: POST /api/admin/questions
   Body: { episode_id, type, text_he, options?, entry_fee, payout_multiplier,
           tolerance_unit?, max_steps? }
4. Questions are now visible with status='open'. Users can start predicting.
```

### 13.2 User Makes a Prediction

```
1. User opens /episode/:id. Server renders questions.
2. User selects an answer and clicks "שלח" (Submit).
3. Client calls POST /api/episodes/:id/predictions
   Body: { question_id, answer }
4. Server:
   a. Verifies session + episode not locked + question not locked.
   b. Verifies wallet balance >= entry_fee.
   c. Deducts entry_fee from season_wallet.balance.
   d. Upserts predictions row.
5. Client shows updated balance + confirmation.
```

### 13.3 Auto-Lock at Air Time

```
1. pg_cron fires at the minute of scheduled_air_time.
2. Episode status → 'locked'. All open questions → 'locked'.
3. All users' prediction answers become publicly visible.
4. Frontend countdown reaches 0, inputs disabled, "נעול" shown.
```

### 13.4 AI Submits Results

```
1. Episode airs. AI verifies results via Google (2+ sources).
2. For each question: POST /api/admin/questions/:id/result
   Body: { correct_answer: "..." }
3. Server calls resolve_question() RPC in a transaction:
   a. Marks question resolved.
   b. Scores all predictions.
   c. Updates all wallets.
4. Frontend: leaderboard updates, prediction cards show green/red + points earned.
```

### 13.5 New Season Start

```
1. Previous season: AI calls PATCH /api/admin/seasons/:id { status: 'completed' }.
2. New season: AI calls POST /api/admin/seasons { show_id, number, name_he, start_date }.
3. On first prediction, season_wallet is created with balance=1000.
   (Or AI can pre-create wallets for all existing users after season creation.)
4. All previous season data remains in DB for historical viewing.
```

---

## 14. Design Decisions & Rationale

| Decision | Rationale |
|---|---|
| No human admin UI | All admin work done by AI agent via API. Simpler surface, no admin auth UI to build or secure. |
| Fee deducted immediately, not on submit | Prevents users from placing placeholder predictions and backing out with no cost. Retract refunds the fee. |
| Zero balance floor in DB constraint | Belt-and-suspenders: `CHECK (balance >= 0)` + `GREATEST(0,...)` in update. Never possible to go negative. |
| pg_cron for auto-lock | Runs inside Supabase, closest to the data. No external scheduler or Vercel Cron needed. Granularity: 1 minute (acceptable). |
| Predictions visible only after lock | Prevents users from copying each other's answers before the episode airs. |
| Per-season leaderboard only | Keeps competition fair across seasons with different difficulty. Historical seasons remain browsable. |
| Season points reset | Each season is a standalone game. New users can compete with veterans every year. |
| Numeric answers stored as text | Handles both `"02:34"` (mm:ss) and `"157"` (score) in one column type. Scoring function parses based on question type. |
| Alphabetical tie-breaking in leaderboard | Both users receive "1st place" in their profile. Alphabetical ordering is neutral and deterministic. |
| Supabase service role key for AI | AI bypasses RLS cleanly. The `ADMIN_SECRET` header on API routes provides a separate authorization layer over the Next.js API. |
| Google OAuth only | No password management, no email verification flows. Simpler and more secure for users. |
| RTL with Tailwind | Tailwind v3+ `rtl:` prefix handles directional overrides. `dir="rtl"` on `<html>` handles most things automatically. |

---

*End of specification. This document is the single source of truth for all implementation sessions.*
