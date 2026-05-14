import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Leaderboard from '@/components/Leaderboard'

interface Episode {
  id: string
  number: number
  title_he: string | null
  status: 'upcoming' | 'locked' | 'completed'
  scheduled_air_time: string
}

const STATUS_LABEL: Record<string, string> = {
  upcoming: 'פתוח',
  locked: 'נעול',
  completed: 'הושלם',
}

const STATUS_COLOR: Record<string, string> = {
  upcoming: 'bg-green-100 text-green-700',
  locked: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-gray-100 text-gray-600',
}

export default async function SeasonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name_he, status, show:shows(name_he), episodes(id, number, title_he, status, scheduled_air_time)')
    .eq('id', id)
    .single()

  if (!season) notFound()

  const { data: wallets } = await supabase
    .from('season_wallets')
    .select('balance, user:profiles(display_name)')
    .eq('season_id', id)
    .order('balance', { ascending: false })

  let currentUserDisplayName: string | undefined
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
    currentUserDisplayName = profile?.display_name ?? undefined
  }

  const episodes: Episode[] = ((season as unknown as { episodes?: Episode[] }).episodes ?? [])
    .sort((a, b) => a.number - b.number)

  const show = (season as unknown as { show?: { name_he: string } }).show

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-gray-400 mb-1">{show?.name_he}</p>
        <h1 className="text-2xl font-bold text-gray-900">{season.name_he}</h1>
      </div>

      <div className="flex gap-8 items-start">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-700 mb-3">פרקים</h2>
          {episodes.length === 0 ? (
            <p className="text-gray-400 text-sm">אין פרקים עדיין</p>
          ) : (
            <div className="space-y-2">
              {episodes.map((ep) => (
                <Link
                  key={ep.id}
                  href={`/episode/${ep.id}`}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all"
                >
                  <div>
                    <span className="font-medium text-gray-900">
                      פרק {ep.number}
                      {ep.title_he && ` — ${ep.title_he}`}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${STATUS_COLOR[ep.status] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {STATUS_LABEL[ep.status] ?? ep.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="w-72 shrink-0">
          <Leaderboard
            wallets={(wallets ?? []) as unknown as { balance: number; user: { display_name: string } | null }[]}
            currentUserDisplayName={currentUserDisplayName}
          />
        </div>
      </div>
    </div>
  )
}
