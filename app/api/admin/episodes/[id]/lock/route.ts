import { NextRequest, NextResponse } from 'next/server'
import { validateAdminSecret, logAdminAction } from '@/lib/admin'
import { adminClient } from '@/lib/supabase/admin'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = validateAdminSecret(_request)
  if (authError) return authError

  const { id } = await params

  const { error: episodeError } = await adminClient
    .from('episodes')
    .update({ status: 'locked', locked_at: new Date().toISOString() })
    .eq('id', id)

  if (episodeError) return NextResponse.json({ error: episodeError.message }, { status: 500 })

  const { data: lockedQuestions, error: questionsError } = await adminClient
    .from('questions')
    .update({ status: 'locked' })
    .eq('episode_id', id)
    .eq('status', 'open')
    .select('id')

  if (questionsError) return NextResponse.json({ error: questionsError.message }, { status: 500 })

  const lockedCount = lockedQuestions?.length ?? 0

  await logAdminAction('manual_lock_episode', { episode_id: id, locked_questions: lockedCount })

  return NextResponse.json({ locked_questions: lockedCount })
}
