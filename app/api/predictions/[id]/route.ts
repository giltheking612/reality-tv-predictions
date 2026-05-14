import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { answer } = body

  if (answer === undefined || answer === '') {
    return NextResponse.json({ error: 'Missing answer' }, { status: 400 })
  }

  const { data: prediction, error: predError } = await supabase
    .from('predictions')
    .select('*, question:questions(status, episode:episodes(status))')
    .eq('id', id)
    .single()

  if (predError || !prediction) {
    return NextResponse.json({ error: 'Prediction not found' }, { status: 404 })
  }

  if (prediction.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const question = prediction.question as { status: string; episode: { status: string } }

  if (question.status !== 'open') {
    return NextResponse.json({ error: 'question_locked' }, { status: 403 })
  }
  if (question.episode.status !== 'upcoming') {
    return NextResponse.json({ error: 'episode_locked' }, { status: 403 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('predictions')
    .update({ answer: String(answer), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: prediction, error: predError } = await supabase
    .from('predictions')
    .select('*, question:questions(status, episode:episodes(season_id, status))')
    .eq('id', id)
    .single()

  if (predError || !prediction) {
    return NextResponse.json({ error: 'Prediction not found' }, { status: 404 })
  }

  if (prediction.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const question = prediction.question as {
    status: string
    episode: { season_id: string; status: string }
  }

  if (question.status !== 'open') {
    return NextResponse.json({ error: 'question_locked' }, { status: 403 })
  }
  if (question.episode.status !== 'upcoming') {
    return NextResponse.json({ error: 'episode_locked' }, { status: 403 })
  }

  const { error: deleteError } = await supabase.from('predictions').delete().eq('id', id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  // Refund fee to wallet
  const seasonId = question.episode.season_id
  const { data: wallet } = await supabase
    .from('season_wallets')
    .select('balance')
    .eq('user_id', user.id)
    .eq('season_id', seasonId)
    .single()

  if (wallet) {
    await supabase
      .from('season_wallets')
      .update({ balance: wallet.balance + prediction.fee_paid })
      .eq('user_id', user.id)
      .eq('season_id', seasonId)
  }

  return new NextResponse(null, { status: 204 })
}
