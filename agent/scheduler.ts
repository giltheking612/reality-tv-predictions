import { getActiveSeasons, getLockedEpisodesWithUnresolvedQuestions, getShowsWithoutActiveSeason } from './db.js'
import { runEpisodeWatcher } from './episode-watcher.js'
import { runResultSubmitter } from './result-submitter.js'
import { runSeasonWatcher } from './season-watcher.js'

export async function runScheduler(showSlug: string | null = null, mode: 'daily' | 'weekly' = 'daily') {
  console.log(`[Scheduler] Running in ${mode} mode at ${new Date().toISOString()}`)

  if (mode === 'weekly') {
    const shows = await getShowsWithoutActiveSeason()
    const filtered = showSlug ? shows.filter((s: any) => s.slug === showSlug) : shows

    if (filtered.length === 0) {
      console.log(`[Scheduler] All shows have active seasons — nothing to check`)
    }

    for (const show of filtered) {
      await runSeasonWatcher(show)
    }

    console.log('[Scheduler] Done.')
    return
  }

  // Daily mode: resolve locked episode results + watch for new episodes
  const locked = await getLockedEpisodesWithUnresolvedQuestions()
  const filteredLocked = showSlug
    ? locked.filter((e: any) => e.season?.show?.slug === showSlug)
    : locked

  if (filteredLocked.length > 0) {
    console.log(`[Scheduler] Found ${filteredLocked.length} locked episode(s) needing results`)
    await runResultSubmitter(filteredLocked)
  }

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
