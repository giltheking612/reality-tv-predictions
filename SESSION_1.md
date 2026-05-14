# Session 1 — Foundation & Database

You are a Senior Full-Stack Engineer. Your job is to scaffold the entire project skeleton and database.
Sessions 2 and 3 cannot start until you are done. Do not implement any page UI or API logic.

## Step 0 — Read the spec first

Read `ARCHITECTURE.md` in this directory completely before writing any code.

## Your file ownership (touch ONLY these files)

```
package.json
next.config.ts
tsconfig.json
tailwind.config.ts
postcss.config.js
.env.local.template
app/layout.tsx                                        ← skeleton only (nav shell, RTL, font)
middleware.ts                                         ← skeleton only (structure, TODOs)
lib/supabase/client.ts
lib/supabase/server.ts
lib/supabase/admin.ts
supabase/migrations/001_tables.sql
supabase/migrations/002_rls.sql
supabase/migrations/003_triggers.sql
supabase/migrations/004_pgcron.sql
supabase/migrations/005_rpc.sql
```

Plus these empty placeholder files (just `// TODO: Session 2` or `// TODO: Session 3`):

```
app/page.tsx                                          ← TODO Session 2
app/login/page.tsx                                    ← TODO Session 2
app/onboarding/page.tsx                               ← TODO Session 2
app/auth/callback/route.ts                            ← TODO Session 2
app/season/[id]/page.tsx                              ← TODO Session 2
app/episode/[id]/page.tsx                             ← TODO Session 2
app/profile/page.tsx                                  ← TODO Session 2
app/profile/[username]/page.tsx                       ← TODO Session 2
app/api/seasons/route.ts                              ← TODO Session 3
app/api/episodes/[id]/route.ts                        ← TODO Session 3
app/api/episodes/[id]/predictions/route.ts            ← TODO Session 3
app/api/predictions/[id]/route.ts                     ← TODO Session 3
app/api/profile/route.ts                              ← TODO Session 3
app/api/profile/[username]/route.ts                   ← TODO Session 3
app/api/admin/seasons/route.ts                        ← TODO Session 3
app/api/admin/episodes/route.ts                       ← TODO Session 3
app/api/admin/episodes/[id]/lock/route.ts             ← TODO Session 3
app/api/admin/questions/route.ts                      ← TODO Session 3
app/api/admin/questions/[id]/result/route.ts          ← TODO Session 3
app/api/admin/questions/[id]/void/route.ts            ← TODO Session 3
lib/scoring.ts                                        ← TODO Session 3
lib/admin.ts                                          ← TODO Session 3
```

---

## Task 1 — Initialize Next.js Project

```bash
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=false \
  --import-alias="@/*"
```

If the directory already has a `package.json`, skip this and work with what exists.

---

## Task 2 — Tailwind & Font Configuration

Install Rubik font via `next/font/google`. Configure `tailwind.config.ts`:
- Enable RTL support (no plugin needed in Tailwind v3, `rtl:` prefix works natively).
- Extend theme with the Rubik font family as the default sans font.

In `app/layout.tsx`:
- Set `<html lang="he" dir="rtl">`.
- Apply the Rubik font className to `<body>`.
- Include a nav shell placeholder with a site title (Hebrew: "חיזויי ריאליטי") and empty slots for WalletBadge and user menu (leave as `{/* TODO: Session 2 */}`).

---

## Task 3 — Supabase Client Files

### lib/supabase/client.ts
Browser-side Supabase client using `@supabase/ssr`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### lib/supabase/server.ts
Server-side client for Server Components and API Routes (reads cookies):

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
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
}
```

### lib/supabase/admin.ts
Service role client for admin operations (bypasses RLS):

```ts
import { createClient } from '@supabase/supabase-js'

export const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

---

## Task 4 — middleware.ts (skeleton)

Create `middleware.ts` at the project root with the correct structure but leave the display_name check as a TODO:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/auth')

  if (!user && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // TODO: Session 2 — check profiles.display_name, redirect to /onboarding if null

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

---

## Task 5 — .env.local.template

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_SECRET=
```

---

## Task 6 — Database Migrations

### supabase/migrations/001_tables.sql

```sql
-- Shows
CREATE TABLE shows (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text UNIQUE NOT NULL,
  name_he    text NOT NULL,
  name_en    text NOT NULL,
  type       text NOT NULL CHECK (type IN ('elimination_score', 'time_trial')),
  created_at timestamptz DEFAULT now()
);

-- Seasons
CREATE TABLE seasons (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id    uuid NOT NULL REFERENCES shows(id),
  number     int NOT NULL,
  name_he    text NOT NULL,
  status     text NOT NULL DEFAULT 'upcoming'
             CHECK (status IN ('upcoming', 'active', 'completed')),
  start_date date,
  end_date   date,
  created_at timestamptz DEFAULT now(),
  UNIQUE(show_id, number)
);

-- Episodes
CREATE TABLE episodes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id          uuid NOT NULL REFERENCES seasons(id),
  number             int NOT NULL,
  title_he           text,
  scheduled_air_time timestamptz NOT NULL,
  status             text NOT NULL DEFAULT 'upcoming'
                     CHECK (status IN ('upcoming', 'locked', 'completed')),
  locked_at          timestamptz,
  created_at         timestamptz DEFAULT now(),
  UNIQUE(season_id, number)
);

-- Questions
CREATE TABLE questions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id        uuid NOT NULL REFERENCES episodes(id),
  type              text NOT NULL CHECK (type IN ('categorical', 'numeric')),
  text_he           text NOT NULL,
  options           jsonb,
  correct_answer    text,
  entry_fee         int NOT NULL CHECK (entry_fee > 0),
  payout_multiplier numeric(4,2) NOT NULL CHECK (payout_multiplier > 1),
  tolerance_unit    int,
  max_steps         int,
  status            text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'locked', 'resolved', 'voided')),
  display_order     int NOT NULL DEFAULT 0,
  created_at        timestamptz DEFAULT now()
);

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text UNIQUE,
  avatar_url   text,
  created_at   timestamptz DEFAULT now()
);

-- Season wallets (one per user per season)
CREATE TABLE season_wallets (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id),
  balance   int NOT NULL DEFAULT 1000 CHECK (balance >= 0),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, season_id)
);

-- Predictions
CREATE TABLE predictions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_id  uuid NOT NULL REFERENCES questions(id),
  answer       text NOT NULL,
  fee_paid     int NOT NULL,
  points_earned int,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE(user_id, question_id)
);

-- Admin audit log
CREATE TABLE admin_audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action     text NOT NULL,
  payload    jsonb,
  created_at timestamptz DEFAULT now()
);

-- Seed shows
INSERT INTO shows (slug, name_he, name_en, type) VALUES
  ('rokdim', 'רוקדים עם כוכבים', 'Rokdim Im Cochavim', 'elimination_score'),
  ('ninja',  'נינג''ה ישראל',      'Ninja Israel',       'time_trial');
```

### supabase/migrations/002_rls.sql

```sql
-- Enable RLS on all tables
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_wallets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons           ENABLE ROW LEVEL SECURITY;
ALTER TABLE shows             ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log   ENABLE ROW LEVEL SECURITY;

-- profiles: any authenticated user can read; only own row to update
CREATE POLICY "profiles_read"   ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_delete" ON profiles FOR DELETE TO authenticated USING (auth.uid() = id);

-- season_wallets: any authenticated user can read (for leaderboard); no user writes
CREATE POLICY "wallets_read" ON season_wallets FOR SELECT TO authenticated USING (true);

-- predictions: before lock → own only; after lock → all; users write own
CREATE POLICY "predictions_read" ON predictions FOR SELECT TO authenticated
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

-- questions, episodes, seasons, shows: read-only for authenticated users
CREATE POLICY "questions_read" ON questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "episodes_read"  ON episodes  FOR SELECT TO authenticated USING (true);
CREATE POLICY "seasons_read"   ON seasons   FOR SELECT TO authenticated USING (true);
CREATE POLICY "shows_read"     ON shows     FOR SELECT TO authenticated USING (true);

-- admin_audit_log: no user access (service role only)
```

### supabase/migrations/003_triggers.sql

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

### supabase/migrations/004_pgcron.sql

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

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

### supabase/migrations/005_rpc.sql

```sql
CREATE OR REPLACE FUNCTION resolve_question(
  p_question_id uuid,
  p_correct_answer text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_question         questions%ROWTYPE;
  v_prediction       predictions%ROWTYPE;
  v_points_returned  int;
  v_net_change       int;
  v_steps_off        int;
  v_decay_factor     numeric;
  v_season_id        uuid;
  v_total_distributed int := 0;
  v_resolved_count   int := 0;
BEGIN
  -- Fetch and lock the question row
  SELECT * INTO v_question FROM questions WHERE id = p_question_id FOR UPDATE;

  IF v_question.status != 'locked' THEN
    RAISE EXCEPTION 'Question is not in locked state (current: %)', v_question.status;
  END IF;

  -- Resolve the question
  UPDATE questions
  SET status = 'resolved', correct_answer = p_correct_answer
  WHERE id = p_question_id;

  -- Get season_id via episode
  SELECT s.id INTO v_season_id
  FROM episodes e
  JOIN seasons s ON e.season_id = s.id
  WHERE e.id = v_question.episode_id;

  -- Score each prediction
  FOR v_prediction IN
    SELECT * FROM predictions WHERE question_id = p_question_id FOR UPDATE
  LOOP
    IF v_question.type = 'categorical' THEN
      IF v_prediction.answer = p_correct_answer THEN
        v_points_returned := floor(v_prediction.fee_paid * v_question.payout_multiplier);
      ELSE
        v_points_returned := 0;
      END IF;

    ELSIF v_question.type = 'numeric' THEN
      v_steps_off := floor(
        abs(v_prediction.answer::numeric - p_correct_answer::numeric)
        / v_question.tolerance_unit
      );

      IF v_steps_off >= v_question.max_steps THEN
        v_points_returned := 0;
      ELSE
        v_decay_factor := 1.0 - (v_steps_off::numeric / v_question.max_steps);
        v_points_returned := floor(v_prediction.fee_paid * v_question.payout_multiplier * v_decay_factor);
      END IF;
    END IF;

    v_net_change := v_points_returned - v_prediction.fee_paid;

    -- Update prediction
    UPDATE predictions
    SET points_earned = v_net_change
    WHERE id = v_prediction.id;

    -- Update wallet with zero floor
    UPDATE season_wallets
    SET balance = GREATEST(0, balance + v_net_change)
    WHERE user_id = v_prediction.user_id AND season_id = v_season_id;

    v_total_distributed := v_total_distributed + v_points_returned;
    v_resolved_count := v_resolved_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'resolved', v_resolved_count,
    'total_points_distributed', v_total_distributed
  );
END;
$$;
```

---

## Task 7 — Install Dependencies

```bash
npm install @supabase/ssr @supabase/supabase-js
```

---

## Done Criteria

- `npm run build` or `next dev` starts without errors.
- All migration files are present and valid SQL.
- All placeholder files exist.
- No page UI or API logic implemented (that is Sessions 2 and 3).
- Confirm which files were created when done.
