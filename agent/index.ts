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

  // Usage:
  //   npm start                    → daily, all shows
  //   npm start weekly             → weekly, all shows
  //   npm start hahamikdash        → daily, specific show
  //   npm start weekly hahamikdash → weekly, specific show
  const isWeekly = process.argv[2] === 'weekly'
  const mode = isWeekly ? 'weekly' : 'daily'
  const showSlug = isWeekly ? (process.argv[3] ?? null) : (process.argv[2] ?? null)

  console.log(`[Agent] Mode: ${mode}${showSlug ? `, show: ${showSlug}` : ', all shows'}`)

  await runScheduler(showSlug, mode)
}

main().catch(err => {
  console.error('Agent failed:', err)
  process.exit(1)
})
