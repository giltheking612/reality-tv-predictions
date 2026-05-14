# Session 5 — AI Admin Agent (Claude API)

You are a Senior Engineer building an automated admin agent using the Claude API.
This agent replaces the manual "open a Claude Code session and do admin tasks" workflow.
It runs on a schedule, finds episode info, verifies results, and updates the database automatically.

## Step 0 — Read the spec first

Read `ARCHITECTURE.md` in this directory completely before writing any code.

## What this agent does

1. **Episode watcher** — Runs before each show's broadcast day. Finds the episode air time, creates the episode in the DB, and generates prediction questions.
2. **Result submitter** — Runs after each episode ends. Verifies the results from multiple web sources, then submits them to the DB via the admin API, triggering automatic point recalculation.

## Your file ownership (touch ONLY these files)

```
agent/index.ts           ← entry point, orchestrates everything
agent/scheduler.ts       ← decides what to run and when
agent/tools.ts           ← Claude tool definitions (web search, DB calls)
agent/episode-watcher.ts ← finds and creates upcoming episodes
agent/result-submitter.ts← verifies and submits episode results
agent/db.ts              ← thin wrapper around Supabase admin client
agent/types.ts           ← agent-specific types
agent/package.json       ← separate package.json for the agent
agent/.env.template      ← env vars needed by the agent
agent/README.md          ← how to run and deploy the agent
```

Do NOT touch the main app files (`app/`, `lib/`, `components/`, `supabase/`).

---

## Step 1 — Set up the agent package

Create `agent/package.json`:

```json
{
  "name": "reality-tv-predictions-agent",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx agent/index.ts",
    "watch": "tsx --watch agent/index.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@supabase/supabase-js": "^2.0.0",
    "tsx": "^4.0.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

Create `agent/.env.template`:
```
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Step 2 — DB wrapper (agent/db.ts)

Thin wrapper around the Supabase admin client. All DB calls in the agent go through here.

```ts
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

export const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function getActiveSeasons() {
  const { data, error } = await db
    .from('seasons')
    .select('*, show:shows(*)')
    .eq('status', 'active')
  if (error) throw error
  return data
}

export async function getUpcomingEpisodes(seasonId: string) {
  const { data, error } = await db
    .from('episodes')
    .select('*')
    .eq('season_id', seasonId)
    .eq('status', 'upcoming')
    .order('number', { ascending: true })
  if (error) throw error
  return data
}

export async function getLockedEpisodesWithUnresolvedQuestions() {
  const { data, error } = await db
    .from('episodes')
    .select('*, season:seasons(*, show:shows(*)), questions(*)')
    .eq('status', 'locked')
    .not('questions.status', 'in', '("resolved","voided")')
  if (error) throw error
  return data ?? []
}

export async function createEpisode(episode: {
  season_id: string
  number: number
  title_he: string
  scheduled_air_time: string
}) {
  const { data, error } = await db.from('episodes').insert(episode).select().single()
  if (error) throw error
  return data
}

export async function createQuestion(question: {
  episode_id: string
  type: 'categorical' | 'numeric'
  text_he: string
  options?: string[]
  entry_fee: number
  payout_multiplier: number
  tolerance_unit?: number
  max_steps?: number
  display_order: number
}) {
  const { data, error } = await db.from('questions').insert(question).select().single()
  if (error) throw error
  return data
}

export async function submitResult(questionId: string, correctAnswer: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const res = await fetch(`${appUrl}/api/admin/questions/${questionId}/result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ADMIN_SECRET}`,
    },
    body: JSON.stringify({ correct_answer: correctAnswer }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to submit result: ${err}`)
  }
  return res.json()
}

export async function voidQuestion(questionId: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const res = await fetch(`${appUrl}/api/admin/questions/${questionId}/void`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.ADMIN_SECRET}` },
  })
  if (!res.ok) throw new Error(`Failed to void question: ${await res.text()}`)
  return res.json()
}

export async function logAction(action: string, payload: Record<string, unknown>) {
  await db.from('admin_audit_log').insert({ action, payload })
}
```

---

## Step 3 — Claude Tool Definitions (agent/tools.ts)

The agent uses Claude with tool use. Define the tools Claude can call:

```ts
import Anthropic from '@anthropic-ai/sdk'

export const tools: Anthropic.Tool[] = [
  {
    name: 'web_search',
    description: 'Search the web for information about Israeli TV shows, episode schedules, and results. Use Hebrew search terms for best results.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The search query. Use Hebrew for Israeli TV content.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'submit_episode_result',
    description: 'Submit a verified result for a question. Only call this after verifying from at least 2 independent sources.',
    input_schema: {
      type: 'object' as const,
      properties: {
        question_id: { type: 'string', description: 'The question UUID' },
        correct_answer: { type: 'string', description: 'The verified correct answer' },
        confidence: {
          type: 'string',
          enum: ['high', 'medium'],
          description: 'high = 2+ sources confirmed. medium = 1 source but very clear.',
        },
        sources: {
          type: 'array',
          items: { type: 'string' },
          description: 'URLs or source descriptions used to verify the answer',
        },
      },
      required: ['question_id', 'correct_answer', 'confidence', 'sources'],
    },
  },
  {
    name: 'void_question',
    description: 'Void a question if the result cannot be verified or the episode was cancelled/changed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        question_id: { type: 'string' },
        reason: { type: 'string', description: 'Why this question is being voided' },
      },
      required: ['question_id', 'reason'],
    },
  },
  {
    name: 'create_episode',
    description: 'Create a new episode in the database with its scheduled air time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        season_id: { type: 'string' },
        number: { type: 'number' },
        title_he: { type: 'string', description: 'Episode title in Hebrew' },
        scheduled_air_time: {
          type: 'string',
          description: 'ISO 8601 datetime string in Israel timezone (Asia/Jerusalem)',
        },
      },
      required: ['season_id', 'number', 'title_he', 'scheduled_air_time'],
    },
  },
  {
    name: 'create_question',
    description: 'Create a prediction question for an episode.',
    input_schema: {
      type: 'object' as const,
      properties: {
        episode_id: { type: 'string' },
        type: { type: 'string', enum: ['categorical', 'numeric'] },
        text_he: { type: 'string', description: 'Question text in Hebrew' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'For categorical questions: array of contestant names in Hebrew',
        },
        entry_fee: {
          type: 'number',
          description: 'Points cost. Easy (2 options, clear favorite): 25-50. Medium (3-8 options): 75-150. Hard (8+ options): 200-500. Numeric: 100-300.',
        },
        payout_multiplier: {
          type: 'number',
          description: 'Payout multiplier if correct. Must be > 1. Easy: 1.8. Medium: 2.5. Hard: 4.0. Numeric: 3.0.',
        },
        tolerance_unit: {
          type: 'number',
          description: 'For numeric only: the unit size for graduated scoring (e.g. 10 for "per 10 seconds")',
        },
        max_steps: {
          type: 'number',
          description: 'For numeric only: how many steps before full loss (recommended: 4)',
        },
        display_order: { type: 'number' },
      },
      required: ['episode_id', 'type', 'text_he', 'entry_fee', 'payout_multiplier', 'display_order'],
    },
  },
]
```

---

## Step 4 — Web Search Implementation

Claude's tool calls include `web_search`. You need to implement the actual search. Use the Brave Search API (free tier: 2,000 queries/month) or Tavily API. If neither is available, implement a fallback using a simple Google search scrape.

Add to `agent/.env.template`:
```
BRAVE_API_KEY=
```

In `agent/tools.ts`, add the handler:

```ts
export async function executeWebSearch(query: string): Promise<string> {
  const apiKey = process.env.BRAVE_API_KEY

  if (!apiKey) {
    return `[Web search not configured - no BRAVE_API_KEY. Query was: "${query}"]`
  }

  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&search_lang=he`,
    { headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey } }
  )

  if (!res.ok) return `Search failed: ${res.statusText}`

  const data = await res.json()
  const results = data.web?.results ?? []

  return results
    .slice(0, 5)
    .map((r: { title: string; description: string; url: string }) =>
      `Title: ${r.title}\nSummary: ${r.description}\nURL: ${r.url}`
    )
    .join('\n\n')
}
```

---

## Step 5 — Episode Watcher (agent/episode-watcher.ts)

Runs before each episode. Asks Claude to find the schedule and create the episode + questions.

```ts
import Anthropic from '@anthropic-ai/sdk'
import { tools, executeWebSearch } from './tools.js'
import { createEpisode, createQuestion, logAction } from './db.js'

const client = new Anthropic()

export async function runEpisodeWatcher(season: {
  id: string
  number: number
  name_he: string
  show: { name_he: string; name_en: string; slug: string; type: string }
}) {
  console.log(`[EpisodeWatcher] Running for season: ${season.name_he}`)

  const systemPrompt = `You are an admin agent for an Israeli reality TV prediction website.
Your job is to find the next upcoming episode for a show and set it up in the database.

Show: ${season.show.name_he} (${season.show.name_en})
Show type: ${season.show.type}
Season ID: ${season.id}

Steps:
1. Search the web (in Hebrew) for the broadcast schedule of this show.
2. Find the next episode number and its exact air date and time in Israel.
3. Create the episode in the database using create_episode. Use Israel timezone (Asia/Jerusalem).
4. Create 2-4 prediction questions using create_question. Follow these rules:
   - Always include: "מי ייפל/ייפסל הפרק?" (Who gets eliminated this episode?)
   - For elimination_score shows (Rokdim): include a score prediction for first place
   - For time_trial shows (Ninja): include a time prediction for first place (use numeric type, tolerance_unit=10, max_steps=4)
   - If there's a clear challenge winner question, include it
   - All question text must be in Hebrew
   - Set entry_fee and payout_multiplier based on difficulty (see tool description)
5. Log what you did.

Important: Only create the episode if you can confirm the air date from a reliable source.
If you cannot find a confirmed air date, do nothing and explain why.`

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Find and set up the next episode for ${season.show.name_he}, season ${season.number}.`,
    },
  ]

  let response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    system: systemPrompt,
    tools,
    messages,
  })

  // Agentic loop
  while (response.stop_reason === 'tool_use') {
    const toolUses = response.content.filter(b => b.type === 'tool_use')
    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const toolUse of toolUses) {
      if (toolUse.type !== 'tool_use') continue
      let result: string

      try {
        if (toolUse.name === 'web_search') {
          const input = toolUse.input as { query: string }
          result = await executeWebSearch(input.query)

        } else if (toolUse.name === 'create_episode') {
          const input = toolUse.input as {
            season_id: string; number: number; title_he: string; scheduled_air_time: string
          }
          const episode = await createEpisode(input)
          await logAction('create_episode', { episode_id: episode.id, ...input })
          result = JSON.stringify(episode)

        } else if (toolUse.name === 'create_question') {
          const input = toolUse.input as Parameters<typeof createQuestion>[0]
          const question = await createQuestion(input)
          await logAction('create_question', { question_id: question.id, ...input })
          result = JSON.stringify(question)

        } else {
          result = `Unknown tool: ${toolUse.name}`
        }
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`
      }

      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result })
    }

    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: toolResults })

    response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    })
  }

  const finalText = response.content
    .filter(b => b.type === 'text')
    .map(b => b.type === 'text' ? b.text : '')
    .join('\n')

  console.log(`[EpisodeWatcher] Done: ${finalText}`)
  return finalText
}
```

---

## Step 6 — Result Submitter (agent/result-submitter.ts)

Runs after each episode ends. Finds locked episodes with unresolved questions, verifies results, submits them.

```ts
import Anthropic from '@anthropic-ai/sdk'
import { tools, executeWebSearch } from './tools.js'
import { getLockedEpisodesWithUnresolvedQuestions, submitResult, voidQuestion, logAction } from './db.js'

const client = new Anthropic()

export async function runResultSubmitter() {
  const episodes = await getLockedEpisodesWithUnresolvedQuestions()

  if (episodes.length === 0) {
    console.log('[ResultSubmitter] No locked episodes with unresolved questions.')
    return
  }

  for (const episode of episodes) {
    const unresolvedQuestions = episode.questions?.filter(
      (q: { status: string }) => q.status === 'locked'
    ) ?? []

    if (unresolvedQuestions.length === 0) continue

    console.log(`[ResultSubmitter] Processing episode ${episode.number} of ${episode.season?.show?.name_he}`)

    const systemPrompt = `You are an admin agent for an Israeli reality TV prediction website.
Your job is to find the verified results of a TV episode and submit them to the database.

Show: ${episode.season?.show?.name_he} (${episode.season?.show?.name_en})
Episode: ${episode.number} - ${episode.title_he ?? ''}

CRITICAL RULES:
- You MUST verify each result from at least 2 independent sources before submitting.
- Search in Hebrew for best results.
- If you cannot verify a result with high confidence, void the question instead.
- For numeric answers (times), format as "mm:ss" (e.g. "02:34") for time or plain number for scores.
- For categorical answers, use the exact name as it appears in the question options.
- Never guess. If uncertain, void.

Questions to resolve:
${unresolvedQuestions.map((q: { id: string; text_he: string; type: string; options?: string[] }) =>
  `- ID: ${q.id}\n  Question: ${q.text_he}\n  Type: ${q.type}\n  Options: ${q.options?.join(', ') ?? 'numeric'}`
).join('\n\n')}`

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `Find and submit the results for all unresolved questions for episode ${episode.number} of ${episode.season?.show?.name_he}.`,
      },
    ]

    let response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 8096,
      system: systemPrompt,
      tools,
      messages,
    })

    while (response.stop_reason === 'tool_use') {
      const toolUses = response.content.filter(b => b.type === 'tool_use')
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const toolUse of toolUses) {
        if (toolUse.type !== 'tool_use') continue
        let result: string

        try {
          if (toolUse.name === 'web_search') {
            const input = toolUse.input as { query: string }
            result = await executeWebSearch(input.query)

          } else if (toolUse.name === 'submit_episode_result') {
            const input = toolUse.input as {
              question_id: string; correct_answer: string;
              confidence: string; sources: string[]
            }
            if (input.confidence === 'medium') {
              console.log(`[ResultSubmitter] Medium confidence on ${input.question_id} — submitting anyway`)
            }
            const res = await submitResult(input.question_id, input.correct_answer)
            await logAction('submit_result', {
              question_id: input.question_id,
              correct_answer: input.correct_answer,
              confidence: input.confidence,
              sources: input.sources,
            })
            result = JSON.stringify(res)

          } else if (toolUse.name === 'void_question') {
            const input = toolUse.input as { question_id: string; reason: string }
            await voidQuestion(input.question_id)
            await logAction('void_question', input)
            result = `Question ${input.question_id} voided: ${input.reason}`

          } else {
            result = `Unknown tool: ${toolUse.name}`
          }
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`
        }

        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result })
      }

      messages.push({ role: 'assistant', content: response.content })
      messages.push({ role: 'user', content: toolResults })

      response = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 8096,
        system: systemPrompt,
        tools,
        messages,
      })
    }

    const finalText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.type === 'text' ? b.text : '')
      .join('\n')

    console.log(`[ResultSubmitter] Episode ${episode.number} done: ${finalText}`)
  }
}
```

---

## Step 7 — Scheduler (agent/scheduler.ts)

Decides what to run based on the current time and DB state.

```ts
import { getActiveSeasons, getLockedEpisodesWithUnresolvedQuestions } from './db.js'
import { runEpisodeWatcher } from './episode-watcher.js'
import { runResultSubmitter } from './result-submitter.js'

export async function runScheduler() {
  console.log(`[Scheduler] Running at ${new Date().toISOString()}`)

  // Always check for locked episodes with unresolved questions first
  const locked = await getLockedEpisodesWithUnresolvedQuestions()
  if (locked.length > 0) {
    console.log(`[Scheduler] Found ${locked.length} locked episode(s) needing results`)
    await runResultSubmitter()
  }

  // Check if we need to set up upcoming episodes
  const seasons = await getActiveSeasons()
  for (const season of seasons) {
    await runEpisodeWatcher(season)
  }

  console.log('[Scheduler] Done.')
}
```

---

## Step 8 — Entry Point (agent/index.ts)

```ts
import 'dotenv/config'
import { runScheduler } from './scheduler.js'

async function main() {
  console.log('=== Reality TV Predictions Agent ===')

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required')
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  }
  if (!process.env.ADMIN_SECRET) {
    throw new Error('ADMIN_SECRET is required')
  }

  await runScheduler()
}

main().catch(err => {
  console.error('Agent failed:', err)
  process.exit(1)
})
```

---

## Step 9 — README (agent/README.md)

Write a README explaining:

1. **Setup:**
   ```bash
   cd agent
   cp .env.template .env
   # Fill in all values in .env
   npm install
   ```

2. **Running manually:**
   ```bash
   npm start
   ```

3. **What env vars are needed and where to get them:**
   - `ANTHROPIC_API_KEY` — from console.anthropic.com
   - `SUPABASE_URL` — from Supabase project settings
   - `SUPABASE_SERVICE_ROLE_KEY` — from Supabase project settings → API
   - `ADMIN_SECRET` — same value as in the main app's `.env.local`
   - `NEXT_PUBLIC_APP_URL` — the deployed Vercel URL (or `http://localhost:3000` for local)
   - `BRAVE_API_KEY` — from brave.com/search/api (free tier is enough)

4. **How to run on a schedule:**
   - Easiest: run `npm start` manually after each episode airs
   - Automated: set up a cron job or GitHub Actions workflow to run it twice per week (matching the show schedule)

5. **Cost estimate:**
   - Each agent run uses ~2,000–5,000 tokens with claude-opus-4-7
   - At current pricing, roughly $0.05–0.15 per episode run
   - A full season (20 episodes × 2 runs each) ≈ $3–6 total

---

## Done Criteria

- `cd agent && npm install` succeeds
- `npm start` runs without errors (even if it finds no active seasons)
- The agent correctly handles the tool loop (doesn't infinite-loop)
- All env var checks are in place
- README is complete and accurate
