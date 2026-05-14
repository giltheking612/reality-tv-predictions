import { NextRequest, NextResponse } from 'next/server'
import { validateAdminSecret, logAdminAction } from '@/lib/admin'
import { adminClient } from '@/lib/supabase/admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = validateAdminSecret(request)
  if (authError) return authError

  const { id: questionId } = await params

  const { data: question, error: questionError } = await adminClient
    .from('questions')
    .select('status, episode:episodes(season_id)')
    .eq('id', questionId)
    .single()

  if (questionError || !question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 })
  }

  if (question.status !== 'locked') {
    return NextResponse.json(
      { error: `Question is not locked (current: ${question.status})` },
      { status: 422 }
    )
  }

  const ep = Array.isArray(question.episode) ? question.episode[0] : question.episode
  const episode = ep as { season_id: string }
  const seasonId = episode.season_id

  const { data: predictions, error: predError } = await adminClient
    .from('predictions')
    .select('id, user_id, fee_paid')
    .eq('question_id', questionId)

  if (predError) return NextResponse.json({ error: predError.message }, { status: 500 })

  for (const pred of predictions ?? []) {
    await adminClient
      .from('predictions')
      .update({ points_earned: 0 })
      .eq('id', pred.id)

    const { data: wallet } = await adminClient
      .from('season_wallets')
      .select('balance')
      .eq('user_id', pred.user_id)
      .eq('season_id', seasonId)
      .single()

    if (wallet) {
      await adminClient
        .from('season_wallets')
        .update({ balance: wallet.balance + pred.fee_paid })
        .eq('user_id', pred.user_id)
        .eq('season_id', seasonId)
    }
  }

  await adminClient.from('questions').update({ status: 'voided' }).eq('id', questionId)

  const refundedCount = predictions?.length ?? 0

  await logAdminAction('void_question', { question_id: questionId, refunded_count: refundedCount })

  return NextResponse.json({ voided: true, refunded_count: refundedCount })
}
