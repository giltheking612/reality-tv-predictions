interface WalletEntry {
  balance: number
  user: { display_name: string } | null
}

interface LeaderboardProps {
  wallets: WalletEntry[]
  currentUserDisplayName?: string
}

export default function Leaderboard({ wallets, currentUserDisplayName }: LeaderboardProps) {
  const sorted = [...wallets]
    .filter((w) => w.user)
    .sort((a, b) => {
      if (b.balance !== a.balance) return b.balance - a.balance
      return (a.user!.display_name).localeCompare(b.user!.display_name, 'he')
    })

  let rank = 1
  const ranked = sorted.map((w, i) => {
    if (i > 0 && sorted[i - 1].balance !== w.balance) rank = i + 1
    return { ...w, rank }
  })

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-gray-200">
        <h2 className="font-semibold text-gray-800">טבלת דירוג</h2>
      </div>
      {ranked.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-8">אין משתתפים עדיין</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 text-start font-medium">מקום</th>
              <th className="px-4 py-2 text-start font-medium">שם משתמש</th>
              <th className="px-4 py-2 text-end font-medium">נקודות</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((w, i) => {
              const isCurrentUser = w.user!.display_name === currentUserDisplayName
              return (
                <tr
                  key={i}
                  className={`border-b border-gray-50 last:border-0 ${
                    isCurrentUser ? 'bg-indigo-50 font-semibold' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-4 py-2.5 text-gray-500">
                    {w.rank <= 3 ? (
                      <span>{w.rank === 1 ? '🥇' : w.rank === 2 ? '🥈' : '🥉'}</span>
                    ) : (
                      <span>{w.rank}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-900">
                    {w.user!.display_name}
                    {isCurrentUser && <span className="text-indigo-400 text-xs me-1"> (אתה)</span>}
                  </td>
                  <td className="px-4 py-2.5 text-end text-gray-800">
                    {w.balance.toLocaleString('he-IL')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
