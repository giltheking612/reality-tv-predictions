import Anthropic from '@anthropic-ai/sdk'

export const tools: Anthropic.Tool[] = [
  {
    name: 'web_search',
    description: 'Search the web for information about Israeli TV shows, episode schedules, and results. Use Hebrew search terms for best results.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The search query. Use Hebrew for Israeli TV content.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'submit_episode_result',
    description: 'Submit a verified result for a question. Only call this after verifying from at least 2 independent sources.',
    input_schema: {
      type: 'object' as const,
      properties: {
        question_id: { type: 'string', description: 'The question UUID' },
        correct_answer: { type: 'string', description: 'The verified correct answer' },
        confidence: {
          type: 'string',
          enum: ['high', 'medium'],
          description: 'high = 2+ sources confirmed. medium = 1 source but very clear.',
        },
        sources: {
          type: 'array',
          items: { type: 'string' },
          description: 'URLs or source descriptions used to verify the answer',
        },
      },
      required: ['question_id', 'correct_answer', 'confidence', 'sources'],
    },
  },
  {
    name: 'void_question',
    description: 'Void a question if the result cannot be verified or the episode was cancelled/changed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        question_id: { type: 'string' },
        reason: { type: 'string', description: 'Why this question is being voided' },
      },
      required: ['question_id', 'reason'],
    },
  },
  {
    name: 'create_episode',
    description: 'Create a new episode in the database with its scheduled air time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        season_id: { type: 'string' },
        number: { type: 'number' },
        title_he: { type: 'string', description: 'Episode title in Hebrew' },
        scheduled_air_time: {
          type: 'string',
          description: 'ISO 8601 datetime string in Israel timezone (Asia/Jerusalem)',
        },
      },
      required: ['season_id', 'number', 'title_he', 'scheduled_air_time'],
    },
  },
  {
    name: 'create_question',
    description: 'Create a prediction question for an episode.',
    input_schema: {
      type: 'object' as const,
      properties: {
        episode_id: { type: 'string' },
        type: { type: 'string', enum: ['categorical', 'numeric'] },
        text_he: { type: 'string', description: 'Question text in Hebrew' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'For categorical questions: array of contestant names in Hebrew',
        },
        entry_fee: {
          type: 'number',
          description: 'Points cost. Easy (2 options, clear favorite): 25-50. Medium (3-8 options): 75-150. Hard (8+ options): 200-500. Numeric: 100-300.',
        },
        payout_multiplier: {
          type: 'number',
          description: 'Payout multiplier if correct. Must be > 1. Easy: 1.8. Medium: 2.5. Hard: 4.0. Numeric: 3.0.',
        },
        tolerance_unit: {
          type: 'number',
          description: 'For numeric only: the unit size for graduated scoring (e.g. 10 for "per 10 seconds")',
        },
        max_steps: {
          type: 'number',
          description: 'For numeric only: how many steps before full loss (recommended: 4)',
        },
        display_order: { type: 'number' },
      },
      required: ['episode_id', 'type', 'text_he', 'entry_fee', 'payout_multiplier', 'display_order'],
    },
  },
]

export async function executeWebSearch(query: string): Promise<string> {
  const apiKey = process.env.BRAVE_API_KEY

  if (!apiKey) {
    return `[Web search not configured - no BRAVE_API_KEY. Query was: "${query}"]`
  }

  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&search_lang=he`,
    { headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey } }
  )

  if (!res.ok) return `Search failed: ${res.statusText}`

  const data = await res.json()
  const results = data.web?.results ?? []

  return results
    .slice(0, 5)
    .map((r: { title: string; description: string; url: string }) =>
      `Title: ${r.title}\nSummary: ${r.description}\nURL: ${r.url}`
    )
    .join('\n\n')
}
