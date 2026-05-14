import { NextRequest, NextResponse } from 'next/server'
import { validateAdminSecret, logAdminAction } from '@/lib/admin'
import { adminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const authError = validateAdminSecret(request)
  if (authError) return authError

  const body = await request.json()
  const { show_id, number, name_he, start_date } = body

  if (!show_id || !number || !name_he) {
    return NextResponse.json({ error: 'Missing required fields: show_id, number, name_he' }, { status: 400 })
  }

  const { data, error } = await adminClient
    .from('seasons')
    .insert({ show_id, number, name_he, start_date: start_date ?? null, status: 'upcoming' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction('create_season', { season_id: data.id, show_id, number, name_he })

  return NextResponse.json(data, { status: 201 })
}
