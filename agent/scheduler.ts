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
