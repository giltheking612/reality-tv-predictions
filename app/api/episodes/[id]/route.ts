import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: episode, error: episodeError } = await supabase
    .from('episodes')
    .select('*')
    .eq('id', id)
    .single()
  if (episodeError || !episode) return NextResponse.json({ error: 'Episode not found' }, { status: 404 })

  const { data: questions, error: questionsError } = await supabase
    .from('questions')
    .select('*')
    .eq('episode_id', id)
    .order('display_order')
  if (questionsError) return NextResponse.json({ error: questionsError.message }, { status: 500 })

  const questionIds = questions.map((q) => q.id)
  const { data: predictions } = questionIds.length
    ? await supabase.from('predictions').select('*').eq('user_id', user.id).in('question_id', questionIds)
    : { data: [] }

  const { data: wallet } = await supabase
    .from('season_wallets')
    .select('balance')
    .eq('user_id', user.id)
    .eq('season_id', episode.season_id)
    .single()

  return NextResponse.json({
    episode,
    questions,
    predictions: predictions ?? [],
    walletBalance: wallet?.balance ?? 1000,
  })
}
