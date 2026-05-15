import Anthropic from '@anthropic-ai/sdk'
import { tools, executeWebSearch } from './tools.js'
import { getLockedEpisodesWithUnresolvedQuestions, submitResult, voidQuestion, logAction } from './db.js'

const client = new Anthropic()

export async function runResultSubmitter(episodes?: any[]) {
  if (!episodes) {
    episodes = await getLockedEpisodesWithUnresolvedQuestions()
  }

  if (episodes.length === 0) {
    console.log('[ResultSubmitter] No locked episodes with unresolved questions.')
    return
  }

  for (const episode of episodes) {
    const unresolvedQuestions = episode.questions?.filter(
      (q: { status: string }) => q.status === 'locked'
    ) ?? []

    if (unresolvedQuestions.length === 0) continue

    console.log(`[ResultSubmitter] Processing episode ${episode.number} of ${episode.season?.show?.name_he}`)

    const systemPrompt = `You are an admin agent for an Israeli reality TV prediction website.
Your job is to find the verified results of a TV episode and submit them to the database.

Show: ${episode.season?.show?.name_he} (${episode.season?.show?.name_en})
Episode: ${episode.number} - ${episode.title_he ?? ''}

CRITICAL RULES:
- You MUST verify each result from at least 2 independent sources before submitting.
- Search in Hebrew for best results.
- If you cannot verify a result with high confidence, void the question instead.
- For numeric answers (times), format as "mm:ss" (e.g. "02:34") for time or plain number for scores.
- For categorical answers, use the exact name as it appears in the question options.
- Never guess. If uncertain, void.

Questions to resolve:
${unresolvedQuestions.map((q: { id: string; text_he: string; type: string; options?: string[] }) =>
  `- ID: ${q.id}\n  Question: ${q.text_he}\n  Type: ${q.type}\n  Options: ${q.options?.join(', ') ?? 'numeric'}`
).join('\n\n')}`

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `Find and submit the results for all unresolved questions for episode ${episode.number} of ${episode.season?.show?.name_he}.`,
      },
    ]

    let response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 8096,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      tools,
      messages,
    })

    while (response.stop_reason === 'tool_use') {
      const toolUses = response.content.filter(b => b.type === 'tool_use')
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const toolUse of toolUses) {
        if (toolUse.type !== 'tool_use') continue
        let result: string

        try {
          if (toolUse.name === 'web_search') {
            const input = toolUse.input as { query: string }
            result = await executeWebSearch(input.query)

          } else if (toolUse.name === 'submit_episode_result') {
            const input = toolUse.input as {
              question_id: string; correct_answer: string;
              confidence: string; sources: string[]
            }
            if (input.confidence === 'medium') {
              console.log(`[ResultSubmitter] Medium confidence on ${input.question_id} — submitting anyway`)
            }
            const res = await submitResult(input.question_id, input.correct_answer)
            await logAction('submit_result', {
              question_id: input.question_id,
              correct_answer: input.correct_answer,
              confidence: input.confidence,
              sources: input.sources,
            })
            result = JSON.stringify(res)

          } else if (toolUse.name === 'void_question') {
            const input = toolUse.input as { question_id: string; reason: string }
            await voidQuestion(input.question_id)
            await logAction('void_question', input)
            result = `Question ${input.question_id} voided: ${input.reason}`

          } else {
            result = `Unknown tool: ${toolUse.name}`
          }
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`
        }

        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result })
      }

      messages.push({ role: 'assistant', content: response.content })
      messages.push({ role: 'user', content: toolResults })

      response = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 8096,
        thinking: { type: 'adaptive' },
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        tools,
        messages,
      })
    }

    const finalText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.type === 'text' ? b.text : '')
      .join('\n')

    console.log(`[ResultSubmitter] Episode ${episode.number} done: ${finalText}`)
  }
}
