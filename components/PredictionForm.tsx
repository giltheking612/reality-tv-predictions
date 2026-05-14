'use client'

import { useState } from 'react'
import QuestionCard from './QuestionCard'
import type { Question, Prediction } from '@/lib/types'

interface PredictionFormProps {
  questions: Question[]
  initialPredictions: Prediction[]
  episodeId: string
  episodeStatus: 'upcoming' | 'locked' | 'completed'
  initialBalance: number
  allPredictionsByQuestion?: Record<string, { answer: string }[]>
}

export default function PredictionForm({
  questions,
  initialPredictions,
  episodeId,
  episodeStatus,
  initialBalance,
  allPredictionsByQuestion = {},
}: PredictionFormProps) {
  const [balance, setBalance] = useState(initialBalance)
  const [predictions, setPredictions] = useState<Record<string, Prediction | null>>(
    Object.fromEntries(initialPredictions.map((p) => [p.question_id, p]))
  )

  const isLocked = episodeStatus === 'locked' || episodeStatus === 'completed'

  function handleBalanceChange(delta: number) {
    setBalance((prev) => Math.max(0, prev + delta))
  }

  function handlePredictionChange(questionId: string, prediction: Prediction | null) {
    setPredictions((prev) => ({ ...prev, [questionId]: prediction }))
  }

  if (questions.length === 0) {
    return (
      <p className="text-gray-400 text-center py-12">אין שאלות לפרק זה עדיין</p>
    )
  }

  return (
    <div className="space-y-4">
      {!isLocked && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>יתרה: <span className="font-semibold text-gray-800">{balance.toLocaleString('he-IL')}</span> נקודות</span>
          <span>{predictions && Object.values(predictions).filter(Boolean).length} / {questions.length} שאלות נענו</span>
        </div>
      )}
      {questions.map((question) => (
        <QuestionCard
          key={question.id}
          question={question}
          prediction={predictions[question.id] ?? null}
          isLocked={isLocked}
          userBalance={balance}
          episodeId={episodeId}
          onBalanceChange={handleBalanceChange}
          onPredictionChange={(p) => handlePredictionChange(question.id, p)}
          allPredictions={isLocked ? (allPredictionsByQuestion[question.id] ?? []) : undefined}
        />
      ))}
    </div>
  )
}
