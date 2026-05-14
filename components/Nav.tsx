'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import WalletBadge from './WalletBadge'

interface NavProps {
  displayName: string
}

export default function Nav({ displayName }: NavProps) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="bg-slate-800 text-white px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <WalletBadge />
        <span className="text-slate-600">|</span>
        <Link href="/profile" className="text-sm text-slate-300 hover:text-white transition-colors">
          {displayName}
        </Link>
        <button
          onClick={handleLogout}
          className="text-sm text-slate-400 hover:text-white transition-colors"
        >
          התנתק
        </button>
      </div>
      <Link href="/" className="text-lg font-bold tracking-tight hover:text-indigo-300 transition-colors">
        חיזויי ריאליטי
      </Link>
    </nav>
  )
}
