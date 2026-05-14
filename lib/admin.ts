import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'

export function validateAdminSecret(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization')
  const secret = process.env.ADMIN_SECRET

  if (!secret) throw new Error('ADMIN_SECRET not configured')

  if (!authHeader || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export async function logAdminAction(action: string, payload: Record<string, unknown>) {
  await adminClient.from('admin_audit_log').insert({ action, payload })
}
