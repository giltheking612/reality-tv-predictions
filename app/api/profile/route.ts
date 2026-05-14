import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { display_name } = body

  if (!display_name || typeof display_name !== 'string') {
    return NextResponse.json({ error: 'Missing display_name' }, { status: 400 })
  }

  // 3–20 chars, no spaces, letters/numbers/underscores (Latin + Hebrew)
  if (!/^[\w֐-׿]{3,20}$/.test(display_name)) {
    return NextResponse.json({ error: 'invalid_display_name' }, { status: 422 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('profiles')
    .update({ display_name })
    .eq('id', user.id)
    .select()
    .single()

  if (updateError) {
    if (updateError.code === '23505') {
      return NextResponse.json({ error: 'display_name_taken' }, { status: 409 })
    }
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json(updated)
}

export async function DELETE(_request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await adminClient.auth.admin.deleteUser(user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.auth.signOut()

  return new NextResponse(null, { status: 204 })
}
