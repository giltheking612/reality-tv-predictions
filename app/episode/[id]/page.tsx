import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EpisodeCountdown from '@/components/EpisodeCountdown'
import PredictionForm from '@/components/PredictionForm'
import type { Question, Prediction } from '@/lib/types'

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: episode } = await supabase
    .from('episodes')
    .select(`
      id, number, title_he, status, scheduled_air_time, season_id,
      season:seasons(id, name_he, show:shows(name_he))
    `)
    .eq('id', id)
    .single()

  if (!episode) notFound()

  const { data: questionsRaw } = await supabase
    .from('questions')
    .select('id, episode_id, type, text_he, options, correct_answer, entry_fee, payout_multiplier, tolerance_unit, max_steps, status, display_order')
    .eq('episode_id', id)
    .order('display_order')

  const questions: Question[] = (questionsRaw ?? []) as Question[]

  const { data: predictionsRaw } = await supabase
    .from('predictions')
    .select('id, question_id, answer, fee_paid, points_earned')
    .eq('user_id', user.id)
    .in('question_id', questions.map((q) => q.id))

  const predictions: Prediction[] = (predictionsRaw ?? []) as Prediction[]

  const { data: wallet } = await supabase
    .from('season_wallets')
    .select('balance')
    .eq('user_id', user.id)
    .eq('season_id', episode.season_id)
    .maybeSingle()

  const balance = wallet?.balance ?? 1000

  let allPredictionsByQuestion: Record<string, { answer: string }[]> = {}
  const isLockedOrCompleted = episode.status === 'locked' || episode.status === 'completed'

  if (isLockedOrCompleted && questions.length > 0) {
    const { data: allPreds } = await supabase
      .from('predictions')
      .select('question_id, answer')
      .in('question_id', questions.map((q) => q.id))

    for (const p of allPreds ?? []) {
      if (!allPredictionsByQuestion[p.question_id]) {
        allPredictionsByQuestion[p.question_id] = []
      }
      allPredictionsByQuestion[p.question_id].push({ answer: p.answer })
    }
  }

  const season = (episode as unknown as { season?: { id: string; name_he: string; show?: { name_he: string } } }).season

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
          {season && (
            <>
              <span>{season.show?.name_he}</span>
              <span>›</span>
              <Link href={`/season/${season.id}`} className="hover:text-indigo-500 transition-colors">
                {season.name_he}
              </Link>
              <span>›</span>
            </>
          )}
          <span>פרק {episode.number}</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          פרק {episode.number}
          {episode.title_he && ` — ${episode.title_he}`}
        </h1>
      </div>

      <div className="mb-6">
        {episode.status === 'upcoming' && (
          <EpisodeCountdown scheduledAirTime={episode.scheduled_air_time} />
        )}
        {isLockedOrCompleted && (
          <div className="bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 text-slate-600 font-medium text-center">
            הפרק נעול — הניחושים הוגשו
          </div>
        )}
      </div>

      <PredictionForm
        questions={questions}
        initialPredictions={predictions}
        episodeId={id}
        episodeStatus={episode.status as 'upcoming' | 'locked' | 'completed'}
        initialBalance={balance}
        allPredictionsByQuestion={allPredictionsByQuestion}
      />
    </div>
  )
}
