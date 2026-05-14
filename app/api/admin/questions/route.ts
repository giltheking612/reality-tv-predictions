import { NextRequest, NextResponse } from 'next/server'
import { validateAdminSecret, logAdminAction } from '@/lib/admin'
import { adminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const authError = validateAdminSecret(request)
  if (authError) return authError

  const body = await request.json()
  const items: unknown[] = Array.isArray(body) ? body : [body]

  for (const item of items) {
    const q = item as Record<string, unknown>
    const { episode_id, type, text_he, options, entry_fee, payout_multiplier, tolerance_unit, max_steps } = q

    if (!episode_id || !type || !text_he || entry_fee === undefined || payout_multiplier === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if ((entry_fee as number) <= 0) {
      return NextResponse.json({ error: 'entry_fee must be > 0' }, { status: 400 })
    }
    if ((payout_multiplier as number) <= 1) {
      return NextResponse.json({ error: 'payout_multiplier must be > 1' }, { status: 400 })
    }
    if (type === 'numeric' && (!tolerance_unit || !max_steps)) {
      return NextResponse.json({ error: 'Numeric questions require tolerance_unit and max_steps' }, { status: 400 })
    }
    if (type === 'categorical' && (!Array.isArray(options) || (options as unknown[]).length < 2)) {
      return NextResponse.json({ error: 'Categorical questions require at least 2 options' }, { status: 400 })
    }
  }

  const rows = (items as Record<string, unknown>[]).map((q) => ({
    episode_id: q.episode_id,
    type: q.type,
    text_he: q.text_he,
    options: q.options ?? null,
    entry_fee: q.entry_fee,
    payout_multiplier: q.payout_multiplier,
    tolerance_unit: q.tolerance_unit ?? null,
    max_steps: q.max_steps ?? null,
    display_order: (q.display_order as number) ?? 0,
    status: 'open',
  }))

  const { data, error } = await adminClient.from('questions').insert(rows).select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction('create_questions', {
    count: data.length,
    episode_id: rows[0].episode_id as string,
  })

  return NextResponse.json(data, { status: 201 })
}
