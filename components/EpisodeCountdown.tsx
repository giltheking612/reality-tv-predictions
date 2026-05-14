'use client'

import { useEffect, useState } from 'react'

interface EpisodeCountdownProps {
  scheduledAirTime: string
}

export default function EpisodeCountdown({ scheduledAirTime }: EpisodeCountdownProps) {
  const [remaining, setRemaining] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const target = new Date(scheduledAirTime).getTime()

    function tick() {
      const diff = target - Date.now()
      if (diff <= 0) {
        setDone(true)
        setRemaining(0)
      } else {
        setRemaining(diff)
      }
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [scheduledAirTime])

  if (done) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 font-medium text-center">
        הפרק התחיל — ניחושים נעולים
      </div>
    )
  }

  const totalSec = Math.floor(remaining / 1000)
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 flex items-center gap-3">
      <span className="text-indigo-500 text-lg">⏱</span>
      <span className="text-indigo-700 font-medium">
        ניחושים נסגרים בעוד: <span className="font-mono font-bold">{pad(hours)}:{pad(minutes)}:{pad(seconds)}</span>
      </span>
    </div>
  )
}
