import Anthropic from '@anthropic-ai/sdk'
import { tools, executeWebSearch } from './tools.js'
import { createEpisode, createQuestion, logAction } from './db.js'

const client = new Anthropic()

export async function runEpisodeWatcher(season: {
  id: string
  number: number
  name_he: string
  show: { name_he: string; name_en: string; slug: string; type: string }
}) {
  console.log(`[EpisodeWatcher] Running for season: ${season.name_he}`)

  const systemPrompt = `You are an admin agent for an Israeli reality TV prediction website.
Your job is to find the next upcoming episode for a show and set it up in the database.

Show: ${season.show.name_he} (${season.show.name_en})
Show type: ${season.show.type}
Season ID: ${season.id}

Steps:
1. Search the web (in Hebrew) for the broadcast schedule of this show.
2. Find the next episode number and its exact air date and time in Israel.
3. Create the episode in the database using create_episode. Use Israel timezone (Asia/Jerusalem).
4. Create 2-4 prediction questions using create_question. Follow these rules:
   - Always include: "מי ייפל/ייפסל הפרק?" (Who gets eliminated this episode?)
   - For elimination_score shows (Rokdim): include a score prediction for first place
   - For time_trial shows (Ninja): include a time prediction for first place (use numeric type, tolerance_unit=10, max_steps=4)
   - If there's a clear challenge winner question, include it
   - All question text must be in Hebrew
   - Set entry_fee and payout_multiplier based on difficulty (see tool description)
5. Log what you did.

Important: Only create the episode if you can confirm the air date from a reliable source.
If you cannot find a confirmed air date, do nothing and explain why.`

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Find and set up the next episode for ${season.show.name_he}, season ${season.number}.`,
    },
  ]

  let response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
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

        } else if (toolUse.name === 'create_episode') {
          const input = toolUse.input as {
            season_id: string; number: number; title_he: string; scheduled_air_time: string
          }
          const episode = await createEpisode(input)
          await logAction('create_episode', { episode_id: episode.id, ...input })
          result = JSON.stringify(episode)

        } else if (toolUse.name === 'create_question') {
          const input = toolUse.input as Parameters<typeof createQuestion>[0]
          const question = await createQuestion(input)
          await logAction('create_question', { question_id: question.id, ...input })
          result = JSON.stringify(question)

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
      max_tokens: 4096,
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

  console.log(`[EpisodeWatcher] Done: ${finalText}`)
  return finalText
}
