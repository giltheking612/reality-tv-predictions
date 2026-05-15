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
