# Session 6 — Add More Shows & Per-Show Agent

You are a Senior Engineer. Your job is to add 5 more Israeli reality TV shows and refactor the agent so it can run per-show.

## Step 0 — Read the spec first

Read `ARCHITECTURE.md` in this directory completely before writing any code.

## Your file ownership (touch ONLY these files)

```
supabase/migrations/006_more_shows.sql   ← add 5 new shows
agent/index.ts                           ← accept show slug as CLI arg
agent/scheduler.ts                       ← filter by show slug
```

Do NOT touch any other files.

---

## Task 1 — supabase/migrations/006_more_shows.sql

Add these 5 shows to the `shows` table. Run this migration manually in the Supabase SQL Editor after creating the file.

```sql
INSERT INTO shows (slug, name_he, name_en, type) VALUES
  ('haachim_hagdolim', 'האח הגדול',        'HaAch HaGadol',        'elimination_score'),
  ('survivor',         'שורדים',            'Survivor Israel',       'elimination_score'),
  ('master_chef',      'מאסטר שף',          'MasterChef Israel',     'elimination_score'),
  ('kohav_nolad',      'כוכב נולד',         'Kohav Nolad',           'elimination_score'),
  ('rising_star',      'הכוכב הבא',         'HaKochav HaBa',         'elimination_score')
ON CONFLICT (slug) DO NOTHING;
```

---

## Task 2 — Refactor agent/index.ts to accept a show slug

The user should be able to run:
```bash
node --import tsx/esm index.ts rokdim        # only Rokdim
node --import tsx/esm index.ts ninja         # only Ninja
node --import tsx/esm index.ts haachim_hagdolim  # only HaAch HaGadol
node --import tsx/esm index.ts               # all active shows
```

Update `agent/index.ts`:

```ts
import 'dotenv/config'
import { runScheduler } from './scheduler.js'

async function main() {
  console.log('=== Reality TV Predictions Agent ===')

  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is required')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  if (!process.env.ADMIN_SECRET) throw new Error('ADMIN_SECRET is required')

  const showSlug = process.argv[2] ?? null

  if (showSlug) {
    console.log(`[Agent] Running for show: ${showSlug}`)
  } else {
    console.log('[Agent] Running for all active shows')
  }

  await runScheduler(showSlug)
}

main().catch(err => {
  console.error('Agent failed:', err)
  process.exit(1)
})
```

---

## Task 3 — Update agent/scheduler.ts to filter by show slug

```ts
import { getActiveSeasons, getLockedEpisodesWithUnresolvedQuestions } from './db.js'
import { runEpisodeWatcher } from './episode-watcher.js'
import { runResultSubmitter } from './result-submitter.js'

export async function runScheduler(showSlug: string | null = null) {
  console.log(`[Scheduler] Running at ${new Date().toISOString()}`)

  // Check for locked episodes needing results (filter by show if slug provided)
  const locked = await getLockedEpisodesWithUnresolvedQuestions()
  const filteredLocked = showSlug
    ? locked.filter((e: any) => e.season?.show?.slug === showSlug)
    : locked

  if (filteredLocked.length > 0) {
    console.log(`[Scheduler] Found ${filteredLocked.length} locked episode(s) needing results`)
    await runResultSubmitter(filteredLocked)
  }

  // Get active seasons, filtered by show slug if provided
  const seasons = await getActiveSeasons()
  const filteredSeasons = showSlug
    ? seasons.filter((s: any) => s.show?.slug === showSlug)
    : seasons

  if (filteredSeasons.length === 0) {
    console.log(`[Scheduler] No active seasons found${showSlug ? ` for show: ${showSlug}` : ''}`)
  }

  for (const season of filteredSeasons) {
    await runEpisodeWatcher(season)
  }

  console.log('[Scheduler] Done.')
}
```

---

## Task 4 — Update agent/result-submitter.ts signature

The `runResultSubmitter` function currently fetches locked episodes itself. Update it to accept a pre-filtered list so the scheduler can pass the filtered episodes:

In `agent/result-submitter.ts`, change the function signature from:
```ts
export async function runResultSubmitter()
```
to:
```ts
export async function runResultSubmitter(episodes?: any[])
```

And at the top of the function body, change:
```ts
const episodes = await getLockedEpisodesWithUnresolvedQuestions()
```
to:
```ts
if (!episodes) {
  episodes = await getLockedEpisodesWithUnresolvedQuestions()
}
```

---

## Task 5 — Run the migration

After creating the SQL file, remind the user to run it in Supabase SQL Editor:
```
cat supabase/migrations/006_more_shows.sql
```
Copy the output and paste it into the Supabase SQL Editor at:
https://supabase.com/dashboard/project/ohxmrllddnaqsclljbhf/sql/new

---

## Done Criteria

- `006_more_shows.sql` exists with all 5 shows
- `node --import tsx/esm index.ts rokdim` runs and only processes Rokdim
- `node --import tsx/esm index.ts` still runs all shows
- No other files modified
