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
