import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: episodeId } = await params
  const body = await request.json()
  const { question_id, answer } = body

  if (!question_id || answer === undefined || answer === '') {
    return NextResponse.json({ error: 'Missing question_id or answer' }, { status: 400 })
  }

  const { data: question, error: questionError } = await supabase
    .from('questions')
    .select('*, episode:episodes!inner(id, season_id, status)')
    .eq('id', question_id)
    .eq('episode_id', episodeId)
    .single()

  if (questionError || !question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 })
  }

  const episode = question.episode as { id: string; season_id: string; status: string }

  if (question.status !== 'open') {
    return NextResponse.json({ error: 'question_locked' }, { status: 403 })
  }
  if (episode.status !== 'upcoming') {
    return NextResponse.json({ error: 'episode_locked' }, { status: 403 })
  }

  const seasonId = episode.season_id

  // Get or create wallet with starting balance of 1000 (uses admin client to bypass RLS)
  await adminClient.from('season_wallets').upsert(
    { user_id: user.id, season_id: seasonId, balance: 1000 },
    { onConflict: 'user_id,season_id', ignoreDuplicates: true }
  )

  const { data: wallet, error: walletError } = await adminClient
    .from('season_wallets')
    .select('balance')
    .eq('user_id', user.id)
    .eq('season_id', seasonId)
    .single()

  if (walletError || !wallet) {
    return NextResponse.json({ error: 'Wallet error' }, { status: 500 })
  }

  // Check if prediction already exists — re-submission is a free edit
  const { data: existing } = await supabase
    .from('predictions')
    .select('id')
    .eq('user_id', user.id)
    .eq('question_id', question_id)
    .single()

  if (!existing) {
    if (wallet.balance < question.entry_fee) {
      return NextResponse.json({ error: 'insufficient_balance' }, { status: 422 })
    }

    const { error: deductError } = await adminClient
      .from('season_wallets')
      .update({ balance: wallet.balance - question.entry_fee })
      .eq('user_id', user.id)
      .eq('season_id', seasonId)

    if (deductError) {
      return NextResponse.json({ error: deductError.message }, { status: 500 })
    }
  }

  const { data: prediction, error: predictionError } = await supabase
    .from('predictions')
    .upsert(
      { user_id: user.id, question_id, answer: String(answer), fee_paid: question.entry_fee },
      { onConflict: 'user_id,question_id' }
    )
    .select()
    .single()

  if (predictionError) {
    return NextResponse.json({ error: predictionError.message }, { status: 500 })
  }

  return NextResponse.json(prediction, { status: 201 })
}
