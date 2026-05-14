'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = displayName.trim()

    if (trimmed.length < 3 || trimmed.length > 20) {
      setError('שם המשתמש חייב להיות בין 3 ל-20 תווים')
      return
    }
    if (/\s/.test(trimmed)) {
      setError('שם המשתמש לא יכול להכיל רווחים')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: trimmed }),
      })

      if (res.status === 409) {
        setError('שם המשתמש כבר תפוס, בחר שם אחר')
        return
      }
      if (!res.ok) {
        setError('אירעה שגיאה, נסה שוב')
        return
      }

      router.push('/')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-10 rounded-xl shadow-md max-w-sm w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">ברוך הבא!</h1>
        <p className="text-gray-500 mb-6">בחר שם משתמש להציג בלוח התוצאות</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם משתמש</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="בין 3 ל-20 תווים, ללא רווחים"
              maxLength={20}
              disabled={loading}
              autoFocus
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || displayName.trim().length < 3}
            className="w-full bg-indigo-600 text-white font-medium py-2.5 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'שומר...' : 'המשך'}
          </button>
        </form>
      </div>
    </div>
  )
}
