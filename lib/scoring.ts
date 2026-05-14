export type QuestionType = 'categorical' | 'numeric'

export interface ScoringParams {
  type: QuestionType
  correctAnswer: string
  userAnswer: string
  feePaid: number
  payoutMultiplier: number
  toleranceUnit?: number
  maxSteps?: number
}

export function parseAnswerToNumber(answer: string): number {
  if (/^\d+:\d{2}$/.test(answer)) {
    const [min, sec] = answer.split(':').map(Number)
    return min * 60 + sec
  }
  return parseFloat(answer)
}

export function calculatePointsReturned(params: ScoringParams): number {
  const { type, correctAnswer, userAnswer, feePaid, payoutMultiplier } = params

  if (type === 'categorical') {
    return userAnswer === correctAnswer
      ? Math.floor(feePaid * payoutMultiplier)
      : 0
  }

  if (type === 'numeric') {
    const { toleranceUnit = 10, maxSteps = 4 } = params
    const correct = parseAnswerToNumber(correctAnswer)
    const user = parseAnswerToNumber(userAnswer)

    if (isNaN(correct) || isNaN(user)) return 0

    const diff = Math.abs(user - correct)
    const stepsOff = diff === 0 ? 0 : Math.floor(diff / toleranceUnit) + 1

    if (stepsOff >= maxSteps) return 0

    const decayFactor = 1 - stepsOff / maxSteps
    return Math.floor(feePaid * payoutMultiplier * decayFactor)
  }

  return 0
}

export function calculateNetChange(pointsReturned: number, feePaid: number): number {
  return pointsReturned - feePaid
}
