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
