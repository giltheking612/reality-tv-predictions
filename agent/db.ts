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

export async function getShowsWithoutActiveSeason() {
  const { data: allShows, error: showsError } = await db.from('shows').select('*')
  if (showsError) throw showsError

  const { data: activeSeasons, error: seasonsError } = await db
    .from('seasons')
    .select('show_id')
    .eq('status', 'active')
  if (seasonsError) throw seasonsError

  const activeShowIds = new Set((activeSeasons ?? []).map((s: any) => s.show_id))
  return (allShows ?? []).filter((show: any) => !activeShowIds.has(show.id))
}

export async function createSeason(season: {
  show_id: string
  number: number
  name_he: string
  status?: string
  start_date?: string
}) {
  const { data, error } = await db.from('seasons').insert(season).select().single()
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
