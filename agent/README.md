# Reality TV Predictions — AI Admin Agent

Automated admin agent that finds episode air times, creates prediction questions, verifies results, and submits them via the admin API.

## Setup

```bash
cd agent
cp .env.template .env
# Fill in all values in .env
npm install
```

## Running manually

```bash
npm start
```

## Environment variables

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `SUPABASE_URL` | Supabase project settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings → API → service_role key |
| `ADMIN_SECRET` | Same value as in the main app's `.env.local` |
| `NEXT_PUBLIC_APP_URL` | Deployed Vercel URL (or `http://localhost:3000` for local dev) |
| `BRAVE_API_KEY` | [brave.com/search/api](https://brave.com/search/api) — free tier (2,000 queries/month) is enough |

## How to run on a schedule

**Manual (simplest):** Run `npm start` manually after each episode airs.

**Automated:** Set up a cron job or GitHub Actions workflow to run twice per week, matching the show broadcast schedule (e.g. Friday night after the show ends). Example cron: `30 23 * * 5` (Friday at 23:30 Israel time).

## What it does

Each run:
1. Checks for locked episodes with unresolved questions → verifies results from multiple web sources → submits them (triggering automatic point recalculation for all users).
2. Checks active seasons for upcoming episodes → finds next air time → creates the episode and 2–4 prediction questions in the DB.

## Cost estimate

- Each run: ~2,000–5,000 tokens with `claude-opus-4-7`
- Prompt caching reduces repeated system-prompt costs by ~90%
- Per episode: roughly $0.05–0.15
- Full season (20 episodes × 2 runs): ≈ $3–6 total
