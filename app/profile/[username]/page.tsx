import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProfileCard from '@/components/ProfileCard'

interface PredictionWithContext {
  id: string
  answer: string
  fee_paid: number
  points_earned: number | null
  question: {
    id: string
    text_he: string
    correct_answer: string | null
    status: string
    episode: {
      id: string
      number: number
      title_he: string | null
      status: string
      season: {
        id: string
        name_he: string
        show: { name_he: string }
      }
    }
  }
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('display_name', username)
    .single()

  if (!profile) notFound()

  const isOwnProfile = user?.id === profile.id

  const { data: wallets } = await supabase
    .from('season_wallets')
    .select('balance, season:seasons(id, name_he, status, show:shows(name_he))')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })

  const { data: predictionsRaw } = await supabase
    .from('predictions')
    .select(`
      id, answer, fee_paid, points_earned,
      question:questions(
        id, text_he, correct_answer, status,
        episode:episodes(
          id, number, title_he, status,
          season:seasons(id, name_he, show:shows(name_he))
        )
      )
    `)
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })

  const predictions = ((predictionsRaw ?? []) as unknown as PredictionWithContext[]).filter(
    (p) =>
      p.question?.episode?.status === 'locked' ||
      p.question?.episode?.status === 'completed'
  )

  const totalPredictions = predictions.length
  const correctPredictions = predictions.filter(
    (p) => p.question?.correct_answer !== null && p.answer === p.question?.correct_answer
  ).length
  const totalPointsEarned = predictions.reduce((sum, p) => sum + (p.points_earned ?? 0), 0)

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <ProfileCard profile={{ display_name: profile.display_name, avatar_url: profile.avatar_url }} />
      </div>

      {isOwnProfile && wallets && wallets.length > 0 && (
        <div className="mb-6 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-indigo-700 mb-2">יתרות עונה</h3>
          <div className="space-y-1">
            {(wallets as unknown as { balance: number; season: { id: string; name_he: string; show: { name_he: string } } | null }[]).map((w, i) => (
              w.season && (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {w.season.show?.name_he} — {w.season.name_he}
                  </span>
                  <span className="font-semibold text-indigo-700">{w.balance.toLocaleString('he-IL')}</span>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      {totalPredictions > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{totalPredictions}</p>
            <p className="text-xs text-gray-500 mt-1">ניחושים</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{correctPredictions}</p>
            <p className="text-xs text-gray-500 mt-1">נכונים</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold ${totalPointsEarned >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totalPointsEarned >= 0 ? '+' : ''}{totalPointsEarned.toLocaleString('he-IL')}
            </p>
            <p className="text-xs text-gray-500 mt-1">נקודות (רווח/הפסד)</p>
          </div>
        </div>
      )}

      <div>
        <h3 className="font-semibold text-gray-700 mb-3">היסטוריית ניחושים</h3>
        {predictions.length === 0 ? (
          <p className="text-gray-400 text-sm">אין ניחושים עדיין</p>
        ) : (
          <div className="space-y-3">
            {predictions.map((p) => {
              const isCorrect = p.question?.correct_answer !== null && p.answer === p.question?.correct_answer
              const isResolved = p.question?.status === 'resolved'
              const net = (p.points_earned ?? 0) - p.fee_paid

              return (
                <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-sm font-medium text-gray-800 leading-snug">{p.question?.text_he}</p>
                    {isResolved && (
                      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                        isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                      }`}>
                        {isCorrect ? 'נכון' : 'שגוי'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm flex-wrap">
                    <span className="text-gray-600">
                      ניחוש: <span className="font-medium text-gray-900">{p.answer}</span>
                    </span>
                    {isResolved && p.question?.correct_answer && (
                      <span className="text-gray-600">
                        תשובה: <span className="font-medium text-green-700">{p.question.correct_answer}</span>
                      </span>
                    )}
                    {isResolved && (
                      <span className={`font-medium ${net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {net >= 0 ? '+' : ''}{net} נקודות
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5">
                    <Link
                      href={`/episode/${p.question?.episode?.id}`}
                      className="text-xs text-gray-400 hover:text-indigo-500 transition-colors"
                    >
                      {p.question?.episode?.season?.show?.name_he} — {p.question?.episode?.season?.name_he} — פרק {p.question?.episode?.number}
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
