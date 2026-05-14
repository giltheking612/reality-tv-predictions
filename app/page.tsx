import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

interface Show {
  id: string
  name_he: string
  type: string
}

interface Season {
  id: string
  name_he: string
  status: string
  show: Show
}

export default async function HomePage() {
  const supabase = await createClient()

  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, name_he, status, show:shows(id, name_he, type)')
    .eq('status', 'active')

  const { data: shows } = await supabase
    .from('shows')
    .select('id, name_he, type')
    .order('name_he')

  const activeSeasonByShow: Record<string, Season> = {}
  for (const s of (seasons ?? []) as unknown as Season[]) {
    activeSeasonByShow[s.show.id] = s
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">חיזויי ריאליטי</h1>
      <p className="text-gray-500 mb-8">חזה תוצאות, צבור נקודות, עלה בדירוג</p>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {(shows ?? []).map((show: Show) => {
          const activeSeason = activeSeasonByShow[show.id]
          return (
            <div
              key={show.id}
              className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-1">{show.name_he}</h2>
              {activeSeason ? (
                <>
                  <p className="text-sm text-gray-500 mb-4">{activeSeason.name_he}</p>
                  <Link
                    href={`/season/${activeSeason.id}`}
                    className="inline-block bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    לעונה הנוכחית
                  </Link>
                </>
              ) : (
                <p className="text-sm text-gray-400 mt-2">אין עונה פעילה כרגע</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
