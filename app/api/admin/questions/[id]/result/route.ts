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
  const body = await request.json()
  const { correct_answer } = body

  if (!correct_answer) {
    return NextResponse.json({ error: 'Missing correct_answer' }, { status: 400 })
  }

  const { data: question, error: questionError } = await adminClient
    .from('questions')
    .select('status')
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

  const { data, error } = await adminClient.rpc('resolve_question', {
    p_question_id: questionId,
    p_correct_answer: correct_answer,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = data as { resolved: number; total_points_distributed: number }

  await logAdminAction('submit_result', {
    question_id: questionId,
    correct_answer,
    resolved: result.resolved,
    total_points_distributed: result.total_points_distributed,
  })

  return NextResponse.json({
    success: true,
    resolved: result.resolved,
    total_points_distributed: result.total_points_distributed,
  })
}
