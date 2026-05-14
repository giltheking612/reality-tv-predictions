import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { username } = await params

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('display_name', username)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const { data: wallets } = await supabase
    .from('season_wallets')
    .select('*, season:seasons(*)')
    .eq('user_id', profile.id)

  const { data: allPredictions } = await supabase
    .from('predictions')
    .select('*, question:questions(*, episode:episodes(status))')
    .eq('user_id', profile.id)

  // Only show predictions from locked or completed episodes
  const predictions = (allPredictions ?? []).filter((p) => {
    const ep = (p.question as { episode?: { status: string } } | null)?.episode
    return ep?.status === 'locked' || ep?.status === 'completed'
  })

  return NextResponse.json({
    profile,
    wallets: wallets ?? [],
    predictions,
  })
}
