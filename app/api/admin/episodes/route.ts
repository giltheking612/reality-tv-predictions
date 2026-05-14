import { NextRequest, NextResponse } from 'next/server'
import { validateAdminSecret, logAdminAction } from '@/lib/admin'
import { adminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const authError = validateAdminSecret(request)
  if (authError) return authError

  const body = await request.json()
  const { season_id, number, title_he, scheduled_air_time } = body

  if (!season_id || !number || !scheduled_air_time) {
    return NextResponse.json({ error: 'Missing required fields: season_id, number, scheduled_air_time' }, { status: 400 })
  }

  if (isNaN(Date.parse(scheduled_air_time))) {
    return NextResponse.json({ error: 'Invalid scheduled_air_time' }, { status: 400 })
  }

  const { data, error } = await adminClient
    .from('episodes')
    .insert({ season_id, number, title_he: title_he ?? null, scheduled_air_time, status: 'upcoming' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction('create_episode', { episode_id: data.id, season_id, number, scheduled_air_time })

  return NextResponse.json(data, { status: 201 })
}
