import { NextRequest, NextResponse } from 'next/server'
import { validateAdminSecret, logAdminAction } from '@/lib/admin'
import { adminClient } from '@/lib/supabase/admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = validateAdminSecret(request)
  if (authError) return authError

  const { id } = await params
  const body = await request.json()
  const { status } = body

  const validStatuses = ['upcoming', 'active', 'completed']
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${validStatuses.join(', ')}` },
      { status: 400 }
    )
  }

  const { data, error } = await adminClient
    .from('seasons')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Season not found' }, { status: 404 })

  await logAdminAction('update_season_status', { season_id: id, status })

  return NextResponse.json(data)
}
