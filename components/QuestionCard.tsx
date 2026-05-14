'use client'

import { useState } from 'react'
import type { Question, Prediction } from '@/lib/types'

export type { Question, Prediction }

interface QuestionCardProps {
  question: Question
  prediction: Prediction | null
  isLocked: boolean
  userBalance: number
  episodeId: string
  onBalanceChange: (delta: number) => void
  onPredictionChange: (prediction: Prediction | null) => void
  allPredictions?: { answer: string }[]
}

export default function QuestionCard({
  question,
  prediction: initialPrediction,
  isLocked,
  userBalance,
  episodeId,
  onBalanceChange,
  onPredictionChange,
  allPredictions,
}: QuestionCardProps) {
  const [prediction, setPrediction] = useState<Prediction | null>(initialPrediction)
  const [mode, setMode] = useState<'display' | 'editing'>('display')
  const [inputValue, setInputValue] = useState(initialPrediction?.answer ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const canAfford = userBalance >= question.entry_fee
  const isOpen = !isLocked && question.status === 'open'

  async function handleSubmit(answer: string) {
    if (!answer.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/episodes/${episodeId}/predictions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: question.id, answer }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'אירעה שגיאה')
        return
      }
      const newPrediction: Prediction = await res.json()
      setPrediction(newPrediction)
      onPredictionChange(newPrediction)
      onBalanceChange(-question.entry_fee)
      setMode('display')
    } finally {
      setLoading(false)
    }
  }

  async function handleEdit(answer: string) {
    if (!prediction || !answer.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/predictions/${prediction.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'אירעה שגיאה')
        return
      }
      const updated: Prediction = await res.json()
      setPrediction(updated)
      onPredictionChange(updated)
      setMode('display')
    } finally {
      setLoading(false)
    }
  }

  async function handleRetract() {
    if (!prediction) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/predictions/${prediction.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'אירעה שגיאה')
        return
      }
      onBalanceChange(prediction.fee_paid)
      setPrediction(null)
      onPredictionChange(null)
      setInputValue('')
      setMode('display')
    } finally {
      setLoading(false)
    }
  }

  function countByAnswer(answer: string) {
    return allPredictions?.filter((p) => p.answer === answer).length ?? 0
  }

  const totalPredictions = allPredictions?.length ?? 0

  if (question.status === 'voided') {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 opacity-60">
        <p className="text-sm font-medium text-gray-500 mb-1">שאלה בוטלה</p>
        <p className="text-gray-700">{question.text_he}</p>
        <p className="text-sm text-gray-500 mt-2">שאלה זו בוטלה — הנקודות הוחזרו</p>
      </div>
    )
  }

  const isResolved = question.status === 'resolved'

  function renderPoints() {
    if (!isResolved || !prediction) return null
    const earned = prediction.points_earned ?? 0
    const net = earned - prediction.fee_paid
    return (
      <div className={`mt-2 text-sm font-medium ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
        {net >= 0 ? `+${net}` : net} נקודות
        {earned > 0 && <span className="text-gray-500 font-normal"> (קיבלת {earned})</span>}
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <p className="font-semibold text-gray-900 leading-snug">{question.text_he}</p>
        <span className="shrink-0 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2.5 py-0.5 font-medium">
          {question.entry_fee} נקודות
        </span>
      </div>

      {question.type === 'categorical' && (
        <div className="space-y-2">
          {(question.options ?? []).map((option) => {
            const isSelected = prediction?.answer === option
            const isCorrect = isResolved && question.correct_answer === option
            const isWrong = isResolved && isSelected && question.correct_answer !== option

            let optionClass =
              'w-full text-start px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors'

            if (isCorrect) {
              optionClass += ' bg-green-50 border-green-400 text-green-800'
            } else if (isWrong) {
              optionClass += ' bg-red-50 border-red-400 text-red-800'
            } else if (isSelected && !isResolved) {
              optionClass += ' bg-indigo-50 border-indigo-500 text-indigo-800'
            } else if (isLocked) {
              optionClass += ' bg-gray-50 border-gray-200 text-gray-600'
            } else if (isOpen && !prediction && canAfford) {
              optionClass += ' bg-white border-gray-300 text-gray-700 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer'
            } else {
              optionClass += ' bg-gray-50 border-gray-200 text-gray-500 cursor-default'
            }

            const count = countByAnswer(option)
            const pct = totalPredictions > 0 ? Math.round((count / totalPredictions) * 100) : 0

            return (
              <div key={option}>
                <button
                  className={optionClass}
                  disabled={loading || !isOpen || !!prediction || !canAfford}
                  onClick={() => handleSubmit(option)}
                >
                  <div className="flex items-center justify-between">
                    <span>{option}</span>
                    <div className="flex items-center gap-2">
                      {isLocked && totalPredictions > 0 && (
                        <span className="text-xs text-gray-400">{count} ({pct}%)</span>
                      )}
                      {isCorrect && <span>✓</span>}
                      {isWrong && <span>✗</span>}
                    </div>
                  </div>
                </button>
                {isLocked && totalPredictions > 0 && (
                  <div className="h-1 mt-0.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            )
          })}

          {isOpen && prediction && mode === 'display' && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => { setInputValue(prediction.answer); setMode('editing') }}
                disabled={loading}
                className="text-sm text-indigo-600 hover:underline"
              >
                שנה
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={handleRetract}
                disabled={loading}
                className="text-sm text-red-500 hover:underline"
              >
                בטל ניחוש
              </button>
            </div>
          )}

          {isOpen && prediction && mode === 'editing' && (
            <div className="mt-2 space-y-2">
              {(question.options ?? []).map((option) => (
                <button
                  key={option}
                  className={`w-full text-start px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                    inputValue === option
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-800'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-indigo-400'
                  }`}
                  onClick={() => setInputValue(option)}
                  disabled={loading}
                >
                  {option}
                </button>
              ))}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => handleEdit(inputValue)}
                  disabled={loading || !inputValue}
                  className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  שמור
                </button>
                <button
                  onClick={() => setMode('display')}
                  disabled={loading}
                  className="text-sm text-gray-500 hover:underline"
                >
                  ביטול
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {question.type === 'numeric' && (
        <div>
          {isLocked ? (
            <div className="space-y-1">
              {prediction && (
                <p className="text-sm text-gray-600">
                  הניחוש שלך: <span className="font-medium text-gray-900">{prediction.answer}</span>
                </p>
              )}
              {isResolved && (
                <p className="text-sm text-gray-600">
                  תשובה נכונה: <span className="font-medium text-green-700">{question.correct_answer}</span>
                </p>
              )}
            </div>
          ) : mode === 'display' && prediction ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                הניחוש שלך: <span className="font-medium text-gray-900">{prediction.answer}</span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setInputValue(prediction.answer); setMode('editing') }}
                  disabled={loading}
                  className="text-sm text-indigo-600 hover:underline"
                >
                  שנה
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={handleRetract}
                  disabled={loading}
                  className="text-sm text-red-500 hover:underline"
                >
                  בטל ניחוש
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={question.tolerance_unit ? 'לדוגמה: 02:34' : 'הזן ערך...'}
                disabled={loading || !canAfford}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
              />
              <button
                onClick={() => mode === 'editing' ? handleEdit(inputValue) : handleSubmit(inputValue)}
                disabled={loading || !inputValue.trim() || !canAfford}
                className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '...' : mode === 'editing' ? 'שמור' : 'שלח'}
              </button>
              {mode === 'editing' && (
                <button
                  onClick={() => setMode('display')}
                  disabled={loading}
                  className="text-sm text-gray-500 hover:underline"
                >
                  ביטול
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!canAfford && !prediction && isOpen && (
        <p className="text-sm text-red-500 mt-2">אין לך מספיק נקודות</p>
      )}

      {renderPoints()}

      {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
    </div>
  )
}
