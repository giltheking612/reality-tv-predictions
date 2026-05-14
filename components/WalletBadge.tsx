'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function WalletBadge() {
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let walletId: string | null = null

    async function fetchBalance() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: activeSeasons } = await supabase
        .from('seasons')
        .select('id')
        .eq('status', 'active')

      if (!activeSeasons?.length) {
        setBalance(1000)
        return
      }

      const { data: wallet } = await supabase
        .from('season_wallets')
        .select('id, balance')
        .eq('user_id', user.id)
        .in('season_id', activeSeasons.map((s: { id: string }) => s.id))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (wallet) {
        walletId = wallet.id
        setBalance(wallet.balance)
      } else {
        setBalance(1000)
      }
    }

    fetchBalance()

    const channel = supabase.channel('wallet-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'season_wallets' },
        (payload) => {
          if (walletId && (payload.new as { id: string }).id === walletId) {
            setBalance((payload.new as { balance: number }).balance)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  if (balance === null) return null

  return (
    <span className="text-sm font-medium text-yellow-300">
      💰 {balance.toLocaleString('he-IL')} נקודות
    </span>
  )
}
